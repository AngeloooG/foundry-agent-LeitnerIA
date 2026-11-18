namespace WebApp.Api.Models;

/// <summary>
/// Public agent information returned by <c>GET /api/agent</c>.
/// </summary>
/// <remarks>
/// Intentionally minimal: the system prompt (instructions), model deployment and raw metadata are internal
/// configuration of CONSEIN and must never be exposed to end users.
/// </remarks>
public record AgentMetadataResponse
{
    public required string Id { get; init; }
    public required string Name { get; init; }
    public string? Description { get; init; }

    /// <summary>
    /// Starter prompts to display as suggestions in the chat interface.
    /// Populated from agent metadata key "starterPrompts" (newline-separated text).
    /// </summary>
    public List<string>? StarterPrompts { get; init; }
}
