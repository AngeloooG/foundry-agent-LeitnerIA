using System.Collections.Concurrent;
using System.Runtime.CompilerServices;
using WebApp.Api.Application;
using WebApp.Api.Models;

namespace WebApp.Api.Tests.Fakes;

/// <summary>In-memory <see cref="IConversationStore"/> (no Azure).</summary>
public sealed class InMemoryConversationStore : IConversationStore
{
    private readonly ConcurrentDictionary<string, ConversationRecord> _conversations = new();
    private int _sequence;

    public IReadOnlyCollection<ConversationRecord> All => _conversations.Values.ToList();

    public Task<string> CreateAsync(IReadOnlyDictionary<string, string> metadata, CancellationToken cancellationToken)
    {
        var id = $"conv_{Interlocked.Increment(ref _sequence):D4}";
        _conversations[id] = new ConversationRecord(id, new Dictionary<string, string>(metadata), DateTimeOffset.UtcNow.AddSeconds(_sequence));
        return Task.FromResult(id);
    }

    /// <summary>Adds a conversation directly (e.g. a legacy one without owner).</summary>
    public void Seed(string id, Dictionary<string, string> metadata) =>
        _conversations[id] = new ConversationRecord(id, metadata, DateTimeOffset.UtcNow);

    public Task<ConversationRecord?> GetAsync(string conversationId, CancellationToken cancellationToken) =>
        Task.FromResult(_conversations.GetValueOrDefault(conversationId));

    public async IAsyncEnumerable<ConversationRecord> ListAsync([EnumeratorCancellation] CancellationToken cancellationToken)
    {
        foreach (var conversation in _conversations.Values.OrderByDescending(c => c.CreatedAt))
        {
            await Task.Yield();
            yield return conversation;
        }
    }

    public Task<IReadOnlyList<ConversationMessageInfo>> GetMessagesAsync(string conversationId, CancellationToken cancellationToken) =>
        Task.FromResult<IReadOnlyList<ConversationMessageInfo>>(
            [new ConversationMessageInfo { Role = "user", Content = $"mensaje de {conversationId}" }]);
}

/// <summary>Scripted <see cref="IAgentGateway"/>: replies "Hola" or throws when <see cref="FailWith"/> is set.</summary>
public sealed class FakeAgentGateway : IAgentGateway
{
    public Exception? FailWith { get; set; }
    public List<(string ConversationId, AgentTurn Turn)> Calls { get; } = [];

    public async IAsyncEnumerable<ChatStreamEvent> StreamAsync(
        string conversationId,
        AgentTurn turn,
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        Calls.Add((conversationId, turn));
        await Task.Yield();
        yield return new TextChunkEvent("Hola");

        if (FailWith is not null)
            throw FailWith;

        yield return new UsageEvent(12.5, 10, 5, 15);
    }

    public Task<AgentInfo> GetAgentInfoAsync(CancellationToken cancellationToken) =>
        Task.FromResult(new AgentInfo("test-agent", "LeitnerIA", "Battlecards", ["Prompt 1"]));
}
