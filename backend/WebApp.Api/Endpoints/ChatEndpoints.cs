using System.Text.Json;
using WebApp.Api.Application;
using WebApp.Api.Application.Validation;
using WebApp.Api.Models;
using WebApp.Api.Security;

namespace WebApp.Api.Endpoints;

public static class ChatEndpoints
{
    private static readonly JsonSerializerOptions SseJson = new(JsonSerializerDefaults.Web);

    /// <summary>
    /// <c>POST /api/chat/stream</c>: validates, authorizes the conversation and streams the agent response (SSE).
    /// </summary>
    public static RouteGroupBuilder MapChatEndpoints(this RouteGroupBuilder api)
    {
        api.MapPost("/chat/stream", StreamAsync)
            .RequireRateLimiting(RateLimitPolicies.Chat)
            .WithName("StreamChatMessage");

        return api;
    }

    private static async Task<IResult> StreamAsync(
        ChatRequest request,
        ChatService chat,
        HttpContext httpContext,
        CancellationToken cancellationToken)
    {
        if (httpContext.User.GetOwnerId() is not { } ownerId)
            return ApiResults.Forbidden("El token no identifica a un usuario.");

        // 1) Validate everything before touching Azure (no conversation or file is created for invalid input).
        var validation = ChatRequestValidator.Validate(request);
        if (!validation.IsValid)
            return ApiResults.Validation(validation.Errors);

        // 2) Authorize (ConversationNotFoundException → 404 through ApiExceptionHandler, before the stream starts).
        var conversationId = await chat.ResolveConversationAsync(ownerId, request.ConversationId, request.Message, cancellationToken);

        // 3) Stream. Errors after this point are sent as an "error" event because the 200 status is already sent.
        var response = httpContext.Response;
        response.ContentType = "text/event-stream";
        response.Headers.CacheControl = "no-store";
        // Disable proxy buffering (nginx-style proxies) so tokens reach the browser as they are produced.
        response.Headers["X-Accel-Buffering"] = "no";

        var turn = new AgentTurn(request.Message, validation.Attachments, request.McpApproval);
        try
        {
            await foreach (var streamEvent in chat.StreamAsync(conversationId, turn, cancellationToken))
                await WriteEventAsync(response, streamEvent, cancellationToken);
        }
        catch (Exception ex) when (ex is OperationCanceledException or IOException && cancellationToken.IsCancellationRequested)
        {
            // Client went away while writing; nothing left to send.
        }

        return Results.Empty;
    }

    internal static string Format(ChatStreamEvent streamEvent) =>
        $"data: {JsonSerializer.Serialize(streamEvent, SseJson)}\n\n";

    private static async Task WriteEventAsync(HttpResponse response, ChatStreamEvent streamEvent, CancellationToken cancellationToken)
    {
        await response.WriteAsync(Format(streamEvent), cancellationToken);
        await response.Body.FlushAsync(cancellationToken);
    }
}
