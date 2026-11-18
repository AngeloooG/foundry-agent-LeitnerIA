using System.Net;
using System.Net.Http.Json;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace WebApp.Api.Tests.Integration;

[TestClass]
public class ApiSecurityTests
{
    private const string UserA = "11111111-1111-1111-1111-111111111111";

    private static TestWebApplicationFactory s_factory = null!;

    [ClassInitialize]
    public static void Initialize(TestContext _) => s_factory = new TestWebApplicationFactory();

    [ClassCleanup]
    public static void Cleanup() => s_factory.Dispose();

    private static HttpClient Client(string? oid = UserA, string? scopes = null)
    {
        var client = s_factory.CreateClient();
        if (oid is not null)
            client.DefaultRequestHeaders.Add(TestAuthHandler.OidHeader, oid);
        if (scopes is not null)
            client.DefaultRequestHeaders.Add(TestAuthHandler.ScopesHeader, scopes);
        return client;
    }

    [TestMethod]
    public async Task ChatStream_WithoutToken_Returns401()
    {
        var response = await Client(oid: null).PostAsJsonAsync("/api/chat/stream", new { message = "hola" });

        Assert.AreEqual(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [TestMethod]
    public async Task ChatStream_WithoutChatScope_Returns403()
    {
        var response = await Client(scopes: "User.Read").PostAsJsonAsync("/api/chat/stream", new { message = "hola" });

        Assert.AreEqual(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [TestMethod]
    public async Task ChatStream_EmptyMessage_Returns400BeforeCallingAzure()
    {
        var response = await Client().PostAsJsonAsync("/api/chat/stream", new { message = "  " });

        Assert.AreEqual(HttpStatusCode.BadRequest, response.StatusCode);
        StringAssert.Contains(await response.Content.ReadAsStringAsync(), "vac");
    }

    [TestMethod]
    public async Task ChatStream_PathTraversalConversationId_Returns400()
    {
        var response = await Client().PostAsJsonAsync("/api/chat/stream",
            new { message = "hola", conversationId = "../../files" });

        Assert.AreEqual(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [TestMethod]
    public async Task ChatStream_InvalidAttachment_Returns400()
    {
        var response = await Client().PostAsJsonAsync("/api/chat/stream",
            new { message = "hola", imageDataUris = new[] { "data:image/png;base64,TVo=" } });

        Assert.AreEqual(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [TestMethod]
    public async Task ConversationMessages_InvalidId_Returns400()
    {
        var response = await Client().GetAsync("/api/conversations/bad%20id/messages");

        Assert.AreEqual(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [TestMethod]
    [DataRow("POST", "/api/files/cleanup")]
    [DataRow("GET", "/api/files/uploaded")]
    [DataRow("GET", "/api/files/file-123")]
    [DataRow("GET", "/api/agent/info")]
    [DataRow("DELETE", "/api/conversations/conv_123")]
    public async Task RemovedEndpoints_Return404(string method, string path)
    {
        var response = await Client().SendAsync(new HttpRequestMessage(new HttpMethod(method), path));

        Assert.AreEqual(HttpStatusCode.NotFound, response.StatusCode);
    }

    [TestMethod]
    [DataRow("/api/health")]
    [DataRow("/health")]
    [DataRow("/alive")]
    public async Task HealthEndpoints_AreAnonymous(string path)
    {
        var response = await Client(oid: null).GetAsync(path);

        Assert.AreEqual(HttpStatusCode.OK, response.StatusCode);
    }

    [TestMethod]
    public async Task Responses_IncludeSecurityHeaders()
    {
        var response = await Client(oid: null).GetAsync("/api/health");

        Assert.IsTrue(response.Headers.TryGetValues("Content-Security-Policy", out var csp));
        StringAssert.Contains(csp.Single(), "frame-ancestors 'none'");
        StringAssert.Contains(csp.Single(), "img-src 'self' data: blob:");
        Assert.AreEqual("nosniff", response.Headers.GetValues("X-Content-Type-Options").Single());
        Assert.AreEqual("DENY", response.Headers.GetValues("X-Frame-Options").Single());
        StringAssert.StartsWith(response.Headers.GetValues("Strict-Transport-Security").Single(), "max-age=");
        Assert.AreEqual("no-store", response.Headers.CacheControl?.ToString());
    }

    [TestMethod]
    public async Task Cors_IsNotGrantedOutsideDevelopment()
    {
        var request = new HttpRequestMessage(HttpMethod.Options, "/api/chat/stream");
        request.Headers.Add("Origin", "http://localhost:5173");
        request.Headers.Add("Access-Control-Request-Method", "POST");

        var response = await Client(oid: null).SendAsync(request);

        Assert.IsFalse(response.Headers.Contains("Access-Control-Allow-Origin"));
    }
}

[TestClass]
public class RateLimitingTests
{
    [TestMethod]
    public async Task ChatStream_IsRateLimitedPerUser()
    {
        using var factory = new TestWebApplicationFactory(chatPermitsPerMinute: 2);
        var userA = factory.CreateClient();
        userA.DefaultRequestHeaders.Add(TestAuthHandler.OidHeader, "aaaaaaaa-0000-0000-0000-000000000000");
        var userB = factory.CreateClient();
        userB.DefaultRequestHeaders.Add(TestAuthHandler.OidHeader, "bbbbbbbb-0000-0000-0000-000000000000");

        // Empty messages are rejected with 400 but still consume the user's quota.
        for (var i = 0; i < 2; i++)
            Assert.AreEqual(HttpStatusCode.BadRequest, (await userA.PostAsJsonAsync("/api/chat/stream", new { message = "" })).StatusCode);

        var limited = await userA.PostAsJsonAsync("/api/chat/stream", new { message = "" });
        Assert.AreEqual(HttpStatusCode.TooManyRequests, limited.StatusCode);

        // Another user has an independent quota.
        Assert.AreEqual(HttpStatusCode.BadRequest, (await userB.PostAsJsonAsync("/api/chat/stream", new { message = "" })).StatusCode);
    }
}
