using System.Diagnostics;
using System.Runtime.CompilerServices;
using Azure.AI.Extensions.OpenAI;
using Azure.AI.Projects.Agents;
using OpenAI.Files;
using OpenAI.Responses;
using WebApp.Api.Application;
using WebApp.Api.Application.Attachments;
using WebApp.Api.Models;

namespace WebApp.Api.Infrastructure.Foundry;

#pragma warning disable OPENAI001 // Responses API types are marked experimental in the OpenAI SDK.

/// <summary>
/// <see cref="IAgentGateway"/> adapter over the Foundry Responses API (Azure.AI.Projects GA).
/// </summary>
/// <remarks>
/// Uses <c>ProjectResponsesClient</c> directly instead of <c>IChatClient</c> because MCP approval requests,
/// file-search results and output annotations are not exposed by that abstraction.
/// </remarks>
public sealed class FoundryAgentGateway(
    FoundryClientFactory clientFactory,
    FoundryAgentCatalog agentCatalog,
    ILogger<FoundryAgentGateway> logger) : IAgentGateway
{
    /// <summary>
    /// Prefix applied to images uploaded to the Foundry Files API; <see cref="UploadedFilesCleanupService"/>
    /// only deletes files with this prefix. Changing it orphans files uploaded by previous builds.
    /// </summary>
    public const string UploadFilenamePrefix = "webapp-upload-";

    public async IAsyncEnumerable<ChatStreamEvent> StreamAsync(
        string conversationId,
        AgentTurn turn,
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        var stopwatch = Stopwatch.StartNew();
        var version = await agentCatalog.GetVersionAsync(cancellationToken);

        // Bound to the conversation: it keeps the history and any pending MCP approval state.
        var responses = clientFactory.GetClient().ProjectOpenAIClient.GetProjectResponsesClientForAgent(
            new AgentReference(agentCatalog.AgentId, version), conversationId);

        var options = new CreateResponseOptions { StreamingEnabled = true };
        if (turn.McpApproval is { } approval)
        {
            // PreviousResponseId must not be set together with a conversation binding (the API rejects it).
            options.InputItems.Add(ResponseItem.CreateMcpApprovalResponseItem(approval.ApprovalRequestId, approval.Approved));
        }
        else
        {
            options.InputItems.Add(await BuildUserMessageAsync(turn.Message ?? string.Empty, turn.Attachments, cancellationToken));
        }

        logger.LogInformation(
            "Streaming turn: conversation={ConversationId}, images={Images}, files={Files}, approval={Approval}",
            conversationId, turn.Attachments.Images.Count, turn.Attachments.Documents.Count, turn.McpApproval is not null);

        var fileSearchQuotes = new Dictionary<string, string>();
        string? responseId = null;
        ResponseTokenUsage? usage = null;

        await foreach (var update in responses.CreateResponseStreamingAsync(options: options, cancellationToken: cancellationToken))
        {
            switch (update)
            {
                case StreamingResponseCreatedUpdate created:
                    responseId = created.Response.Id;
                    break;

                case StreamingResponseOutputTextDeltaUpdate delta:
                    yield return new TextChunkEvent(delta.Delta);
                    break;

                case StreamingResponseOutputItemDoneUpdate { Item: McpToolCallApprovalRequestItem mcp }:
                    logger.LogInformation("MCP tool approval requested: tool={Tool}, server={Server}", mcp.ToolName, mcp.ServerLabel);
                    yield return new McpApprovalRequestEvent(new McpApprovalRequest
                    {
                        Id = mcp.Id,
                        ToolName = mcp.ToolName ?? "Unknown tool",
                        ServerLabel = mcp.ServerLabel ?? "MCP Server",
                        Arguments = mcp.ToolArguments?.ToString(),
                        PreviousResponseId = responseId,
                    });
                    break;

                case StreamingResponseOutputItemDoneUpdate { Item: FileSearchCallResponseItem fileSearch }:
                    foreach (var result in fileSearch.Results)
                    {
                        if (!string.IsNullOrEmpty(result.FileId) && !string.IsNullOrEmpty(result.Text))
                            fileSearchQuotes[result.FileId] = result.Text;
                    }
                    break;

                case StreamingResponseOutputItemDoneUpdate done:
                    var annotations = AnnotationMapper.Extract(done.Item, fileSearchQuotes);
                    if (annotations.Count > 0)
                        yield return new AnnotationsEvent(annotations);
                    break;

                case StreamingResponseOutputItemAddedUpdate added when ToolNameOf(added.Item) is { } toolName:
                    yield return new ToolUseEvent(toolName);
                    break;

                case StreamingResponseCompletedUpdate completed:
                    usage = completed.Response.Usage;
                    break;

                case StreamingResponseErrorUpdate error:
                    throw new InvalidOperationException($"Agent stream error: {error.Message}");
            }
        }

        yield return new UsageEvent(
            stopwatch.Elapsed.TotalMilliseconds,
            usage?.InputTokenCount ?? 0,
            usage?.OutputTokenCount ?? 0,
            usage?.TotalTokenCount ?? 0);
    }

    public async Task<AgentInfo> GetAgentInfoAsync(CancellationToken cancellationToken)
    {
        var agent = await agentCatalog.GetAgentAsync(cancellationToken);
        return new AgentInfo(
            agentCatalog.AgentId,
            agent.Name ?? "LeitnerIA",
            agent.Description,
            ParseStarterPrompts(agent.Metadata is not null && agent.Metadata.TryGetValue("starterPrompts", out var prompts) ? prompts : null));
    }

    /// <summary>
    /// Foundry stores starter prompts as newline-separated text in the "starterPrompts" metadata key.
    /// </summary>
    internal static IReadOnlyList<string>? ParseStarterPrompts(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return null;

        var prompts = value
            .Split(['\n', '\r'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .ToList();

        return prompts.Count > 0 ? prompts : null;
    }

    private static string? ToolNameOf(ResponseItem? item) => item switch
    {
        FileSearchCallResponseItem => "file_search",
        CodeInterpreterCallResponseItem => "code_interpreter",
        McpToolCallItem => "mcp",
        FunctionCallResponseItem => "function_call",
        WebSearchCallResponseItem => "web_search",
        _ => null,
    };

    /// <summary>
    /// Images are uploaded to the Foundry Files API (purpose: assistants, the only one Foundry accepts for this)
    /// and referenced by id; text documents are inlined; PDFs are sent as file parts.
    /// Attachments arrive already validated by <see cref="AttachmentValidator"/>.
    /// </summary>
    private async Task<ResponseItem> BuildUserMessageAsync(string message, ValidatedAttachments attachments, CancellationToken cancellationToken)
    {
        if (attachments.IsEmpty)
            return ResponseItem.CreateUserMessageItem(message);

        var parts = new List<ResponseContentPart> { ResponseContentPart.CreateInputTextPart(message) };

        if (attachments.Images.Count > 0)
        {
            var files = clientFactory.GetClient().ProjectOpenAIClient.GetOpenAIFileClient();
            foreach (var image in attachments.Images)
            {
                using var stream = new MemoryStream(image.Bytes, writable: false);
                var uploaded = await files.UploadFileAsync(
                    stream, $"{UploadFilenamePrefix}{Guid.NewGuid():N}{image.Extension}", FileUploadPurpose.Assistants, cancellationToken);
                parts.Add(ResponseContentPart.CreateInputImagePart(uploaded.Value.Id));
            }
        }

        foreach (var document in attachments.Documents)
        {
            parts.Add(document.IsText
                ? ResponseContentPart.CreateInputTextPart(
                    $"\n\n--- Content of {document.FileName} ---\n{System.Text.Encoding.UTF8.GetString(document.Bytes)}\n--- End of {document.FileName} ---\n")
                : ResponseContentPart.CreateInputFilePart(BinaryData.FromBytes(document.Bytes), document.MediaType, document.FileName));
        }

        return ResponseItem.CreateUserMessageItem(parts);
    }
}

/// <summary>Maps Responses API output annotations to the API contract.</summary>
internal static class AnnotationMapper
{
    public static IReadOnlyList<AnnotationInfo> Extract(ResponseItem? item, IReadOnlyDictionary<string, string> fileSearchQuotes)
    {
        if (item is not MessageResponseItem message)
            return [];

        var result = new List<AnnotationInfo>();
        foreach (var content in message.Content)
        {
            if (content.OutputTextAnnotations is null)
                continue;

            foreach (var annotation in content.OutputTextAnnotations)
            {
                AnnotationInfo? info = annotation switch
                {
                    UriCitationMessageAnnotation uri => new AnnotationInfo
                    {
                        Type = "uri_citation",
                        Label = uri.Title ?? "Source",
                        Url = uri.Uri?.ToString(),
                        StartIndex = uri.StartIndex,
                        EndIndex = uri.EndIndex,
                    },
                    FileCitationMessageAnnotation file => new AnnotationInfo
                    {
                        Type = "file_citation",
                        Label = file.Filename ?? file.FileId ?? "File",
                        FileId = file.FileId,
                        StartIndex = file.Index,
                        EndIndex = file.Index,
                        Quote = file.FileId is not null ? fileSearchQuotes.GetValueOrDefault(file.FileId) : null,
                    },
                    FilePathMessageAnnotation path => new AnnotationInfo
                    {
                        Type = "file_path",
                        Label = path.FileId?.Split('/').LastOrDefault() ?? "Generated File",
                        FileId = path.FileId,
                        StartIndex = path.Index,
                        EndIndex = path.Index,
                    },
                    ContainerFileCitationMessageAnnotation container => new AnnotationInfo
                    {
                        Type = "container_file_citation",
                        Label = container.Filename ?? "Container File",
                        FileId = container.FileId,
                        ContainerId = container.ContainerId,
                        StartIndex = container.StartIndex,
                        EndIndex = container.EndIndex,
                        Quote = container.FileId is not null ? fileSearchQuotes.GetValueOrDefault(container.FileId) : null,
                    },
                    _ => null,
                };

                if (info is not null)
                    result.Add(info);
            }
        }

        return result;
    }
}
