namespace WebApp.Api.Security;

/// <summary>
/// Ownership rules for Foundry conversations.
/// </summary>
/// <remarks>
/// Foundry conversations are a project-level resource: with managed identity every caller of this API
/// shares the same data-plane identity, so Foundry itself cannot tell users apart. Ownership is therefore
/// recorded by this API in the conversation metadata (<see cref="OwnerMetadataKey"/>) at creation time and
/// enforced on every read/write. Conversations without an owner (created before this control existed) are
/// treated as not owned by anyone and are inaccessible through the API.
/// </remarks>
public static class ConversationOwnership
{
    /// <summary>Metadata key holding the Entra object id of the conversation owner.</summary>
    public const string OwnerMetadataKey = "owner_oid";

    /// <summary>Metadata key holding the display title of the conversation.</summary>
    public const string TitleMetadataKey = "title";

    /// <summary>Maximum title length stored in metadata (Foundry limits metadata values to 512 chars).</summary>
    public const int MaxTitleLength = 50;

    /// <summary>
    /// True only when the metadata contains an owner equal to <paramref name="ownerId"/> (ordinal, case-insensitive
    /// because GUIDs may be serialized in different casing).
    /// </summary>
    public static bool IsOwnedBy(IEnumerable<KeyValuePair<string, string>>? metadata, string ownerId)
    {
        if (metadata is null || string.IsNullOrWhiteSpace(ownerId))
            return false;

        foreach (var (key, value) in metadata)
        {
            if (string.Equals(key, OwnerMetadataKey, StringComparison.Ordinal))
                return string.Equals(value, ownerId, StringComparison.OrdinalIgnoreCase);
        }

        return false;
    }

    /// <summary>
    /// Builds a short title from the first user message without splitting surrogate pairs.
    /// </summary>
    public static string? BuildTitle(string? firstMessage)
    {
        if (string.IsNullOrWhiteSpace(firstMessage))
            return null;

        var text = firstMessage.Trim();
        var info = new System.Globalization.StringInfo(text);
        return info.LengthInTextElements <= MaxTitleLength
            ? text
            : info.SubstringByTextElements(0, MaxTitleLength) + "...";
    }
}

/// <summary>
/// Raised when a conversation does not exist or belongs to another user.
/// Both cases map to 404 so the API does not reveal which conversation ids exist.
/// </summary>
public sealed class ConversationNotFoundException(string conversationId)
    : Exception("Conversation not found or not accessible.")
{
    public string ConversationId { get; } = conversationId;
}
