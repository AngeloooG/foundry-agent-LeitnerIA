using WebApp.Api.Application.Attachments;
using WebApp.Api.Models;

namespace WebApp.Api.Application;

/// <summary>A user turn sent to the agent: either a new message (with attachments) or an MCP approval decision.</summary>
public sealed record AgentTurn(string? Message, ValidatedAttachments Attachments, McpApprovalResponse? McpApproval = null);

/// <summary>Public information about the agent (no system prompt, model or raw metadata).</summary>
public sealed record AgentInfo(string Id, string Name, string? Description, IReadOnlyList<string>? StarterPrompts);

/// <summary>A conversation as stored by the conversation store.</summary>
public sealed record ConversationRecord(string Id, IReadOnlyDictionary<string, string> Metadata, DateTimeOffset CreatedAt);

/// <summary>
/// Port to the AI agent runtime (adapter: <c>Infrastructure.Foundry.FoundryAgentGateway</c>).
/// </summary>
public interface IAgentGateway
{
    /// <summary>
    /// Sends a turn to the agent bound to <paramref name="conversationId"/> and streams the response.
    /// The last event is always a <see cref="UsageEvent"/>.
    /// </summary>
    IAsyncEnumerable<ChatStreamEvent> StreamAsync(string conversationId, AgentTurn turn, CancellationToken cancellationToken);

    Task<AgentInfo> GetAgentInfoAsync(CancellationToken cancellationToken);
}

/// <summary>
/// Port to conversation storage (adapter: <c>Infrastructure.Foundry.FoundryConversationStore</c>).
/// Ownership rules are enforced by the application services, not by the store.
/// </summary>
public interface IConversationStore
{
    Task<string> CreateAsync(IReadOnlyDictionary<string, string> metadata, CancellationToken cancellationToken);

    /// <returns>The conversation, or <c>null</c> when it does not exist.</returns>
    Task<ConversationRecord?> GetAsync(string conversationId, CancellationToken cancellationToken);

    /// <summary>Conversations of the current agent, most recent first.</summary>
    IAsyncEnumerable<ConversationRecord> ListAsync(CancellationToken cancellationToken);

    /// <summary>Messages of a conversation, oldest first.</summary>
    Task<IReadOnlyList<ConversationMessageInfo>> GetMessagesAsync(string conversationId, CancellationToken cancellationToken);
}
