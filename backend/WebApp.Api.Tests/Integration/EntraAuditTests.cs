using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using WebApp.Api.Security;

namespace WebApp.Api.Tests.Integration;

/// <summary>
/// Audit of the access model (audience, scope, policies, 401/403 responses, groups) through the REAL JWT pipeline.
/// </summary>
[TestClass]
public class EntraAuditTests
{
    private const string BackendClientId = "00000000-0000-0000-0000-0000000000b1";
    private const string AllowedGroup = "11111111-2222-3333-4444-555555555555";

    private static readonly Dictionary<string, string?> OboSettings = new()
    {
        ["ENTRA_BACKEND_CLIENT_ID"] = BackendClientId,
        // Required by FoundryOptions when OBO is configured (not used: Foundry is faked).
        ["MANAGED_IDENTITY_CLIENT_ID"] = "00000000-0000-0000-0000-0000000000c1",
    };

    private static HttpClient ClientWithToken(TestWebApplicationFactory factory, string token)
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return client;
    }

    private static async Task<HttpStatusCode> GetAsync(TestWebApplicationFactory factory, string token) =>
        (await ClientWithToken(factory, token).GetAsync("/api/conversations")).StatusCode;

    // ------------------------------------------------------------------ 1. Audience

    [TestMethod]
    public async Task SingleRegistration_AcceptsOnlyTheApiAppAudience()
    {
        using var factory = new TestWebApplicationFactory(useRealJwt: true);

        Assert.AreEqual(HttpStatusCode.OK, await GetAsync(factory, TestTokens.Create(audience: $"api://{TestWebApplicationFactory.ClientId}")));
        Assert.AreEqual(HttpStatusCode.OK, await GetAsync(factory, TestTokens.Create(audience: TestWebApplicationFactory.ClientId)));
        Assert.AreEqual(HttpStatusCode.Unauthorized, await GetAsync(factory, TestTokens.Create(audience: "api://arbitrary-app")));
        Assert.AreEqual(HttpStatusCode.Unauthorized, await GetAsync(factory, TestTokens.Create(audience: "https://graph.microsoft.com")));
    }

    [TestMethod]
    public async Task SeparateRegistrations_BackendAudience_IsAccepted()
    {
        using var factory = new TestWebApplicationFactory(useRealJwt: true, settings: OboSettings);

        Assert.AreEqual(HttpStatusCode.OK, await GetAsync(factory, TestTokens.Create(audience: $"api://{BackendClientId}")));
        Assert.AreEqual(HttpStatusCode.OK, await GetAsync(factory, TestTokens.Create(audience: BackendClientId)));
    }

    [TestMethod]
    public async Task SeparateRegistrations_FrontendClientIdAsAudience_IsRejected()
    {
        using var factory = new TestWebApplicationFactory(useRealJwt: true, settings: OboSettings);

        Assert.AreEqual(HttpStatusCode.Unauthorized, await GetAsync(factory, TestTokens.Create(audience: TestWebApplicationFactory.ClientId)));
        Assert.AreEqual(HttpStatusCode.Unauthorized, await GetAsync(factory, TestTokens.Create(audience: $"api://{TestWebApplicationFactory.ClientId}")));
    }

    [TestMethod]
    public async Task SeparateRegistrations_ArbitraryAudience_IsRejected()
    {
        using var factory = new TestWebApplicationFactory(useRealJwt: true, settings: OboSettings);

        Assert.AreEqual(HttpStatusCode.Unauthorized, await GetAsync(factory, TestTokens.Create(audience: "api://arbitrary-app")));
    }

    [TestMethod]
    public void BackendClientIdEqualToFrontendClientId_FailsAtStartup()
    {
        using var factory = new TestWebApplicationFactory(useRealJwt: true, settings: new Dictionary<string, string?>
        {
            ["ENTRA_BACKEND_CLIENT_ID"] = TestWebApplicationFactory.ClientId,
            ["MANAGED_IDENTITY_CLIENT_ID"] = "00000000-0000-0000-0000-0000000000c1",
        });

        var exception = Assert.ThrowsExactly<Microsoft.Extensions.Options.OptionsValidationException>(() => factory.CreateClient());
        StringAssert.Contains(exception.Message, "ENTRA_BACKEND_CLIENT_ID");
    }

    // ------------------------------------------------------------------ 2. Scope

    [TestMethod]
    [DataRow("Chat.ReadWrite", HttpStatusCode.OK)]
    [DataRow("openid User.Read Chat.ReadWrite profile", HttpStatusCode.OK)]
    [DataRow("Chat.ReadWrite.All", HttpStatusCode.Forbidden)]
    [DataRow("User.Read Chat.ReadWriteX", HttpStatusCode.Forbidden)]
    [DataRow("XChat.ReadWrite", HttpStatusCode.Forbidden)]
    [DataRow("Chat.Read", HttpStatusCode.Forbidden)]
    [DataRow("chat.readwrite", HttpStatusCode.Forbidden)]
    public async Task Scope_IsMatchedAsAWholeToken(string scopes, HttpStatusCode expected)
    {
        using var factory = new TestWebApplicationFactory(useRealJwt: true);

        Assert.AreEqual(expected, await GetAsync(factory, TestTokens.Create(scopes: scopes)));
    }

    // ------------------------------------------------------------------ 3. Policies

    [TestMethod]
    public void EveryApiEndpoint_UsesTheCorporatePolicy_AndOnlyProbesAndSpaAreAnonymous()
    {
        using var factory = new TestWebApplicationFactory(useRealJwt: true);
        _ = factory.CreateClient();
        var endpoints = factory.Services.GetRequiredService<EndpointDataSource>().Endpoints.OfType<RouteEndpoint>().ToList();

        var anonymous = endpoints
            .Where(e => e.Metadata.GetMetadata<IAllowAnonymous>() is not null)
            .Select(e => e.RoutePattern.RawText)
            .OrderBy(p => p)
            .ToArray();
        CollectionAssert.AreEquivalent(new[] { "/alive", "/api/health", "/health", "{*path:nonfile}" }, anonymous);

        foreach (var endpoint in endpoints.Where(e => e.RoutePattern.RawText!.StartsWith("/api", StringComparison.Ordinal)
                                                      && e.RoutePattern.RawText != "/api/health"))
        {
            // Explicit policy, or none at all (then the identical FallbackPolicy applies). Never a weaker policy.
            var policies = endpoint.Metadata.GetOrderedMetadata<IAuthorizeData>().Select(a => a.Policy).Distinct().ToArray();
            Assert.IsTrue(policies.All(p => p == AuthorizationPolicies.ChatScope),
                $"{endpoint.RoutePattern.RawText} uses an unexpected policy: {string.Join(",", policies)}");
        }
    }

    [TestMethod]
    [DataRow("POST", "/api/chat/stream")]
    [DataRow("GET", "/api/agent")]
    [DataRow("GET", "/api/conversations")]
    [DataRow("GET", "/api/conversations/conv_1/messages")]
    [DataRow("GET", "/api/unknown-route")]
    public async Task ProtectedRoutes_WithoutToken_Return401(string method, string path)
    {
        using var factory = new TestWebApplicationFactory(useRealJwt: true);
        var request = new HttpRequestMessage(new HttpMethod(method), path);
        if (method == "POST")
            request.Content = JsonContent.Create(new { message = "hola" });

        Assert.AreEqual(HttpStatusCode.Unauthorized, (await factory.CreateClient().SendAsync(request)).StatusCode);
    }

    // ------------------------------------------------------------------ 4. 401 / 403 responses

    [TestMethod]
    [DataRow("other-tenant", HttpStatusCode.Unauthorized)]
    [DataRow("wrong-audience", HttpStatusCode.Unauthorized)]
    [DataRow("missing-scope", HttpStatusCode.Forbidden)]
    [DataRow("not-in-group", HttpStatusCode.Forbidden)]
    public async Task Rejections_HappenBeforeTheAgent_AndDoNotLeakConfiguration(string scenario, HttpStatusCode expected)
    {
        using var factory = new TestWebApplicationFactory(useRealJwt: true,
            settings: new Dictionary<string, string?> { ["ENTRA_ALLOWED_GROUP_ID"] = AllowedGroup });
        var token = scenario switch
        {
            "other-tenant" => TestTokens.Create(tenantId: TestTokens.OtherTenantId, groups: [AllowedGroup]),
            "wrong-audience" => TestTokens.Create(audience: "api://arbitrary-app", groups: [AllowedGroup]),
            "missing-scope" => TestTokens.Create(scopes: "User.Read", groups: [AllowedGroup]),
            _ => TestTokens.Create(groups: ["66666666-7777-8888-9999-000000000000"]),
        };

        var response = await ClientWithToken(factory, token).PostAsJsonAsync("/api/chat/stream", new { message = "hola" });
        var body = await response.Content.ReadAsStringAsync();
        var wwwAuthenticate = string.Join(" ", response.Headers.WwwAuthenticate.Select(h => h.ToString()));

        Assert.AreEqual(expected, response.StatusCode);
        Assert.AreEqual(0, factory.Agent.Calls.Count, "IAgentGateway must not be invoked.");
        Assert.AreEqual(0, factory.Store.All.Count, "No conversation must be created.");
        Assert.AreEqual("application/problem+json", response.Content.Headers.ContentType?.MediaType);

        foreach (var secret in new[]
                 {
                     TestWebApplicationFactory.TenantId, TestWebApplicationFactory.ClientId, AllowedGroup,
                     TestTokens.OtherTenantId, "login.microsoftonline.com", "sts.windows.net", "arbitrary-app",
                     "issuer", "audience", "tid", "scp", "groups", "IDX",
                 })
        {
            Assert.IsFalse(body.Contains(secret, StringComparison.OrdinalIgnoreCase), $"Body leaks '{secret}': {body}");
            Assert.IsFalse(wwwAuthenticate.Contains(secret, StringComparison.OrdinalIgnoreCase), $"WWW-Authenticate leaks '{secret}': {wwwAuthenticate}");
        }
        Assert.IsFalse(wwwAuthenticate.Contains("error_description", StringComparison.OrdinalIgnoreCase), wwwAuthenticate);
        StringAssert.Contains(body, expected == HttpStatusCode.Unauthorized ? "Sesión no válida" : "Acceso denegado");
    }

    // ------------------------------------------------------------------ 5. Groups

    [TestMethod]
    public async Task GroupsOverage_WithoutGroupConfigured_DoesNotBlock()
    {
        using var factory = new TestWebApplicationFactory(useRealJwt: true);

        Assert.AreEqual(HttpStatusCode.OK, await GetAsync(factory, TestTokens.Create(hasGroupsOverage: true)));
    }

    [TestMethod]
    [DataRow("11111111-2222-3333-4444-555555555555", HttpStatusCode.OK)]
    [DataRow("{11111111-2222-3333-4444-555555555555}", HttpStatusCode.Forbidden)]
    [DataRow("11111111-2222-3333-4444-555555555556", HttpStatusCode.Forbidden)]
    [DataRow("x11111111-2222-3333-4444-555555555555", HttpStatusCode.Forbidden)]
    [DataRow("11111111-2222-3333-4444-555555555555,extra", HttpStatusCode.Forbidden)]
    [DataRow("11111111-2222-3333-4444", HttpStatusCode.Forbidden)]
    public async Task GroupClaim_RequiresExactGuidMatch(string groupClaim, HttpStatusCode expected)
    {
        using var factory = new TestWebApplicationFactory(useRealJwt: true,
            settings: new Dictionary<string, string?> { ["ENTRA_ALLOWED_GROUP_ID"] = AllowedGroup });

        Assert.AreEqual(expected, await GetAsync(factory, TestTokens.Create(groups: [groupClaim])));
    }
}
