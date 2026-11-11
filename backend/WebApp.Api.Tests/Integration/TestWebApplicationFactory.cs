using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using WebApp.Api.Application;
using WebApp.Api.Tests.Fakes;

namespace WebApp.Api.Tests.Integration;

/// <summary>
/// In-memory host for integration tests. Runs as "Production" (security headers, no CORS, generic errors) and
/// replaces the Foundry adapters with in-memory fakes, so no test reaches Azure.
/// </summary>
/// <remarks>
/// Two authentication modes:
/// <list type="bullet">
/// <item>Default: <see cref="TestAuthHandler"/> builds the principal from request headers (fast, for functional tests).</item>
/// <item><c>useRealJwt: true</c>: the production JWT bearer pipeline (Microsoft.Identity.Web + EntraTokenValidation +
/// authorization policy) validates tokens minted by <see cref="TestTokens"/>. Only the signing-key discovery is replaced
/// by a static configuration so no call to Entra ID is made.</item>
/// </list>
/// </remarks>
public sealed class TestWebApplicationFactory(
    int chatPermitsPerMinute = 100,
    IReadOnlyDictionary<string, string?>? settings = null,
    bool useRealJwt = false) : WebApplicationFactory<Program>
{
    public const string TenantId = "00000000-0000-0000-0000-000000000002";
    public const string ClientId = "00000000-0000-0000-0000-000000000001";

    public InMemoryConversationStore Store { get; } = new();
    public FakeAgentGateway Agent { get; } = new();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Production");

        // UseSetting values are visible while Program.cs builds its services.
        builder.UseSetting("AI_AGENT_ENDPOINT", "https://example.invalid/api/projects/test");
        builder.UseSetting("AI_AGENT_ID", "test-agent");
        builder.UseSetting("ENTRA_SPA_CLIENT_ID", ClientId);
        builder.UseSetting("ENTRA_TENANT_ID", TenantId);
        builder.UseSetting("Uploads:CleanupEnabled", "false");
        builder.UseSetting("RateLimiting:ChatPermitsPerMinute", chatPermitsPerMinute.ToString());
        foreach (var (key, value) in settings ?? new Dictionary<string, string?>())
            builder.UseSetting(key, value);

        builder.ConfigureLogging(logging => logging.ClearProviders());

        builder.ConfigureTestServices(services =>
        {
            services.RemoveAll<IConversationStore>();
            services.RemoveAll<IAgentGateway>();
            services.AddSingleton<IConversationStore>(Store);
            services.AddSingleton<IAgentGateway>(Agent);

            if (useRealJwt)
            {
                // Keep the real validation rules; only provide the issuer metadata and signing key offline.
                services.PostConfigure<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme, options =>
                {
                    var configuration = new OpenIdConnectConfiguration { Issuer = TestTokens.IssuerFor(TenantId) };
                    configuration.SigningKeys.Add(TestTokens.SigningKey);
                    options.ConfigurationManager = new StaticConfigurationManager<OpenIdConnectConfiguration>(configuration);
                });
                return;
            }

            services.AddAuthentication(options =>
                {
                    options.DefaultScheme = TestAuthHandler.SchemeName;
                    options.DefaultAuthenticateScheme = TestAuthHandler.SchemeName;
                    options.DefaultChallengeScheme = TestAuthHandler.SchemeName;
                    options.DefaultForbidScheme = TestAuthHandler.SchemeName;
                })
                .AddScheme<AuthenticationSchemeOptions, TestAuthHandler>(TestAuthHandler.SchemeName, _ => { });
        });
    }

    public HttpClient CreateClientFor(string? oid, string? scopes = null, string? tenantId = null, string? groups = null)
    {
        var client = CreateClient();
        if (oid is not null)
            client.DefaultRequestHeaders.Add(TestAuthHandler.OidHeader, oid);
        if (scopes is not null)
            client.DefaultRequestHeaders.Add(TestAuthHandler.ScopesHeader, scopes);
        if (tenantId is not null)
            client.DefaultRequestHeaders.Add(TestAuthHandler.TenantHeader, tenantId);
        if (groups is not null)
            client.DefaultRequestHeaders.Add(TestAuthHandler.GroupsHeader, groups);
        return client;
    }
}

/// <summary>
/// Authenticates requests from test headers: <c>X-Test-Oid</c> (user object id; absent = anonymous),
/// <c>X-Test-Scopes</c> (default <c>Chat.ReadWrite</c>), <c>X-Test-Tid</c> (default: the configured tenant) and
/// <c>X-Test-Groups</c> (comma-separated group ids).
/// </summary>
public sealed class TestAuthHandler(
    IOptionsMonitor<AuthenticationSchemeOptions> options,
    ILoggerFactory logger,
    UrlEncoder encoder) : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    public const string SchemeName = "Test";
    public const string OidHeader = "X-Test-Oid";
    public const string ScopesHeader = "X-Test-Scopes";
    public const string TenantHeader = "X-Test-Tid";
    public const string GroupsHeader = "X-Test-Groups";

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (!Request.Headers.TryGetValue(OidHeader, out var oid) || string.IsNullOrEmpty(oid))
            return Task.FromResult(AuthenticateResult.NoResult());

        var scopes = Request.Headers.TryGetValue(ScopesHeader, out var s) ? s.ToString() : "Chat.ReadWrite";
        var tid = Request.Headers.TryGetValue(TenantHeader, out var t) ? t.ToString() : TestWebApplicationFactory.TenantId;

        var claims = new List<Claim>
        {
            new("oid", oid.ToString()),
            new("tid", tid),
            new("scp", scopes),
            new(ClaimTypes.Name, "Test User"),
        };
        if (Request.Headers.TryGetValue(GroupsHeader, out var groups))
            claims.AddRange(groups.ToString().Split(',', StringSplitOptions.RemoveEmptyEntries).Select(g => new Claim("groups", g.Trim())));

        return Task.FromResult(AuthenticateResult.Success(
            new AuthenticationTicket(new ClaimsPrincipal(new ClaimsIdentity(claims, SchemeName)), SchemeName)));
    }
}
