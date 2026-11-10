using System.Text.Json.Serialization;

namespace WebApp.Api.Models;

/// <summary>
/// Server-Sent Event sent by <c>POST /api/chat/stream</c>. Serialized as <c>data: {"type":"...", ...}</c>.
/// </summary>
/// <remarks>
/// The <c>type</c> discriminator and camelCase property names are the contract with
/// <c>frontend/src/services/agentStreamClient.ts</c>. Order of a successful stream:
/// <c>conversationId</c> → (<c>chunk</c> | <c>annotations</c> | <c>toolUse</c> | <c>mcpApprovalRequest</c>)* → <c>usage</c> → <c>done</c>.
/// A failed stream ends with <c>error</c>.
/// </remarks>
[JsonPolymorphic(TypeDiscriminatorPropertyName = "type")]
[JsonDerivedType(typeof(ConversationIdEvent), "conversationId")]
[JsonDerivedType(typeof(TextChunkEvent), "chunk")]
[JsonDerivedType(typeof(AnnotationsEvent), "annotations")]
[JsonDerivedType(typeof(ToolUseEvent), "toolUse")]
[JsonDerivedType(typeof(McpApprovalRequestEvent), "mcpApprovalRequest")]
[JsonDerivedType(typeof(UsageEvent), "usage")]
[JsonDerivedType(typeof(DoneEvent), "done")]
[JsonDerivedType(typeof(ErrorEvent), "error")]
public abstract record ChatStreamEvent;

public sealed record ConversationIdEvent(string ConversationId) : ChatStreamEvent;

public sealed record TextChunkEvent(string Content) : ChatStreamEvent;

public sealed record AnnotationsEvent(IReadOnlyList<AnnotationInfo> Annotations) : ChatStreamEvent;

/// <summary>A tool step started (file_search, code_interpreter, function_call); used for progress indicators.</summary>
public sealed record ToolUseEvent(string ToolName) : ChatStreamEvent;

public sealed record McpApprovalRequestEvent(McpApprovalRequest ApprovalRequest) : ChatStreamEvent;

/// <summary>Token usage and duration of the agent response. Always emitted once, before <see cref="DoneEvent"/>.</summary>
public sealed record UsageEvent(double Duration, int PromptTokens, int CompletionTokens, int TotalTokens) : ChatStreamEvent;

public sealed record DoneEvent : ChatStreamEvent;

/// <summary>Terminal error. <see cref="Message"/> is safe to show to the user (no internal details outside Development).</summary>
public sealed record ErrorEvent(string Message) : ChatStreamEvent;

/// <summary>
/// Represents an MCP tool call requiring user approval.
/// </summary>
public record McpApprovalRequest
{
    public required string Id { get; init; }
    public required string ToolName { get; init; }
    public required string ServerLabel { get; init; }
    public string? Arguments { get; init; }
    public string? PreviousResponseId { get; init; }
}
