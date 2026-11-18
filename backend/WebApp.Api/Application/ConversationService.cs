using WebApp.Api.Models;
using WebApp.Api.Security;

namespace WebApp.Api.Application;

/// <summary>
/// Conversation use cases with ownership enforcement (the only way endpoints reach conversations).
/// </summary>
public sealed class ConversationService(IConversationStore store, ILogger<ConversationService> logger)
{
    /// <summary>Upper bound of conversations scanned when listing (the store cannot filter by owner).</summary>
    internal const int MaxConversationsScanned = 500;

    /// <summary>
    /// Returns the conversation id for this turn: creates a new conversation owned by <paramref name="ownerId"/>,
    /// or verifies that the supplied one belongs to them.
    /// </summary>
    /// <exception cref="ConversationNotFoundException">Missing or owned by another user.</exception>
    public async Task<string> ResolveForTurnAsync(string ownerId, string? conversationId, string? firstMessage, CancellationToken cancellationToken)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(ownerId);

        if (!string.IsNullOrEmpty(conversationId))
        {
            await EnsureOwnerAsync(ownerId, conversationId, cancellationToken);
            return conversationId;
        }

        var metadata = new Dictionary<string, string> { [ConversationOwnership.OwnerMetadataKey] = ownerId };
        if (ConversationOwnership.BuildTitle(firstMessage) is { } title)
            metadata[ConversationOwnership.TitleMetadataKey] = title;

        var id = await store.CreateAsync(metadata, cancellationToken);
        logger.LogInformation("Created conversation {ConversationId}", id);
        return id;
    }

    /// <summary>The caller's conversations, most recent first (up to <paramref name="limit"/> + 1 to detect more pages).</summary>
    public async Task<IReadOnlyList<ConversationSummary>> ListAsync(string ownerId, int limit, CancellationToken cancellationToken)
    {
        var result = new List<ConversationSummary>();
        var scanned = 0;

        await foreach (var conversation in store.ListAsync(cancellationToken))
        {
            if (++scanned > MaxConversationsScanned || result.Count > limit)
                break;

            if (!ConversationOwnership.IsOwnedBy(conversation.Metadata, ownerId))
                continue;

            result.Add(new ConversationSummary
            {
                Id = conversation.Id,
                Title = conversation.Metadata.GetValueOrDefault(ConversationOwnership.TitleMetadataKey),
                CreatedAt = conversation.CreatedAt.ToUnixTimeSeconds(),
            });
        }

        return result;
    }

    /// <exception cref="ConversationNotFoundException">Missing or owned by another user.</exception>
    public async Task<IReadOnlyList<ConversationMessageInfo>> GetMessagesAsync(string ownerId, string conversationId, CancellationToken cancellationToken)
    {
        await EnsureOwnerAsync(ownerId, conversationId, cancellationToken);
        return await store.GetMessagesAsync(conversationId, cancellationToken);
    }

    private async Task EnsureOwnerAsync(string ownerId, string conversationId, CancellationToken cancellationToken)
    {
        var conversation = await store.GetAsync(conversationId, cancellationToken);
        if (conversation is null)
            throw new ConversationNotFoundException(conversationId);

        if (!ConversationOwnership.IsOwnedBy(conversation.Metadata, ownerId))
        {
            // Warning on purpose: repeated hits indicate an enumeration attempt.
            logger.LogWarning("Denied access to conversation {ConversationId} not owned by the caller", conversationId);
            throw new ConversationNotFoundException(conversationId);
        }
    }
}
