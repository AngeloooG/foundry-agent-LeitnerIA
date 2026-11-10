using System.ClientModel;
using System.Runtime.CompilerServices;
using Azure.AI.Extensions.OpenAI;
using Azure.AI.Projects;
using Azure.AI.Projects.Agents;
using Azure.Core;
using Azure.Identity;
using Microsoft.Identity.Client;
using Microsoft.Identity.Web;
using OpenAI.Files;
using OpenAI.Responses;
using WebApp.Api.Models;
using WebApp.Api.Security;
using WebApp.Api.Services.Attachments;

namespace WebApp.Api.Services;

#pragma warning disable OPENAI001

/// <summary>
/// Foundry Agent Service using v2 Agents API.
/// </summary>
/// <remarks>
/// Uses AIProjectClient directly (Azure.AI.Projects GA): AgentAdministrationClient for agent
/// metadata and ProjectResponsesClient for streaming (required for annotations, MCP approvals).
/// Every conversation operation takes the caller's owner id (Entra <c>oid</c>) and enforces
/// ownership through <see cref="ConversationOwnership"/>.
/// See .github/skills/researching-azure-ai-sdk/SKILL.md for SDK patterns.
/// </remarks>
public class AgentFrameworkService
{
    private readonly string _agentEndpoint;
    private readonly string _agentId;
    /// <summary>
    /// Optional concrete agent version id (e.g. "3") from <c>AI_AGENT_VERSION</c>.
    /// When set, the agent is pinned to that immutable version for both metadata and streaming.
    /// When null, the newest published version is resolved once per process and used consistently.
    /// </summary>
    private readonly string? _configuredAgentVersion;
    private readonly ILogger<AgentFrameworkService> _logger;
    private readonly IHttpContextAccessor? _httpContextAccessor;
    private readonly string? _backendClientId;
    private readonly string? _tenantId;
    private readonly bool _useObo;
    private readonly TokenCredential _appCredential;

    // Agent metadata cache (static - shared across requests)
    private static ProjectsAgentVersion? s_cachedAgentVersion;
    private static AgentMetadataResponse? s_cachedMetadata;
    private static readonly SemaphoreSlim s_agentLock = new(1, 1);
    // MI assertion cache (static - user-independent, safe to share across requests)
    private static ManagedIdentityClientAssertion? s_miAssertion;
    private static readonly Lock s_miAssertionLock = new();

    /// <summary>
    /// Prefix applied to image files this web app uploads to the Foundry Files API,
    /// used by <see cref="UploadedFilesCleanupService"/> to scope deletes to files owned by this app.
    /// </summary>
    public const string WebAppUploadFilenamePrefix = "webapp-upload-";

    /// <summary>Upper bound of conversations scanned when listing a user's conversations.</summary>
    private const int MaxConversationsScanned = 500;

    // Per-request project client
    private AIProjectClient? _projectClient;
    private ResponseTokenUsage? _lastUsage;

    public AgentFrameworkService(
        IConfiguration configuration,
        IHostEnvironment environment,
        ILogger<AgentFrameworkService> logger,
        IHttpContextAccessor? httpContextAccessor = null)
    {
        _logger = logger;
        _httpContextAccessor = httpContextAccessor;

        _agentEndpoint = configuration["AI_AGENT_ENDPOINT"]
            ?? throw new InvalidOperationException("AI_AGENT_ENDPOINT is not configured");

        _agentId = configuration["AI_AGENT_ID"]
            ?? throw new InvalidOperationException("AI_AGENT_ID is not configured");

        _configuredAgentVersion = string.IsNullOrWhiteSpace(configuration["AI_AGENT_VERSION"])
            ? null
            : configuration["AI_AGENT_VERSION"];

        _backendClientId = configuration["ENTRA_BACKEND_CLIENT_ID"];
        _tenantId = configuration["ENTRA_TENANT_ID"] ?? configuration["AzureAd:TenantId"];
        var managedIdentityClientId = FoundryCredentialFactory.GetManagedIdentityClientId(configuration);

        // OBO is available only outside Development and when the backend app registration is configured.
        _useObo = !string.IsNullOrEmpty(_backendClientId)
                  && !string.IsNullOrEmpty(_tenantId)
                  && !environment.IsDevelopment();

        _appCredential = FoundryCredentialFactory.CreateAppCredential(configuration, environment);

        if (_useObo)
        {
            if (string.IsNullOrEmpty(managedIdentityClientId))
            {
                throw new InvalidOperationException(
                    "OBO mode requires MANAGED_IDENTITY_CLIENT_ID to be set for the FIC assertion. " +
                    "This is the user-assigned managed identity that acts as the federated credential.");
            }

            lock (s_miAssertionLock)
            {
                s_miAssertion ??= new ManagedIdentityClientAssertion(managedIdentityClientId: managedIdentityClientId);
            }
        }

        _logger.LogDebug(
            "AgentFrameworkService created: agentId={AgentId}, version={Version}, mode={Mode}",
            _agentId,
            _configuredAgentVersion ?? "<latest>",
            _useObo ? "OBO" : "ManagedIdentity");
    }

    /// <summary>
    /// Get AIProjectClient — OBO mode creates it with the user's identity, MI mode with the app credential.
    /// Cached for the lifetime of this (scoped) instance.
    /// </summary>
    private AIProjectClient GetProjectClient()
    {
        if (_projectClient is not null)
            return _projectClient;

        if (!_useObo)
        {
            _projectClient = new AIProjectClient(new Uri(_agentEndpoint), _appCredential);
            return _projectClient;
        }

        var userToken = ExtractBearerToken();
        if (string.IsNullOrEmpty(userToken))
        {
            throw new InvalidOperationException(
                "OBO mode requires a bearer token but none was found in the request. " +
                "Ensure the frontend is sending an Authorization header with a valid token.");
        }

        _projectClient = new AIProjectClient(new Uri(_agentEndpoint), CreateOboCredential(userToken));
        return _projectClient;
    }

    /// <summary>
    /// Create OBO credential using the user's JWT and managed identity FIC assertion.
    /// </summary>
    private OnBehalfOfCredential CreateOboCredential(string userToken)
    {
        Func<CancellationToken, Task<string>> assertionCallback =
            async (ct) => await s_miAssertion!.GetSignedAssertionAsync(
                new AssertionRequestOptions { CancellationToken = ct });

        return new OnBehalfOfCredential(
            _tenantId!,
            _backendClientId!,
            assertionCallback,
            userToken,
            new OnBehalfOfCredentialOptions());
    }

    /// <summary>
    /// Extract bearer token from the current HTTP request (already validated by the JWT middleware).
    /// </summary>
    private string? ExtractBearerToken()
    {
        var authHeader = _httpContextAccessor?.HttpContext?.Request.Headers.Authorization.ToString();
        if (string.IsNullOrEmpty(authHeader) || !authHeader.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
            return null;

        return authHeader["Bearer ".Length..].Trim();
    }

    /// <summary>
    /// Load the agent version metadata via AgentAdministrationClient (v2 Agents API).
    /// When <see cref="_configuredAgentVersion"/> is set, fetches that specific version by id.
    /// When unset, lists versions in descending order and picks the first (= newest).
    /// </summary>
    private async Task<ProjectsAgentVersion> GetAgentAsync(CancellationToken cancellationToken = default)
    {
        if (s_cachedAgentVersion != null)
            return s_cachedAgentVersion;

        await s_agentLock.WaitAsync(cancellationToken);
        try
        {
            if (s_cachedAgentVersion != null)
                return s_cachedAgentVersion;

            var client = GetProjectClient();

            ProjectsAgentVersion? loaded;
            if (!string.IsNullOrWhiteSpace(_configuredAgentVersion))
            {
                var response = await client.AgentAdministrationClient.GetAgentVersionAsync(
                    _agentId,
                    _configuredAgentVersion!,
                    cancellationToken);
                loaded = response.Value;
            }
            else
            {
                loaded = null;
                await foreach (var v in client.AgentAdministrationClient.GetAgentVersionsAsync(
                    agentName: _agentId,
                    limit: 1,
                    order: AgentListOrder.Descending,
                    after: null,
                    before: null,
                    cancellationToken: cancellationToken))
                {
                    loaded = v;
                    break;
                }

                if (loaded is null)
                {
                    throw new InvalidOperationException(
                        $"Agent '{_agentId}' has no versions. Create at least one version in AI Foundry.");
                }
            }

            s_cachedAgentVersion = loaded;

            var definition = s_cachedAgentVersion.Definition as DeclarativeAgentDefinition;
            _logger.LogInformation(
                "Loaded agent: name={AgentName}, model={Model}, version={Version} (pinned={Pinned})",
                s_cachedAgentVersion.Name ?? _agentId,
                definition?.Model ?? "unknown",
                s_cachedAgentVersion.Version ?? "<unknown>",
                !string.IsNullOrWhiteSpace(_configuredAgentVersion));

            return s_cachedAgentVersion;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogError(ex, "Failed to load agent: {AgentId}", _agentId);
            throw;
        }
        finally
        {
            s_agentLock.Release();
        }
    }

    private async Task<string?> GetResolvedAgentVersionAsync(CancellationToken cancellationToken)
    {
        var resolvedAgent = await GetAgentAsync(cancellationToken);
        return _configuredAgentVersion ?? resolvedAgent.Version;
    }

    /// <summary>
    /// Returns the conversation id to use for this turn: creates a new conversation owned by
    /// <paramref name="ownerId"/>, or verifies that the existing one belongs to them.
    /// </summary>
    /// <exception cref="ConversationNotFoundException">The conversation does not exist or belongs to another user.</exception>
    public async Task<string> ResolveConversationAsync(
        string ownerId,
        string? conversationId,
        string? firstMessage,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrEmpty(conversationId))
            return await CreateConversationAsync(ownerId, firstMessage, cancellationToken);

        await EnsureConversationOwnerAsync(ownerId, conversationId, cancellationToken);
        return conversationId;
    }

    /// <summary>
    /// Streams agent response for a message using ProjectResponsesClient (Responses API).
    /// Callers must first obtain <paramref name="conversationId"/> from <see cref="ResolveConversationAsync"/>
    /// and validate attachments with <see cref="ChatRequestValidator"/>.
    /// </summary>
    public async IAsyncEnumerable<StreamChunk> StreamMessageAsync(
        string conversationId,
        string message,
        ValidatedAttachments attachments,
        McpApprovalResponse? mcpApproval = null,
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        _logger.LogInformation(
            "Streaming message: conversation={ConversationId}, images={ImageCount}, files={FileCount}, approval={HasApproval}",
            conversationId,
            attachments.Images.Count,
            attachments.Documents.Count,
            mcpApproval != null);

        CreateResponseOptions options = new() { StreamingEnabled = true };

        var resolvedVersion = await GetResolvedAgentVersionAsync(cancellationToken);

        // Always bind to conversation — the conversation maintains MCP approval state
        ProjectResponsesClient responsesClient
            = GetProjectClient().ProjectOpenAIClient.GetProjectResponsesClientForAgent(
                new AgentReference(_agentId, resolvedVersion),
                conversationId);

        if (mcpApproval != null)
        {
            // Don't set PreviousResponseId — the API rejects it with conversation binding,
            // and the conversation already tracks the pending MCP state.
            options.InputItems.Add(ResponseItem.CreateMcpApprovalResponseItem(
                mcpApproval.ApprovalRequestId,
                mcpApproval.Approved));
        }
        else
        {
            options.InputItems.Add(await BuildUserMessageAsync(message, attachments, cancellationToken));
        }

        var fileSearchQuotes = new Dictionary<string, string>();
        string? currentResponseId = null;

        await foreach (StreamingResponseUpdate update
            in responsesClient.CreateResponseStreamingAsync(
                options: options,
                cancellationToken: cancellationToken))
        {
            if (update is StreamingResponseCreatedUpdate createdUpdate)
            {
                currentResponseId = createdUpdate.Response.Id;
                continue;
            }

            if (update is StreamingResponseOutputTextDeltaUpdate deltaUpdate)
            {
                yield return StreamChunk.Text(deltaUpdate.Delta);
            }
            else if (update is StreamingResponseOutputItemDoneUpdate itemDoneUpdate)
            {
                if (itemDoneUpdate.Item is McpToolCallApprovalRequestItem mcpApprovalItem)
                {
                    _logger.LogInformation(
                        "MCP tool approval requested: Tool={Tool}, Server={Server}",
                        mcpApprovalItem.ToolName,
                        mcpApprovalItem.ServerLabel);

                    yield return StreamChunk.McpApproval(new McpApprovalRequest
                    {
                        Id = mcpApprovalItem.Id,
                        ToolName = mcpApprovalItem.ToolName ?? "Unknown tool",
                        ServerLabel = mcpApprovalItem.ServerLabel ?? "MCP Server",
                        Arguments = mcpApprovalItem.ToolArguments?.ToString(),
                        PreviousResponseId = currentResponseId
                    });
                    continue;
                }

                if (itemDoneUpdate.Item is FileSearchCallResponseItem fileSearchItem)
                {
                    foreach (var result in fileSearchItem.Results)
                    {
                        if (!string.IsNullOrEmpty(result.FileId) && !string.IsNullOrEmpty(result.Text))
                            fileSearchQuotes[result.FileId] = result.Text;
                    }
                    continue;
                }

                var annotations = ExtractAnnotations(itemDoneUpdate.Item, fileSearchQuotes);
                if (annotations.Count > 0)
                    yield return StreamChunk.WithAnnotations(annotations);
            }
            else if (update is StreamingResponseOutputItemAddedUpdate itemAddedUpdate)
            {
                string? toolName = itemAddedUpdate.Item switch
                {
                    FileSearchCallResponseItem => "file_search",
                    CodeInterpreterCallResponseItem => "code_interpreter",
                    _ when itemAddedUpdate.Item?.GetType().Name.Contains("ToolCall") == true => "function_call",
                    _ => null
                };

                if (toolName != null)
                    yield return StreamChunk.ToolUse(toolName);
            }
            else if (update is StreamingResponseCompletedUpdate completedUpdate)
            {
                _lastUsage = completedUpdate.Response.Usage;
            }
            else if (update is StreamingResponseErrorUpdate errorUpdate)
            {
                _logger.LogError("Stream error from agent: {Error}", errorUpdate.Message);
                throw new InvalidOperationException($"Stream error: {errorUpdate.Message}");
            }
        }

        _logger.LogInformation("Completed streaming for conversation: {ConversationId}", conversationId);
    }

    /// <summary>
    /// Builds the user message. Images are uploaded to the Foundry Files API (purpose: assistants) and
    /// referenced by id; text documents are inlined; PDFs are sent as file parts.
    /// Attachments arrive already validated, so this method performs no validation.
    /// </summary>
    private async Task<ResponseItem> BuildUserMessageAsync(
        string message,
        ValidatedAttachments attachments,
        CancellationToken cancellationToken)
    {
        if (attachments.IsEmpty)
            return ResponseItem.CreateUserMessageItem(message);

        var contentParts = new List<ResponseContentPart>
        {
            ResponseContentPart.CreateInputTextPart(message)
        };

        if (attachments.Images.Count > 0)
        {
            // Foundry's Files proxy rejects purpose=vision/user_data; purpose=assistants is accepted and the
            // resulting file id works with CreateInputImagePart on the Responses API.
            var fileClient = GetProjectClient().ProjectOpenAIClient.GetOpenAIFileClient();
            foreach (var image in attachments.Images)
            {
                var imageFileName = $"{WebAppUploadFilenamePrefix}{Guid.NewGuid():N}{image.Extension}";
                using var imageStream = new MemoryStream(image.Bytes, writable: false);
                var uploaded = await fileClient.UploadFileAsync(
                    imageStream,
                    imageFileName,
                    FileUploadPurpose.Assistants,
                    cancellationToken);
                contentParts.Add(ResponseContentPart.CreateInputImagePart(uploaded.Value.Id));
            }
        }

        foreach (var document in attachments.Documents)
        {
            if (document.IsText)
            {
                var textContent = System.Text.Encoding.UTF8.GetString(document.Bytes);
                var inlineText = $"\n\n--- Content of {document.FileName} ---\n{textContent}\n--- End of {document.FileName} ---\n";
                contentParts.Add(ResponseContentPart.CreateInputTextPart(inlineText));
            }
            else
            {
                contentParts.Add(ResponseContentPart.CreateInputFilePart(
                    BinaryData.FromBytes(document.Bytes),
                    document.MediaType,
                    document.FileName));
            }
        }

        return ResponseItem.CreateUserMessageItem(contentParts);
    }

    /// <summary>
    /// Extracts annotation information from a completed response item.
    /// </summary>
    private static List<AnnotationInfo> ExtractAnnotations(
        ResponseItem? item,
        Dictionary<string, string>? fileSearchQuotes = null)
    {
        var annotations = new List<AnnotationInfo>();

        if (item is not MessageResponseItem messageItem)
            return annotations;

        foreach (var content in messageItem.Content)
        {
            if (content.OutputTextAnnotations == null) continue;

            foreach (var annotation in content.OutputTextAnnotations)
            {
                var annotationInfo = annotation switch
                {
                    UriCitationMessageAnnotation uriAnnotation => new AnnotationInfo
                    {
                        Type = "uri_citation",
                        Label = uriAnnotation.Title ?? "Source",
                        Url = uriAnnotation.Uri?.ToString(),
                        StartIndex = uriAnnotation.StartIndex,
                        EndIndex = uriAnnotation.EndIndex
                    },

                    FileCitationMessageAnnotation fileCitation => new AnnotationInfo
                    {
                        Type = "file_citation",
                        Label = fileCitation.Filename ?? fileCitation.FileId ?? "File",
                        FileId = fileCitation.FileId,
                        StartIndex = fileCitation.Index,
                        EndIndex = fileCitation.Index,
                        Quote = fileSearchQuotes?.TryGetValue(fileCitation.FileId ?? string.Empty, out var quote) == true
                            ? quote : null
                    },

                    FilePathMessageAnnotation filePath => new AnnotationInfo
                    {
                        Type = "file_path",
                        Label = filePath.FileId?.Split('/').LastOrDefault() ?? "Generated File",
                        FileId = filePath.FileId,
                        StartIndex = filePath.Index,
                        EndIndex = filePath.Index
                    },

                    ContainerFileCitationMessageAnnotation containerCitation => new AnnotationInfo
                    {
                        Type = "container_file_citation",
                        Label = containerCitation.Filename ?? "Container File",
                        FileId = containerCitation.FileId,
                        ContainerId = containerCitation.ContainerId,
                        StartIndex = containerCitation.StartIndex,
                        EndIndex = containerCitation.EndIndex,
                        Quote = fileSearchQuotes?.TryGetValue(containerCitation.FileId ?? string.Empty, out var containerQuote) == true
                            ? containerQuote : null
                    },

                    _ => null
                };

                if (annotationInfo != null)
                    annotations.Add(annotationInfo);
            }
        }

        return annotations;
    }

    /// <summary>
    /// Create a new conversation owned by <paramref name="ownerId"/>.
    /// </summary>
    private async Task<string> CreateConversationAsync(string ownerId, string? firstMessage, CancellationToken cancellationToken)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(ownerId);

        ProjectConversationCreationOptions conversationOptions = new();
        conversationOptions.Metadata[ConversationOwnership.OwnerMetadataKey] = ownerId;

        var title = ConversationOwnership.BuildTitle(firstMessage);
        if (title is not null)
            conversationOptions.Metadata[ConversationOwnership.TitleMetadataKey] = title;

        ProjectConversation conversation
            = await GetProjectClient().ProjectOpenAIClient.GetProjectConversationsClient().CreateProjectConversationAsync(
                conversationOptions,
                cancellationToken);

        _logger.LogInformation("Created conversation: {ConversationId}", conversation.Id);
        return conversation.Id;
    }

    /// <summary>
    /// Throws <see cref="ConversationNotFoundException"/> unless the conversation exists and belongs to <paramref name="ownerId"/>.
    /// </summary>
    private async Task EnsureConversationOwnerAsync(string ownerId, string conversationId, CancellationToken cancellationToken)
    {
        ProjectConversation conversation;
        try
        {
            conversation = await GetProjectClient().ProjectOpenAIClient.GetProjectConversationsClient()
                .GetProjectConversationAsync(conversationId, cancellationToken);
        }
        catch (ClientResultException ex) when (ex.Status == StatusCodes.Status404NotFound)
        {
            throw new ConversationNotFoundException(conversationId);
        }

        if (!ConversationOwnership.IsOwnedBy(conversation.Metadata, ownerId))
        {
            // Logged as a warning: repeated hits indicate an enumeration attempt.
            _logger.LogWarning("Denied access to conversation {ConversationId} not owned by the caller", conversationId);
            throw new ConversationNotFoundException(conversationId);
        }
    }

    /// <summary>
    /// List the caller's conversations for the current agent (most recent first).
    /// </summary>
    /// <returns>Up to <paramref name="limit"/> + 1 items so the caller can detect more pages.</returns>
    public async Task<List<ConversationSummary>> ListConversationsAsync(
        string ownerId,
        int limit = 20,
        CancellationToken cancellationToken = default)
    {
        var resolvedVersion = await GetResolvedAgentVersionAsync(cancellationToken);

        var conversations = new List<ConversationSummary>();
        var fetchLimit = limit + 1;
        var scanned = 0;

        await foreach (var conv in GetProjectClient().ProjectOpenAIClient.GetProjectConversationsClient().GetProjectConversationsAsync(
            new AgentReference(_agentId, resolvedVersion), cancellationToken: cancellationToken))
        {
            // Foundry cannot filter by metadata, so the scan is bounded to keep latency and cost predictable.
            if (++scanned > MaxConversationsScanned)
                break;

            if (!ConversationOwnership.IsOwnedBy(conv.Metadata, ownerId))
                continue;

            conversations.Add(new ConversationSummary
            {
                Id = conv.Id,
                Title = conv.Metadata?.TryGetValue(ConversationOwnership.TitleMetadataKey, out var title) == true ? title : null,
                CreatedAt = conv.CreatedAt.ToUnixTimeSeconds()
            });

            if (conversations.Count >= fetchLimit)
                break;
        }

        return conversations;
    }

    /// <summary>
    /// Get the messages of a conversation owned by the caller (oldest first).
    /// </summary>
    /// <exception cref="ConversationNotFoundException">The conversation does not exist or belongs to another user.</exception>
    public async Task<List<ConversationMessageInfo>> GetConversationMessagesAsync(
        string ownerId,
        string conversationId,
        CancellationToken cancellationToken = default)
    {
        await EnsureConversationOwnerAsync(ownerId, conversationId, cancellationToken);

        var messages = new List<ConversationMessageInfo>();
        await foreach (var item in GetProjectClient().ProjectOpenAIClient.GetProjectConversationsClient().GetProjectConversationItemsAsync(
            conversationId, itemKind: AgentResponseItemKind.Message, cancellationToken: cancellationToken))
        {
            if (item.AsResponseResultItem() is MessageResponseItem messageItem)
            {
                messages.Add(new ConversationMessageInfo
                {
                    Role = messageItem.Role.ToString().ToLowerInvariant(),
                    Content = string.Join("", messageItem.Content.Where(c => c.Text != null).Select(c => c.Text))
                });
            }
        }

        messages.Reverse();
        return messages;
    }

    /// <summary>
    /// Public agent information for the UI. Deliberately excludes the system prompt (instructions),
    /// the model deployment and the raw metadata dictionary: they are internal configuration.
    /// </summary>
    public async Task<AgentMetadataResponse> GetAgentMetadataAsync(CancellationToken cancellationToken = default)
    {
        if (s_cachedMetadata != null)
            return s_cachedMetadata;

        var agentVersion = await GetAgentAsync(cancellationToken);
        var metadata = agentVersion.Metadata?.ToDictionary(kvp => kvp.Key, kvp => kvp.Value);

        s_cachedMetadata = new AgentMetadataResponse
        {
            Id = _agentId,
            Name = agentVersion.Name ?? "AI Assistant",
            Description = agentVersion.Description,
            StarterPrompts = ParseStarterPrompts(metadata)
        };

        return s_cachedMetadata;
    }

    /// <summary>
    /// Parse starter prompts from agent metadata.
    /// Microsoft Foundry stores starter prompts as newline-separated text in the "starterPrompts" metadata key.
    /// </summary>
    internal static List<string>? ParseStarterPrompts(IReadOnlyDictionary<string, string>? metadata)
    {
        if (metadata == null || !metadata.TryGetValue("starterPrompts", out var starterPromptsValue)
            || string.IsNullOrWhiteSpace(starterPromptsValue))
        {
            return null;
        }

        var prompts = starterPromptsValue
            .Split(['\n', '\r'], StringSplitOptions.RemoveEmptyEntries)
            .Select(p => p.Trim())
            .Where(p => !string.IsNullOrEmpty(p))
            .ToList();

        return prompts.Count > 0 ? prompts : null;
    }

    /// <summary>
    /// Get token usage from the last streaming response.
    /// </summary>
    public (int InputTokens, int OutputTokens, int TotalTokens)? GetLastUsage() =>
        _lastUsage is null ? null : (_lastUsage.InputTokenCount, _lastUsage.OutputTokenCount, _lastUsage.TotalTokenCount);
}
