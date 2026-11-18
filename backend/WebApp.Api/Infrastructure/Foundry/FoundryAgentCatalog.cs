using Azure.AI.Projects.Agents;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Options;
using WebApp.Api.Infrastructure.Configuration;

namespace WebApp.Api.Infrastructure.Foundry;

/// <summary>
/// Resolves the agent definition (pinned version or newest) and caches it with a TTL, so publishing a new
/// agent version in Foundry is picked up without restarting the app.
/// </summary>
public sealed class FoundryAgentCatalog(
    FoundryClientFactory clientFactory,
    IMemoryCache cache,
    IOptions<FoundryOptions> options,
    ILogger<FoundryAgentCatalog> logger)
{
    private static readonly SemaphoreSlim s_loadLock = new(1, 1);
    private const string CacheKey = "foundry-agent-version";

    public string AgentId => options.Value.AgentId;

    public async Task<ProjectsAgentVersion> GetAgentAsync(CancellationToken cancellationToken)
    {
        if (cache.TryGetValue(CacheKey, out ProjectsAgentVersion? cached) && cached is not null)
            return cached;

        await s_loadLock.WaitAsync(cancellationToken);
        try
        {
            if (cache.TryGetValue(CacheKey, out cached) && cached is not null)
                return cached;

            var loaded = await LoadAsync(cancellationToken);
            cache.Set(CacheKey, loaded, options.Value.AgentCacheDuration);

            logger.LogInformation(
                "Loaded agent {AgentName} version {Version} (pinned={Pinned})",
                loaded.Name ?? AgentId,
                loaded.Version ?? "<unknown>",
                options.Value.AgentVersion is not null);

            return loaded;
        }
        finally
        {
            s_loadLock.Release();
        }
    }

    /// <summary>Version used for streaming and listing (pinned value or the resolved newest version).</summary>
    public async Task<string?> GetVersionAsync(CancellationToken cancellationToken) =>
        options.Value.AgentVersion ?? (await GetAgentAsync(cancellationToken)).Version;

    private async Task<ProjectsAgentVersion> LoadAsync(CancellationToken cancellationToken)
    {
        var admin = clientFactory.GetClient().AgentAdministrationClient;
        var pinned = options.Value.AgentVersion;

        if (pinned is not null)
            return (await admin.GetAgentVersionAsync(AgentId, pinned, cancellationToken)).Value;

        await foreach (var version in admin.GetAgentVersionsAsync(
            agentName: AgentId, limit: 1, order: AgentListOrder.Descending, after: null, before: null,
            cancellationToken: cancellationToken))
        {
            return version;
        }

        throw new InvalidOperationException($"Agent '{AgentId}' has no versions. Create at least one version in AI Foundry.");
    }
}
