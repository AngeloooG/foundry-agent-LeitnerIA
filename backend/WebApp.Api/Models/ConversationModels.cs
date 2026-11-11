namespace WebApp.Api.Models;

/// <summary>Item of <c>GET /api/conversations</c> (only the caller's conversations).</summary>
public record ConversationSummary
{
    public required string Id { get; init; }
    public string? Title { get; init; }
    public long CreatedAt { get; init; }
}

/// <summary>Item of <c>GET /api/conversations/{id}/messages</c>.</summary>
public record ConversationMessageInfo
{
    public required string Role { get; init; }
    public required string Content { get; init; }
}
