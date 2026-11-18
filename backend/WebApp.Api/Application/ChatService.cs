using System.Runtime.CompilerServices;
using WebApp.Api.Models;
using WebApp.Api.Observability;

namespace WebApp.Api.Application;

/// <summary>
/// Chat use case: resolves (and authorizes) the conversation, then streams the agent response as SSE events.
/// </summary>
public sealed class ChatService(
    ConversationService conversations,
    IAgentGateway agent,
    ChatMetrics metrics,
    IHostEnvironment environment,
    ILogger<ChatService> logger)
{
    internal const string GenericStreamError = "Ocurrió un error inesperado al generar la respuesta. Intente nuevamente.";

    /// <summary>
    /// Authorizes the conversation BEFORE the response starts, so ownership failures become a regular 404
    /// instead of an error inside an already-open SSE stream.
    /// </summary>
    public Task<string> ResolveConversationAsync(string ownerId, string? conversationId, string? firstMessage, CancellationToken cancellationToken) =>
        conversations.ResolveForTurnAsync(ownerId, conversationId, firstMessage, cancellationToken);

    /// <summary>
    /// Streams the full SSE sequence: conversationId → agent events → usage → done, or a terminal error event.
    /// Client cancellation ends the sequence silently.
    /// </summary>
    public async IAsyncEnumerable<ChatStreamEvent> StreamAsync(
        string conversationId,
        AgentTurn turn,
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        yield return new ConversationIdEvent(conversationId);

        await using var enumerator = agent.StreamAsync(conversationId, turn, cancellationToken).GetAsyncEnumerator(cancellationToken);
        var outcome = "completed";

        while (true)
        {
            ChatStreamEvent? next;
            ErrorEvent? failure = null;
            try
            {
                next = await enumerator.MoveNextAsync() ? enumerator.Current : null;
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                logger.LogInformation("Chat stream cancelled by the client: {ConversationId}", conversationId);
                metrics.RecordStream("cancelled");
                yield break;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Chat stream failed: {ConversationId}", conversationId);
                outcome = "failed";
                next = null;
                failure = new ErrorEvent(environment.IsDevelopment() ? ex.Message : GenericStreamError);
            }

            if (failure is not null)
            {
                metrics.RecordStream(outcome);
                yield return failure;
                yield break;
            }

            if (next is null)
                break;

            if (next is UsageEvent usage)
                metrics.RecordUsage(usage);

            yield return next;
        }

        metrics.RecordStream(outcome);
        yield return new DoneEvent();
    }
}
