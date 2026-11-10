using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using WebApp.Api.Application;
using WebApp.Api.Tests.Fakes;

namespace WebApp.Api.Tests.Integration;

/// <summary>
/// In-memory host for integration tests. Runs as "Production" (security headers, no CORS, generic errors),
/// replaces Entra ID JWT validation with <see cref="TestAuthHandler"/> and the Foundry adapters with in-memory
/// fakes, so no test reaches Azure.
/// </summary>
public sealed class TestWebApplicationFactory(int chatPermitsPerMinute = 100) : WebApplicationFactory<Program>
{
    public InMemoryConversationStore Store { get; } = new();
    public FakeAgentGateway Agent { get; } = new();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Production");

        // UseSetting values are visible while Program.cs builds its services.
        builder.UseSetting("AI_AGENT_ENDPOINT", "https://example.invalid/api/projects/test");
        builder.UseSetting("AI_AGENT_ID", "test-agent");
        builder.UseSetting("ENTRA_SPA_CLIENT_ID", "00000000-0000-0000-0000-000000000001");
        builder.UseSetting("ENTRA_TENANT_ID", "00000000-0000-0000-0000-000000000002");
        builder.UseSetting("Uploads:CleanupEnabled", "false");
        builder.UseSetting("RateLimiting:ChatPermitsPerMinute", chatPermitsPerMinute.ToString());

        builder.ConfigureLogging(logging => logging.ClearProviders());

        builder.ConfigureTestServices(services =>
        {
            services.RemoveAll<IConversationStore>();
            services.RemoveAll<IAgentGateway>();
            services.AddSingleton<IConversationStore>(Store);
            services.AddSingleton<IAgentGateway>(Agent);

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

    public HttpClient CreateClientFor(string? oid, string? scopes = null)
    {
        var client = CreateClient();
        if (oid is not null)
            client.DefaultRequestHeaders.Add(TestAuthHandler.OidHeader, oid);
        if (scopes is not null)
            client.DefaultRequestHeaders.Add(TestAuthHandler.ScopesHeader, scopes);
        return client;
    }
}

/// <summary>
/// Authenticates requests from test headers: <c>X-Test-Oid</c> (user object id; absent = anonymous)
/// and <c>X-Test-Scopes</c> (space-separated delegated scopes; default <c>Chat.ReadWrite</c>).
/// </summary>
public sealed class TestAuthHandler(
    IOptionsMonitor<AuthenticationSchemeOptions> options,
    ILoggerFactory logger,
    UrlEncoder encoder) : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    public const string SchemeName = "Test";
    public const string OidHeader = "X-Test-Oid";
    public const string ScopesHeader = "X-Test-Scopes";

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (!Request.Headers.TryGetValue(OidHeader, out var oid) || string.IsNullOrEmpty(oid))
            return Task.FromResult(AuthenticateResult.NoResult());

        var scopes = Request.Headers.TryGetValue(ScopesHeader, out var s) ? s.ToString() : "Chat.ReadWrite";
        var identity = new ClaimsIdentity(
        [
            new Claim("oid", oid.ToString()),
            new Claim("scp", scopes),
            new Claim(ClaimTypes.Name, "Test User"),
        ], SchemeName);

        return Task.FromResult(AuthenticateResult.Success(
            new AuthenticationTicket(new ClaimsPrincipal(identity), SchemeName)));
    }
}
