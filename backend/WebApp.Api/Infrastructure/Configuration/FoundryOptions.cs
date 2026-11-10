namespace WebApp.Api.Infrastructure.Configuration;

/// <summary>
/// Azure AI Foundry settings. Bound from the flat environment variables written by azd / Container Apps
/// (<c>AI_AGENT_ENDPOINT</c>, <c>AI_AGENT_ID</c>, ...) and validated at startup, so a misconfigured
/// deployment fails its startup probe instead of returning 500 on every request.
/// </summary>
public sealed class FoundryOptions
{
    /// <summary>Project endpoint, e.g. <c>https://&lt;account&gt;.services.ai.azure.com/api/projects/&lt;project&gt;</c>.</summary>
    public string Endpoint { get; set; } = string.Empty;

    /// <summary>Agent name (v2 Agents API uses human-readable ids).</summary>
    public string AgentId { get; set; } = string.Empty;

    /// <summary>Optional pinned agent version. When empty, the newest version is used (cached, see <see cref="AgentCacheDuration"/>).</summary>
    public string? AgentVersion { get; set; }

    /// <summary>User-assigned managed identity client id (deployed configuration).</summary>
    public string? ManagedIdentityClientId { get; set; }

    /// <summary>Backend app registration for On-Behalf-Of. When set (and not Development), Foundry is called as the user.</summary>
    public string? BackendClientId { get; set; }

    public string? TenantId { get; set; }

    /// <summary>How long the resolved agent definition is cached. Publishing a new version is picked up after this period.</summary>
    public TimeSpan AgentCacheDuration { get; set; } = TimeSpan.FromMinutes(10);

    public bool UseOnBehalfOf(bool isDevelopment) =>
        !isDevelopment && !string.IsNullOrWhiteSpace(BackendClientId) && !string.IsNullOrWhiteSpace(TenantId);

    public static void Bind(FoundryOptions options, IConfiguration configuration)
    {
        options.Endpoint = configuration["AI_AGENT_ENDPOINT"] ?? string.Empty;
        options.AgentId = configuration["AI_AGENT_ID"] ?? string.Empty;
        options.AgentVersion = NullIfEmpty(configuration["AI_AGENT_VERSION"]);
        options.ManagedIdentityClientId = NullIfEmpty(configuration["MANAGED_IDENTITY_CLIENT_ID"] ?? configuration["OBO_MANAGED_IDENTITY_CLIENT_ID"]);
        options.BackendClientId = NullIfEmpty(configuration["ENTRA_BACKEND_CLIENT_ID"]);
        options.TenantId = NullIfEmpty(configuration["ENTRA_TENANT_ID"] ?? configuration["AzureAd:TenantId"]);

        if (int.TryParse(configuration["Foundry:AgentCacheMinutes"], out var minutes) && minutes > 0)
            options.AgentCacheDuration = TimeSpan.FromMinutes(minutes);
    }

    /// <summary>Returns the validation errors (empty when valid).</summary>
    public IEnumerable<string> Validate(bool isDevelopment)
    {
        if (!Uri.TryCreate(Endpoint, UriKind.Absolute, out var uri) || uri.Scheme != Uri.UriSchemeHttps || IsPlaceholder(Endpoint))
            yield return "AI_AGENT_ENDPOINT must be the https endpoint of the Foundry project.";

        if (string.IsNullOrWhiteSpace(AgentId) || IsPlaceholder(AgentId))
            yield return "AI_AGENT_ID must be set to the Foundry agent name.";

        if (UseOnBehalfOf(isDevelopment) && string.IsNullOrWhiteSpace(ManagedIdentityClientId))
            yield return "OBO mode (ENTRA_BACKEND_CLIENT_ID) requires MANAGED_IDENTITY_CLIENT_ID for the federated credential.";
    }

    internal static bool IsPlaceholder(string? value) =>
        value is not null && value.Contains("PLACEHOLDER", StringComparison.OrdinalIgnoreCase);

    private static string? NullIfEmpty(string? value) => string.IsNullOrWhiteSpace(value) ? null : value;
}
