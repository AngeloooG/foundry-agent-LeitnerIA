using WebApp.Api.Application;
using WebApp.Api.Application.Validation;
using WebApp.Api.Security;

namespace WebApp.Api.Endpoints;

public static class ConversationEndpoints
{
    /// <summary>
    /// <c>GET /api/conversations</c> and <c>GET /api/conversations/{id}/messages</c> — only the caller's conversations.
    /// </summary>
    public static RouteGroupBuilder MapConversationEndpoints(this RouteGroupBuilder api)
    {
        var group = api.MapGroup("/conversations").RequireRateLimiting(RateLimitPolicies.Api);

        group.MapGet("/", async (int? limit, ConversationService conversations, HttpContext httpContext, CancellationToken cancellationToken) =>
            {
                if (httpContext.User.GetOwnerId() is not { } ownerId)
                    return ApiResults.Forbidden("El token no identifica a un usuario.");

                var pageSize = Math.Clamp(limit ?? 20, 1, 100);
                var items = await conversations.ListAsync(ownerId, pageSize, cancellationToken);
                return Results.Ok(new { conversations = items.Take(pageSize), hasMore = items.Count > pageSize });
            })
            .WithName("ListConversations");

        group.MapGet("/{conversationId}/messages", async (string conversationId, ConversationService conversations, HttpContext httpContext, CancellationToken cancellationToken) =>
            {
                if (httpContext.User.GetOwnerId() is not { } ownerId)
                    return ApiResults.Forbidden("El token no identifica a un usuario.");
                if (!ChatRequestValidator.IsValidId(conversationId))
                    return ApiResults.BadRequest("Identificador de conversación inválido.");

                return Results.Ok(await conversations.GetMessagesAsync(ownerId, conversationId, cancellationToken));
            })
            .WithName("GetConversationMessages");

        return api;
    }
}
