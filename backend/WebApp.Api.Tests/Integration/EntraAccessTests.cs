using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace WebApp.Api.Tests.Integration;

/// <summary>
/// Tenant-wide access with an optional group restriction, exercised through the REAL JWT bearer validation
/// (issuer, tid, audience, signature, lifetime) and the real authorization policy.
/// </summary>
[TestClass]
public class EntraAccessTests
{
    private const string AllowedGroup = "11111111-2222-3333-4444-555555555555";
    private const string OtherGroup = "66666666-7777-8888-9999-000000000000";
    private const string ProtectedEndpoint = "/api/conversations";

    private static async Task<HttpStatusCode> CallAsync(TestWebApplicationFactory factory, string token)
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return (await client.GetAsync(ProtectedEndpoint)).StatusCode;
    }

    private static TestWebApplicationFactory WithoutGroup() => new(useRealJwt: true);

    private static TestWebApplicationFactory WithGroup(string groupId) =>
        new(useRealJwt: true, settings: new Dictionary<string, string?> { ["ENTRA_ALLOWED_GROUP_ID"] = groupId });

    [TestMethod]
    public async Task TenantUser_WithoutGroupConfigured_IsAllowed()
    {
        using var factory = WithoutGroup();

        Assert.AreEqual(HttpStatusCode.OK, await CallAsync(factory, TestTokens.Create()));
    }

    [TestMethod]
    public async Task TenantUser_V1AudienceFormat_IsAllowed()
    {
        using var factory = WithoutGroup();

        Assert.AreEqual(HttpStatusCode.OK,
            await CallAsync(factory, TestTokens.Create(audience: $"api://{TestWebApplicationFactory.BackendClientId}")));
    }

    [TestMethod]
    public async Task UserFromAnotherTenant_IsRejected()
    {
        // Entra ID signs every tenant's tokens with the same keys: the signature is valid, the tenant is not.
        using var factory = WithoutGroup();

        Assert.AreEqual(HttpStatusCode.Unauthorized, await CallAsync(factory, TestTokens.Create(tenantId: TestTokens.OtherTenantId)));
    }

    [TestMethod]
    public async Task TenantIssuerWithForeignTidClaim_IsRejected()
    {
        using var factory = WithoutGroup();
        var token = TestTokens.Create(
            tenantId: TestTokens.OtherTenantId,
            issuer: TestTokens.IssuerFor(TestWebApplicationFactory.TenantId));

        Assert.AreEqual(HttpStatusCode.Unauthorized, await CallAsync(factory, token));
    }

    [TestMethod]
    public async Task WrongAudience_IsRejected()
    {
        using var factory = WithoutGroup();

        Assert.AreEqual(HttpStatusCode.Unauthorized,
            await CallAsync(factory, TestTokens.Create(audience: "api://another-application")));
    }

    [TestMethod]
    public async Task ExpiredToken_IsRejected()
    {
        using var factory = WithoutGroup();

        Assert.AreEqual(HttpStatusCode.Unauthorized,
            await CallAsync(factory, TestTokens.Create(expires: DateTime.UtcNow.AddMinutes(-10))));
    }

    [TestMethod]
    public async Task ForgedSignature_IsRejected()
    {
        using var factory = WithoutGroup();

        Assert.AreEqual(HttpStatusCode.Unauthorized,
            await CallAsync(factory, TestTokens.Create(signingKey: TestTokens.UntrustedKey)));
    }

    [TestMethod]
    public async Task TokenWithoutApiScope_IsForbidden()
    {
        using var factory = WithoutGroup();

        Assert.AreEqual(HttpStatusCode.Forbidden, await CallAsync(factory, TestTokens.Create(scopes: "User.Read")));
    }

    [TestMethod]
    public async Task GroupConfigured_Member_IsAllowed()
    {
        using var factory = WithGroup(AllowedGroup);

        Assert.AreEqual(HttpStatusCode.OK,
            await CallAsync(factory, TestTokens.Create(groups: [OtherGroup, AllowedGroup])));
    }

    [TestMethod]
    public async Task GroupConfigured_NonMember_IsForbidden()
    {
        using var factory = WithGroup(AllowedGroup);

        Assert.AreEqual(HttpStatusCode.Forbidden, await CallAsync(factory, TestTokens.Create(groups: [OtherGroup])));
    }

    [TestMethod]
    public async Task GroupConfigured_NonMember_GetsSpanishProblemDetails()
    {
        using var factory = WithGroup(AllowedGroup);
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", TestTokens.Create(groups: [OtherGroup]));

        var response = await client.PostAsJsonAsync("/api/chat/stream", new { message = "hola" });
        var body = await response.Content.ReadAsStringAsync();

        Assert.AreEqual(HttpStatusCode.Forbidden, response.StatusCode);
        StringAssert.Contains(body, "Acceso denegado");
        Assert.AreEqual(0, factory.Agent.Calls.Count, "The agent must not be invoked for an unauthorized user.");
    }

    [TestMethod]
    public async Task GroupConfigured_TokenWithoutGroupsClaim_IsForbidden()
    {
        using var factory = WithGroup(AllowedGroup);

        Assert.AreEqual(HttpStatusCode.Forbidden, await CallAsync(factory, TestTokens.Create()));
    }

    [TestMethod]
    public async Task GroupConfigured_GroupsOverage_FailsClosed()
    {
        using var factory = WithGroup(AllowedGroup);

        Assert.AreEqual(HttpStatusCode.Forbidden, await CallAsync(factory, TestTokens.Create(hasGroupsOverage: true)));
    }

    [TestMethod]
    public async Task HealthEndpoint_StaysAnonymous_WithGroupConfigured()
    {
        using var factory = WithGroup(AllowedGroup);

        Assert.AreEqual(HttpStatusCode.OK, (await factory.CreateClient().GetAsync("/api/health")).StatusCode);
    }

    // Single-registration development mode: the SPA registration is also the API audience and issues v1 tokens
    // (iss https://sts.windows.net/{tid}/, aud api://{spa}), exactly what the pre-split deployment received.
    private static TestWebApplicationFactory SingleRegistration() =>
        new(useRealJwt: true, settings: new Dictionary<string, string?>
        {
            ["ENTRA_SINGLE_APP_REGISTRATION"] = "true",
            ["ENTRA_BACKEND_CLIENT_ID"] = TestWebApplicationFactory.FrontendClientId,
        });

    private static string V1TokenFor(string audience, string scopes = "Chat.ReadWrite") =>
        TestTokens.Create(
            issuer: $"https://sts.windows.net/{TestWebApplicationFactory.TenantId}/",
            audience: audience,
            scopes: scopes);

    [TestMethod]
    public async Task SingleRegistration_V1TokenForTheSpaRegistration_IsAllowed()
    {
        using var factory = SingleRegistration();

        Assert.AreEqual(HttpStatusCode.OK,
            await CallAsync(factory, V1TokenFor($"api://{TestWebApplicationFactory.FrontendClientId}")));
    }

    [TestMethod]
    public async Task SingleRegistration_TokenForAnotherRegistration_IsRejected()
    {
        using var factory = SingleRegistration();

        Assert.AreEqual(HttpStatusCode.Unauthorized,
            await CallAsync(factory, V1TokenFor($"api://{TestWebApplicationFactory.BackendClientId}")));
    }

    [TestMethod]
    public async Task SingleRegistration_TokenWithoutApiScope_IsForbidden()
    {
        using var factory = SingleRegistration();

        Assert.AreEqual(HttpStatusCode.Forbidden,
            await CallAsync(factory, V1TokenFor($"api://{TestWebApplicationFactory.FrontendClientId}", scopes: "User.Read")));
    }

    [TestMethod]
    public async Task SingleRegistration_ForeignTenant_IsRejected()
    {
        using var factory = SingleRegistration();
        var token = TestTokens.Create(
            tenantId: TestTokens.OtherTenantId,
            issuer: $"https://sts.windows.net/{TestTokens.OtherTenantId}/",
            audience: $"api://{TestWebApplicationFactory.FrontendClientId}");

        Assert.AreEqual(HttpStatusCode.Unauthorized, await CallAsync(factory, token));
    }

    [TestMethod]
    public void EqualIds_WithoutSingleRegistrationFlag_FailAtStartup()
    {
        using var factory = new TestWebApplicationFactory(
            useRealJwt: true,
            settings: new Dictionary<string, string?> { ["ENTRA_BACKEND_CLIENT_ID"] = TestWebApplicationFactory.FrontendClientId });

        var exception = Assert.ThrowsExactly<Microsoft.Extensions.Options.OptionsValidationException>(() => factory.CreateClient());
        StringAssert.Contains(exception.Message, "ENTRA_SINGLE_APP_REGISTRATION");
    }

    [TestMethod]
    [DataRow("ENTRA_ALLOWED_GROUP_ID", "not-a-guid")]
    [DataRow("ENTRA_TENANT_ID", "PLACEHOLDER_SET_VIA_ENTRA_TENANT_ID_ENV_VAR")]
    [DataRow("ENTRA_FRONTEND_CLIENT_ID", "")]
    [DataRow("ENTRA_BACKEND_CLIENT_ID", "")]
    [DataRow("ENTRA_BACKEND_CLIENT_ID", "not-a-guid")]
    [DataRow("ENTRA_SPA_CLIENT_ID", "00000000-0000-0000-0000-000000000001")]
    [DataRow("ENTRA_SINGLE_APP_REGISTRATION", "yes")]
    public void InvalidEntraConfiguration_FailsAtStartup(string key, string value)
    {
        using var factory = new TestWebApplicationFactory(
            useRealJwt: true, settings: new Dictionary<string, string?> { [key] = value });

        var exception = Assert.ThrowsExactly<Microsoft.Extensions.Options.OptionsValidationException>(() => factory.CreateClient());
        StringAssert.Contains(exception.Message, key);
    }
}
