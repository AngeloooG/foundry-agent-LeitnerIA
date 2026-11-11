using Microsoft.Extensions.Options;

namespace WebApp.Api.Security;

/// <summary>
/// Microsoft Entra ID settings for the API. Bound from the environment variables written by azd / Container Apps
/// and validated at startup (<c>ValidateOnStart</c>): a misconfigured revision fails its startup probe instead of
/// rejecting every request at runtime.
/// </summary>
/// <remarks>
/// Access model (decided by CONSEIN): single-tenant, every authenticated user of <see cref="TenantId"/> may use the app.
/// <see cref="AllowedGroupId"/> is an optional, additional restriction. Its absence never disables token validation.
/// Note: "every user of the tenant" includes B2B guest accounts of the directory (their tokens are issued by this tenant).
/// </remarks>
public sealed class EntraOptions
{
    public const string TenantIdVariable = "ENTRA_TENANT_ID";
    public const string ClientIdVariable = "ENTRA_SPA_CLIENT_ID";
    public const string BackendClientIdVariable = "ENTRA_BACKEND_CLIENT_ID";
    public const string AllowedGroupIdVariable = "ENTRA_ALLOWED_GROUP_ID";

    /// <summary>The only tenant whose tokens are accepted (required GUID).</summary>
    public string TenantId { get; set; } = string.Empty;

    /// <summary>
    /// SPA (frontend) app registration (required GUID). In the default single-registration architecture the same
    /// registration also exposes the API scope, so it is the API audience as well.
    /// </summary>
    public string ClientId { get; set; } = string.Empty;

    /// <summary>
    /// Separate backend API registration, used when On-Behalf-Of is enabled (optional GUID). When set it is the ONLY
    /// accepted audience: tokens issued for the SPA registration are rejected.
    /// </summary>
    public string? BackendClientId { get; set; }

    /// <summary>The registration that exposes <c>Chat.ReadWrite</c> and is the token audience.</summary>
    public string ApiClientId => string.IsNullOrWhiteSpace(BackendClientId) ? ClientId : BackendClientId;

    /// <summary>Optional security group (object id). When set, only users whose token carries it in the groups claim are authorized.</summary>
    public string? AllowedGroupId { get; set; }

    /// <summary>
    /// Accepted <c>aud</c> values, both forms of the single API registration: the application ID URI
    /// (<c>api://{id}</c>, v1 access tokens, the current default) and the client id (v2 access tokens).
    /// </summary>
    public IReadOnlyList<string> Audiences => [ApiClientId, $"api://{ApiClientId}"];

    public bool HasGroupRestriction => !string.IsNullOrWhiteSpace(AllowedGroupId);

    public static void Bind(EntraOptions options, IConfiguration configuration)
    {
        options.TenantId = (configuration[TenantIdVariable] ?? configuration["AzureAd:TenantId"] ?? string.Empty).Trim();
        options.ClientId = (configuration[ClientIdVariable] ?? configuration["AzureAd:ClientId"] ?? string.Empty).Trim();
        options.BackendClientId = NullIfEmpty(configuration[BackendClientIdVariable]);
        options.AllowedGroupId = NullIfEmpty(configuration[AllowedGroupIdVariable]);
    }

    public static EntraOptions From(IConfiguration configuration)
    {
        var options = new EntraOptions();
        Bind(options, configuration);
        return options;
    }

    /// <summary>Returns every configuration problem (empty when valid).</summary>
    public IEnumerable<string> Validate()
    {
        if (!Guid.TryParse(TenantId, out _))
            yield return $"{TenantIdVariable} must be the tenant GUID.";
        if (!Guid.TryParse(ClientId, out _))
            yield return $"{ClientIdVariable} must be the GUID of the Entra app registration.";
        if (BackendClientId is not null && !Guid.TryParse(BackendClientId, out _))
            yield return $"{BackendClientIdVariable} must be a GUID when set.";
        if (BackendClientId is not null && string.Equals(BackendClientId, ClientId, StringComparison.OrdinalIgnoreCase))
            yield return $"{BackendClientIdVariable} must differ from {ClientIdVariable}; leave it empty for a single app registration.";
        // Canonical form only (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx), the format Entra ID emits in the groups claim.
        if (AllowedGroupId is not null && !Guid.TryParseExact(AllowedGroupId, "D", out _))
            yield return $"{AllowedGroupIdVariable} must be a group object id (GUID) when set; leave it empty to allow every user of the tenant.";
    }

    private static string? NullIfEmpty(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}

/// <summary>Reports every Entra configuration problem at once when the host starts.</summary>
public sealed class EntraOptionsValidator : IValidateOptions<EntraOptions>
{
    public ValidateOptionsResult Validate(string? name, EntraOptions options)
    {
        var errors = options.Validate().ToList();
        return errors.Count == 0 ? ValidateOptionsResult.Success : ValidateOptionsResult.Fail(errors);
    }
}
