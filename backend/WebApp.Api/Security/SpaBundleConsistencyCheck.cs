using System.Text.Json;
using Microsoft.Extensions.Options;

namespace WebApp.Api.Security;

/// <summary>
/// Refuses to start when the SPA bundle served from <c>wwwroot</c> was built for a different Entra configuration than
/// the API runs with.
/// </summary>
/// <remarks>
/// The Entra client ids are baked into the JavaScript bundle at build time (Vite). If <c>ENTRA_BACKEND_CLIENT_ID</c>
/// changes without rebuilding the image, the SPA would request a scope the API rejects (every user gets 401).
/// The Vite build writes <see cref="BuildInfoFileName"/>; this check compares it with <see cref="EntraOptions"/>.
/// A failed check stops the host, so the new Container Apps revision never becomes healthy and the previous revision
/// keeps serving traffic. API-only hosts (no <c>index.html</c> in wwwroot: tests, local API) skip the check.
/// </remarks>
public sealed class SpaBundleConsistencyCheck(
    IWebHostEnvironment environment,
    IConfiguration configuration,
    IOptions<EntraOptions> entraOptions,
    ILogger<SpaBundleConsistencyCheck> logger) : IHostedService
{
    public const string BuildInfoFileName = "leitneria-build.json";

    public Task StartAsync(CancellationToken cancellationToken)
    {
        var error = Validate(environment.WebRootPath, configuration["Spa:BuildInfoPath"], entraOptions.Value);
        if (error is not null)
        {
            logger.LogCritical("SPA bundle consistency check failed: {Reason}", error);
            throw new InvalidOperationException(error);
        }

        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    /// <returns>An error message, or <c>null</c> when the bundle is consistent or there is no bundle to check.</returns>
    internal static string? Validate(string? webRootPath, string? buildInfoPathOverride, EntraOptions entra)
    {
        var buildInfoPath = buildInfoPathOverride;
        if (string.IsNullOrWhiteSpace(buildInfoPath))
        {
            var hasSpa = !string.IsNullOrWhiteSpace(webRootPath) && File.Exists(Path.Combine(webRootPath, "index.html"));
            if (!hasSpa)
                return null; // API-only host.
            buildInfoPath = Path.Combine(webRootPath!, BuildInfoFileName);
        }

        if (!File.Exists(buildInfoPath))
            return $"The SPA bundle has no {BuildInfoFileName}: rebuild the image with the current Dockerfile.";

        BuildInfo? info;
        try
        {
            info = JsonSerializer.Deserialize<BuildInfo>(File.ReadAllText(buildInfoPath), new JsonSerializerOptions(JsonSerializerDefaults.Web));
        }
        catch (JsonException)
        {
            return $"{BuildInfoFileName} is not valid JSON.";
        }

        if (!string.Equals(info?.BackendClientId, entra.BackendClientId, StringComparison.OrdinalIgnoreCase))
            return $"The SPA bundle was built for a different {EntraOptions.BackendClientIdVariable} than the API uses: rebuild and redeploy the image.";

        if (!string.Equals(info?.FrontendClientId, entra.FrontendClientId, StringComparison.OrdinalIgnoreCase))
            return $"The SPA bundle was built for a different {EntraOptions.FrontendClientIdVariable} than the API uses: rebuild and redeploy the image.";

        return null;
    }

    private sealed record BuildInfo(string? FrontendClientId, string? BackendClientId);
}
