using Microsoft.Extensions.Options;

namespace WebApp.Api.Security;

/// <summary>
/// Microsoft Entra ID settings for the API. Bound from the environment variables written by azd / Container Apps
/// and validated at startup (<c>ValidateOnStart</c>): a misconfigured revision fails its startup probe instead of
/// rejecting every request at runtime.
/// </summary>
/// <remarks>
/// <para>Identity model: two app registrations by default.</para>
/// <list type="bullet">
/// <item><see cref="FrontendClientId"/>: SPA registration (interactive sign-in). Never an accepted audience.</item>
/// <item><see cref="BackendClientId"/>: API registration that exposes <c>Chat.ReadWrite</c>. The ONLY accepted audience.</item>
/// </list>
/// <para>Single-registration mode (<see cref="SingleAppRegistration"/>, development only): the SPA registration
/// also exposes <c>Chat.ReadWrite</c> and is the audience, so both ids are equal. It exists for tenants where users
/// cannot consent and no admin consent is available: an app requesting its own scope needs no new consent. It must
/// be declared explicitly; equal ids without the flag are still a startup failure. Not compatible with OBO.</para>
/// <para>Access model (decided by CONSEIN): single-tenant, every authenticated identity of <see cref="TenantId"/>
/// (members and B2B guests) may use the app. <see cref="AllowedGroupId"/> is an optional, additional restriction;
/// its absence never disables token validation.</para>
/// </remarks>
public sealed class EntraOptions
{
    public const string TenantIdVariable = "ENTRA_TENANT_ID";
    public const string FrontendClientIdVariable = "ENTRA_FRONTEND_CLIENT_ID";
    public const string BackendClientIdVariable = "ENTRA_BACKEND_CLIENT_ID";
    public const string AllowedGroupIdVariable = "ENTRA_ALLOWED_GROUP_ID";
    public const string SingleAppRegistrationVariable = "ENTRA_SINGLE_APP_REGISTRATION";

    /// <summary>Name used before the registrations were split. Must not be set any more (ambiguous).</summary>
    public const string LegacySpaClientIdVariable = "ENTRA_SPA_CLIENT_ID";

    /// <summary>The only tenant whose tokens are accepted (required GUID).</summary>
    public string TenantId { get; set; } = string.Empty;

    /// <summary>SPA registration (required GUID). Used to reject configurations where it equals the API audience.</summary>
    public string FrontendClientId { get; set; } = string.Empty;

    /// <summary>Backend API registration (required GUID, different from the frontend). Defines the token audience.</summary>
    public string BackendClientId { get; set; } = string.Empty;

    /// <summary>Optional security group (object id). When set, only users whose token carries it in the groups claim are authorized.</summary>
    public string? AllowedGroupId { get; set; }

    /// <summary>
    /// <c>ENTRA_SINGLE_APP_REGISTRATION=true</c>: one registration is both the SPA and the API audience
    /// (<see cref="FrontendClientId"/> must equal <see cref="BackendClientId"/>). Default false.
    /// </summary>
    public bool SingleAppRegistration { get; set; }

    /// <summary>Raw <c>ENTRA_SINGLE_APP_REGISTRATION</c> value when it is not a valid boolean (reported by <see cref="Validate"/>).</summary>
    public string? InvalidSingleAppRegistrationValue { get; set; }

    /// <summary>True when the legacy <see cref="LegacySpaClientIdVariable"/> is still present in the configuration.</summary>
    public bool LegacyVariablePresent { get; set; }

    /// <summary>
    /// Accepted <c>aud</c> values: both forms of the backend registration only, the client id (v2 access tokens, what
    /// the backend registration issues) and the application ID URI <c>api://{id}</c> (v1 tokens, what the single
    /// registration issues).
    /// </summary>
    public IReadOnlyList<string> Audiences => [BackendClientId, $"api://{BackendClientId}"];

    /// <summary>Delegated scope the SPA must request: <c>api://{BackendClientId}/Chat.ReadWrite</c>.</summary>
    public string ApiScope => $"api://{BackendClientId}/{AuthorizationPolicies.RequiredScope}";

    public bool HasGroupRestriction => !string.IsNullOrWhiteSpace(AllowedGroupId);

    public static void Bind(EntraOptions options, IConfiguration configuration)
    {
        // No fallbacks to other keys: one variable per setting, so the effective value is never ambiguous.
        options.TenantId = (configuration[TenantIdVariable] ?? string.Empty).Trim();
        options.FrontendClientId = (configuration[FrontendClientIdVariable] ?? string.Empty).Trim();
        options.BackendClientId = (configuration[BackendClientIdVariable] ?? string.Empty).Trim();
        options.AllowedGroupId = NullIfEmpty(configuration[AllowedGroupIdVariable]);
        options.LegacyVariablePresent = !string.IsNullOrWhiteSpace(configuration[LegacySpaClientIdVariable]);

        var singleApp = configuration[SingleAppRegistrationVariable]?.Trim();
        if (string.IsNullOrEmpty(singleApp) || string.Equals(singleApp, "false", StringComparison.OrdinalIgnoreCase))
            options.SingleAppRegistration = false;
        else if (string.Equals(singleApp, "true", StringComparison.OrdinalIgnoreCase))
            options.SingleAppRegistration = true;
        else
            options.InvalidSingleAppRegistrationValue = singleApp;
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
        if (LegacyVariablePresent)
            yield return $"{LegacySpaClientIdVariable} was replaced by {FrontendClientIdVariable} (SPA) and {BackendClientIdVariable} (API audience); remove it.";
        if (InvalidSingleAppRegistrationValue is not null)
            yield return $"{SingleAppRegistrationVariable} must be 'true' or 'false' (empty = false).";
        if (!Guid.TryParse(TenantId, out _))
            yield return $"{TenantIdVariable} must be the tenant GUID.";
        if (!Guid.TryParse(FrontendClientId, out _))
            yield return $"{FrontendClientIdVariable} must be the GUID of the SPA app registration.";
        if (!Guid.TryParse(BackendClientId, out _))
            yield return $"{BackendClientIdVariable} must be the GUID of the API app registration (the token audience).";
        else if (SingleAppRegistration)
        {
            if (!string.Equals(BackendClientId, FrontendClientId, StringComparison.OrdinalIgnoreCase))
                yield return $"{SingleAppRegistrationVariable}=true requires {BackendClientIdVariable} to equal {FrontendClientIdVariable} (one registration).";
        }
        else if (string.Equals(BackendClientId, FrontendClientId, StringComparison.OrdinalIgnoreCase))
            yield return $"{BackendClientIdVariable} must differ from {FrontendClientIdVariable}: the API must not accept tokens issued for the SPA. " +
                         $"Set {SingleAppRegistrationVariable}=true only for the single-registration development mode.";
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
