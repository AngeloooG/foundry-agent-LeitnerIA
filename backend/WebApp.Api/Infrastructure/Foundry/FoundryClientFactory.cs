using Azure.AI.Projects;
using Azure.Identity;
using Microsoft.Extensions.Options;
using Microsoft.Identity.Client;
using Microsoft.Identity.Web;
using WebApp.Api.Infrastructure.Configuration;

namespace WebApp.Api.Infrastructure.Foundry;

/// <summary>
/// Application-wide Foundry client authenticated with the managed identity (singleton).
/// </summary>
/// <remarks>
/// Azure SDK clients are thread-safe and the credential keeps its own token cache, so a single instance avoids
/// fetching a new managed identity token per request (latency and IMDS throttling).
/// </remarks>
public sealed class FoundryAppClient(IOptions<FoundryOptions> options, IHostEnvironment environment)
{
    private readonly Lazy<AIProjectClient> _client = new(() => new AIProjectClient(
        new Uri(options.Value.Endpoint),
        FoundryCredentialFactory.CreateAppCredential(options.Value.ManagedIdentityClientId, environment.IsDevelopment())));

    public AIProjectClient Client => _client.Value;
}

/// <summary>
/// Returns the Foundry client for the current request (strategy selected once per process):
/// managed identity (default) or On-Behalf-Of the signed-in user when <c>ENABLE_OBO=true</c>.
/// </summary>
public sealed class FoundryClientFactory(
    FoundryAppClient appClient,
    IOptions<FoundryOptions> options,
    IHostEnvironment environment,
    IHttpContextAccessor httpContextAccessor)
{
    // User-independent assertion of the managed identity used as federated credential in OBO (shared, thread-safe).
    private static ManagedIdentityClientAssertion? s_miAssertion;
    private static readonly Lock s_miAssertionLock = new();

    private AIProjectClient? _requestClient;

    public bool UsesOnBehalfOf => options.Value.UseOnBehalfOf(environment.IsDevelopment());

    public AIProjectClient GetClient()
    {
        if (!UsesOnBehalfOf)
            return appClient.Client;

        return _requestClient ??= new AIProjectClient(new Uri(options.Value.Endpoint), CreateOboCredential());
    }

    private OnBehalfOfCredential CreateOboCredential()
    {
        var foundry = options.Value;
        var userToken = ExtractBearerToken()
            ?? throw new InvalidOperationException("OBO mode requires the caller's bearer token.");

        lock (s_miAssertionLock)
        {
            s_miAssertion ??= new ManagedIdentityClientAssertion(managedIdentityClientId: foundry.ManagedIdentityClientId);
        }

        return new OnBehalfOfCredential(
            foundry.TenantId!,
            foundry.BackendClientId!,
            async ct => await s_miAssertion.GetSignedAssertionAsync(new AssertionRequestOptions { CancellationToken = ct }),
            userToken,
            new OnBehalfOfCredentialOptions());
    }

    /// <summary>The bearer token was already validated by the JWT middleware.</summary>
    private string? ExtractBearerToken()
    {
        var header = httpContextAccessor.HttpContext?.Request.Headers.Authorization.ToString();
        return header is not null && header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)
            ? header["Bearer ".Length..].Trim()
            : null;
    }
}
