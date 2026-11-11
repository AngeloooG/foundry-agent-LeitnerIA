using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace WebApp.Api.Security;

/// <summary>
/// Strict, tenant-pinned validation of Entra ID access tokens.
/// </summary>
/// <remarks>
/// Entra ID signs tokens of every tenant with the same keys, so a valid signature alone does not prove the token
/// comes from the CONSEIN tenant. The issuer must be this tenant's v1 or v2 issuer and the <c>tid</c> claim must
/// match it. Applied after Microsoft.Identity.Web's defaults (PostConfigure), so it replaces the generic AAD issuer
/// validator with a single-tenant one that needs no network call.
/// </remarks>
public static class EntraTokenValidation
{
    /// <summary>Clock tolerance for <c>exp</c>/<c>nbf</c> (default in ASP.NET Core is 5 minutes).</summary>
    public static readonly TimeSpan ClockSkew = TimeSpan.FromMinutes(2);

    public static void Apply(TokenValidationParameters parameters, EntraOptions options)
    {
        parameters.ValidateIssuer = true;
        parameters.ValidIssuers = ValidIssuers(options.TenantId);
        parameters.IssuerValidator = (issuer, token, _) => ValidateIssuer(issuer, token, options.TenantId);

        parameters.ValidateAudience = true;
        parameters.ValidAudience = null;
        parameters.ValidAudiences = options.Audiences;

        parameters.ValidateLifetime = true;
        parameters.RequireExpirationTime = true;
        parameters.ClockSkew = ClockSkew;

        parameters.ValidateIssuerSigningKey = true;
        parameters.RequireSignedTokens = true;

        parameters.NameClaimType = ClaimTypes.Name;
        parameters.RoleClaimType = ClaimTypes.Role;
    }

    /// <summary>v2.0 and v1.0 issuers of the configured tenant.</summary>
    public static string[] ValidIssuers(string tenantId) =>
    [
        $"https://login.microsoftonline.com/{tenantId}/v2.0",
        $"https://sts.windows.net/{tenantId}/",
    ];

    internal static string ValidateIssuer(string issuer, SecurityToken token, string tenantId)
    {
        if (!ValidIssuers(tenantId).Contains(issuer, StringComparer.OrdinalIgnoreCase))
            throw new SecurityTokenInvalidIssuerException("The token was not issued by the configured tenant.");

        var tid = token switch
        {
            JsonWebToken jwt => jwt.TryGetPayloadValue<string>("tid", out var value) ? value : null,
            JwtSecurityToken legacy => legacy.Payload.TryGetValue("tid", out var value) ? value as string : null,
            _ => null,
        };

        if (!string.Equals(tid, tenantId, StringComparison.OrdinalIgnoreCase))
            throw new SecurityTokenInvalidIssuerException("The token tenant (tid) does not match the configured tenant.");

        return issuer;
    }
}
