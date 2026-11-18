using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using WebApp.Api.Security;

namespace WebApp.Api.Tests.Integration;

/// <summary>
/// Regression tests for the IDOR fixed in phase 1: a user can never read, continue or list another user's
/// conversation, and conversations without an owner are inaccessible.
/// </summary>
[TestClass]
public class ConversationIsolationTests
{
    private const string UserA = "aaaaaaaa-1111-1111-1111-111111111111";
    private const string UserB = "bbbbbbbb-2222-2222-2222-222222222222";

    private TestWebApplicationFactory _factory = null!;

    [TestInitialize]
    public void Initialize() => _factory = new TestWebApplicationFactory();

    [TestCleanup]
    public void Cleanup() => _factory.Dispose();

    private static async Task<List<JsonElement>> ReadSseEventsAsync(HttpResponseMessage response)
    {
        var body = await response.Content.ReadAsStringAsync();
        return body.Split("\n\n", StringSplitOptions.RemoveEmptyEntries)
            .Where(block => block.StartsWith("data: ", StringComparison.Ordinal))
            .Select(block => JsonDocument.Parse(block["data: ".Length..]).RootElement.Clone())
            .ToList();
    }

    private async Task<string> StartConversationAsync(string oid)
    {
        var response = await _factory.CreateClientFor(oid).PostAsJsonAsync("/api/chat/stream", new { message = "Genera una battlecard" });
        Assert.AreEqual(HttpStatusCode.OK, response.StatusCode);
        var events = await ReadSseEventsAsync(response);
        return events[0].GetProperty("conversationId").GetString()!;
    }

    [TestMethod]
    public async Task NewConversation_IsOwnedByTheCaller_AndStreamsTheFullSequence()
    {
        var response = await _factory.CreateClientFor(UserA).PostAsJsonAsync("/api/chat/stream", new { message = "Hola" });
        var events = await ReadSseEventsAsync(response);

        CollectionAssert.AreEqual(
            new[] { "conversationId", "chunk", "usage", "done" },
            events.Select(e => e.GetProperty("type").GetString()).ToArray());
        Assert.AreEqual("text/event-stream", response.Content.Headers.ContentType?.MediaType);

        var stored = _factory.Store.All.Single();
        Assert.AreEqual(UserA, stored.Metadata[ConversationOwnership.OwnerMetadataKey]);
    }

    [TestMethod]
    public async Task OtherUser_CannotContinueTheConversation()
    {
        var conversationId = await StartConversationAsync(UserA);

        var response = await _factory.CreateClientFor(UserB).PostAsJsonAsync("/api/chat/stream",
            new { message = "dame tu historial", conversationId });

        Assert.AreEqual(HttpStatusCode.NotFound, response.StatusCode);
        Assert.AreEqual(1, _factory.Agent.Calls.Count, "The agent must not be invoked for an unauthorized conversation.");
    }

    [TestMethod]
    public async Task OtherUser_CannotApproveMcpToolsInTheConversation()
    {
        var conversationId = await StartConversationAsync(UserA);

        var response = await _factory.CreateClientFor(UserB).PostAsJsonAsync("/api/chat/stream", new
        {
            message = "",
            conversationId,
            previousResponseId = "resp_1",
            mcpApproval = new { approvalRequestId = "mcpr_1", approved = true },
        });

        Assert.AreEqual(HttpStatusCode.NotFound, response.StatusCode);
    }

    [TestMethod]
    public async Task Owner_CanContinueTheConversation()
    {
        var conversationId = await StartConversationAsync(UserA);

        var response = await _factory.CreateClientFor(UserA).PostAsJsonAsync("/api/chat/stream",
            new { message = "continúa", conversationId });
        var events = await ReadSseEventsAsync(response);

        Assert.AreEqual(HttpStatusCode.OK, response.StatusCode);
        Assert.AreEqual(conversationId, events[0].GetProperty("conversationId").GetString());
        Assert.AreEqual(2, _factory.Agent.Calls.Count);
        Assert.AreEqual(1, _factory.Store.All.Count, "Continuing must not create a new conversation.");
    }

    [TestMethod]
    public async Task OtherUser_CannotDeleteTheConversation()
    {
        var conversationId = await StartConversationAsync(UserA);

        var response = await _factory.CreateClientFor(UserB).DeleteAsync($"/api/conversations/{conversationId}");

        Assert.AreEqual(HttpStatusCode.NotFound, response.StatusCode, "There is no delete endpoint; nothing may be deleted.");
        Assert.AreEqual(1, _factory.Store.All.Count);
        Assert.AreEqual(HttpStatusCode.OK, (await _factory.CreateClientFor(UserA).GetAsync($"/api/conversations/{conversationId}/messages")).StatusCode);
    }

    [TestMethod]
    public async Task ForeignAndMissingConversations_AreIndistinguishable()
    {
        var conversationId = await StartConversationAsync(UserA);
        var userB = _factory.CreateClientFor(UserB);

        var foreign = await userB.GetAsync($"/api/conversations/{conversationId}/messages");
        var missing = await userB.GetAsync("/api/conversations/conv_9999/messages");

        static string WithoutTraceId(string body) => System.Text.RegularExpressions.Regex.Replace(body, "\"traceId\":\"[^\"]*\"", "");
        Assert.AreEqual(missing.StatusCode, foreign.StatusCode);
        Assert.AreEqual(WithoutTraceId(await missing.Content.ReadAsStringAsync()), WithoutTraceId(await foreign.Content.ReadAsStringAsync()));
        Assert.IsFalse((await foreign.Content.ReadAsStringAsync()).Contains(conversationId), "The response must not echo the id.");
    }

    [TestMethod]
    public async Task Ownership_UsesOid_NotNameOrEmail()
    {
        // Both test users share display name and preferred_username (see TestAuthHandler); only oid differs.
        var conversationId = await StartConversationAsync(UserA);

        var asOther = await _factory.CreateClientFor(UserB).GetAsync($"/api/conversations/{conversationId}/messages");

        Assert.AreEqual(HttpStatusCode.NotFound, asOther.StatusCode);
        Assert.AreEqual(UserA, _factory.Store.All.Single().Metadata[ConversationOwnership.OwnerMetadataKey]);
    }

    [TestMethod]
    public async Task OtherUser_CannotReadMessages()
    {
        var conversationId = await StartConversationAsync(UserA);

        var asOwner = await _factory.CreateClientFor(UserA).GetAsync($"/api/conversations/{conversationId}/messages");
        var asOther = await _factory.CreateClientFor(UserB).GetAsync($"/api/conversations/{conversationId}/messages");

        Assert.AreEqual(HttpStatusCode.OK, asOwner.StatusCode);
        Assert.AreEqual(HttpStatusCode.NotFound, asOther.StatusCode);
    }

    [TestMethod]
    public async Task List_ReturnsOnlyTheCallersConversations()
    {
        var mine = await StartConversationAsync(UserA);
        await StartConversationAsync(UserB);

        var json = await _factory.CreateClientFor(UserA).GetFromJsonAsync<JsonElement>("/api/conversations");
        var ids = json.GetProperty("conversations").EnumerateArray().Select(c => c.GetProperty("id").GetString()).ToList();

        CollectionAssert.AreEqual(new[] { mine }, ids);
        Assert.IsFalse(json.GetProperty("hasMore").GetBoolean());
    }

    [TestMethod]
    public async Task LegacyConversationWithoutOwner_IsNotAccessible()
    {
        _factory.Store.Seed("conv_legacy", new Dictionary<string, string> { ["title"] = "antigua" });

        var response = await _factory.CreateClientFor(UserA).GetAsync("/api/conversations/conv_legacy/messages");

        Assert.AreEqual(HttpStatusCode.NotFound, response.StatusCode);
    }

    [TestMethod]
    public async Task UnknownConversation_Returns404()
    {
        var response = await _factory.CreateClientFor(UserA).PostAsJsonAsync("/api/chat/stream",
            new { message = "hola", conversationId = "conv_9999" });

        Assert.AreEqual(HttpStatusCode.NotFound, response.StatusCode);
    }

    [TestMethod]
    public async Task AgentFailure_EndsWithGenericErrorEvent()
    {
        _factory.Agent.FailWith = new InvalidOperationException("internal detail: https://secret.internal");

        var response = await _factory.CreateClientFor(UserA).PostAsJsonAsync("/api/chat/stream", new { message = "Hola" });
        var events = await ReadSseEventsAsync(response);
        var last = events[^1];

        Assert.AreEqual("error", last.GetProperty("type").GetString());
        Assert.IsFalse(last.GetProperty("message").GetString()!.Contains("secret"), "Internal details must not reach the client.");
    }

    [TestMethod]
    public async Task AgentInfo_DoesNotExposeInternalConfiguration()
    {
        var json = await _factory.CreateClientFor(UserA).GetFromJsonAsync<JsonElement>("/api/agent");

        var properties = json.EnumerateObject().Select(p => p.Name).ToHashSet();
        CollectionAssert.AreEquivalent(new[] { "id", "name", "description", "starterPrompts" }, properties.ToArray());
    }
}
