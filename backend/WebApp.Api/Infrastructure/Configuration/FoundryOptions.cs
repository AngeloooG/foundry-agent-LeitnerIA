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

    /// <summary>Backend API registration; with OBO it is the confidential client that exchanges the user token.</summary>
    public string? BackendClientId { get; set; }

    /// <summary>
    /// <c>ENABLE_OBO</c>: when true (and not Development) Foundry is called On-Behalf-Of the user, which requires
    /// per-user Foundry RBAC and admin consent. Default false: the managed identity calls Foundry. Having a separate
    /// backend registration does NOT enable OBO by itself.
    /// </summary>
    public bool EnableObo { get; set; }

    /// <summary>Raw ENABLE_OBO value when it is not a valid boolean (reported by <see cref="Validate"/>).</summary>
    public string? InvalidEnableOboValue { get; set; }

    public string? TenantId { get; set; }

    /// <summary>How long the resolved agent definition is cached. Publishing a new version is picked up after this period.</summary>
    public TimeSpan AgentCacheDuration { get; set; } = TimeSpan.FromMinutes(10);

    public bool UseOnBehalfOf(bool isDevelopment) => EnableObo && !isDevelopment;

    public static void Bind(FoundryOptions options, IConfiguration configuration)
    {
        options.Endpoint = configuration["AI_AGENT_ENDPOINT"] ?? string.Empty;
        options.AgentId = configuration["AI_AGENT_ID"] ?? string.Empty;
        options.AgentVersion = NullIfEmpty(configuration["AI_AGENT_VERSION"]);
        options.ManagedIdentityClientId = NullIfEmpty(configuration["MANAGED_IDENTITY_CLIENT_ID"] ?? configuration["OBO_MANAGED_IDENTITY_CLIENT_ID"]);
        options.BackendClientId = NullIfEmpty(configuration["ENTRA_BACKEND_CLIENT_ID"]);
        options.TenantId = NullIfEmpty(configuration["ENTRA_TENANT_ID"]);

        var enableObo = configuration["ENABLE_OBO"]?.Trim();
        if (string.IsNullOrEmpty(enableObo) || string.Equals(enableObo, "false", StringComparison.OrdinalIgnoreCase))
            options.EnableObo = false;
        else if (string.Equals(enableObo, "true", StringComparison.OrdinalIgnoreCase))
            options.EnableObo = true;
        else
            options.InvalidEnableOboValue = enableObo;

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

        if (InvalidEnableOboValue is not null)
            yield return "ENABLE_OBO must be 'true' or 'false' (empty = false).";

        if (UseOnBehalfOf(isDevelopment))
        {
            if (string.IsNullOrWhiteSpace(ManagedIdentityClientId))
                yield return "OBO mode (ENABLE_OBO=true) requires MANAGED_IDENTITY_CLIENT_ID for the federated credential.";
            if (string.IsNullOrWhiteSpace(BackendClientId) || string.IsNullOrWhiteSpace(TenantId))
                yield return "OBO mode (ENABLE_OBO=true) requires ENTRA_BACKEND_CLIENT_ID and ENTRA_TENANT_ID.";
        }
    }

    internal static bool IsPlaceholder(string? value) =>
        value is not null && value.Contains("PLACEHOLDER", StringComparison.OrdinalIgnoreCase);

    private static string? NullIfEmpty(string? value) => string.IsNullOrWhiteSpace(value) ? null : value;
}
