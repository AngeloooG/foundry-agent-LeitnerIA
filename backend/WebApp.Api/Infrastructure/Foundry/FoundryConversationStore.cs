using System.ClientModel;
using System.Runtime.CompilerServices;
using Azure.AI.Extensions.OpenAI;
using OpenAI.Responses;
using WebApp.Api.Application;
using WebApp.Api.Models;

namespace WebApp.Api.Infrastructure.Foundry;

#pragma warning disable OPENAI001 // Conversations API is marked experimental in the OpenAI SDK.

/// <summary>
/// <see cref="IConversationStore"/> adapter over Foundry conversations (server-managed state).
/// </summary>
public sealed class FoundryConversationStore(FoundryClientFactory clientFactory, FoundryAgentCatalog agentCatalog)
    : IConversationStore
{
    private ProjectConversationsClient Conversations =>
        clientFactory.GetClient().ProjectOpenAIClient.GetProjectConversationsClient();

    public async Task<string> CreateAsync(IReadOnlyDictionary<string, string> metadata, CancellationToken cancellationToken)
    {
        var creation = new ProjectConversationCreationOptions();
        foreach (var (key, value) in metadata)
            creation.Metadata[key] = value;

        ProjectConversation conversation = await Conversations.CreateProjectConversationAsync(creation, cancellationToken);
        return conversation.Id;
    }

    public async Task<ConversationRecord?> GetAsync(string conversationId, CancellationToken cancellationToken)
    {
        try
        {
            ProjectConversation conversation = await Conversations.GetProjectConversationAsync(conversationId, cancellationToken);
            return ToRecord(conversation);
        }
        catch (ClientResultException ex) when (ex.Status == StatusCodes.Status404NotFound)
        {
            return null;
        }
    }

    public async IAsyncEnumerable<ConversationRecord> ListAsync([EnumeratorCancellation] CancellationToken cancellationToken)
    {
        var version = await agentCatalog.GetVersionAsync(cancellationToken);
        await foreach (var conversation in Conversations.GetProjectConversationsAsync(
            new AgentReference(agentCatalog.AgentId, version), cancellationToken: cancellationToken))
        {
            yield return ToRecord(conversation);
        }
    }

    public async Task<IReadOnlyList<ConversationMessageInfo>> GetMessagesAsync(string conversationId, CancellationToken cancellationToken)
    {
        var messages = new List<ConversationMessageInfo>();
        await foreach (var item in Conversations.GetProjectConversationItemsAsync(
            conversationId, itemKind: AgentResponseItemKind.Message, cancellationToken: cancellationToken))
        {
            if (item.AsResponseResultItem() is MessageResponseItem message)
            {
                messages.Add(new ConversationMessageInfo
                {
                    Role = message.Role.ToString().ToLowerInvariant(),
                    Content = string.Concat(message.Content.Where(c => c.Text is not null).Select(c => c.Text)),
                });
            }
        }

        messages.Reverse(); // API returns newest first
        return messages;
    }

    private static ConversationRecord ToRecord(ProjectConversation conversation) =>
        new(conversation.Id,
            conversation.Metadata?.ToDictionary(kv => kv.Key, kv => kv.Value) ?? new Dictionary<string, string>(),
            conversation.CreatedAt);
}
