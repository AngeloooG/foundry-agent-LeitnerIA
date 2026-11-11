using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.Options;
using Microsoft.Identity.Web;

namespace WebApp.Api.Security;

/// <summary>The caller's token belongs to the configured tenant (defense in depth after issuer validation).</summary>
public sealed class TenantMemberRequirement : IAuthorizationRequirement;

/// <summary>
/// When <see cref="EntraOptions.AllowedGroupId"/> is set, the caller must be a member of that group.
/// When it is not set, the requirement always succeeds (tenant-wide access).
/// </summary>
public sealed class AllowedGroupRequirement : IAuthorizationRequirement;

public sealed class TenantMemberHandler(IOptions<EntraOptions> options) : AuthorizationHandler<TenantMemberRequirement>
{
    protected override Task HandleRequirementAsync(AuthorizationHandlerContext context, TenantMemberRequirement requirement)
    {
        var tid = context.User.GetTenantId();
        if (string.Equals(tid, options.Value.TenantId, StringComparison.OrdinalIgnoreCase))
            context.Succeed(requirement);

        return Task.CompletedTask;
    }
}

/// <summary>
/// Optional group restriction based on the <c>groups</c> claim of the access token.
/// </summary>
/// <remarks>
/// Requires <c>groupMembershipClaims</c> on the app registration (set by infra/entra-app.bicep when the group is
/// configured). If the user belongs to more groups than fit in a token (over 200 for JWT), Entra ID omits the
/// <c>groups</c> claim and sends an overage indicator; this handler then denies access (fail closed) and logs a
/// warning. Resolving overage through Microsoft Graph is intentionally not implemented (extra permission and latency).
/// </remarks>
public sealed class AllowedGroupHandler(IOptions<EntraOptions> options, ILogger<AllowedGroupHandler> logger)
    : AuthorizationHandler<AllowedGroupRequirement>
{
    // "groups" when inbound claim mapping is off; the URI form when it is on.
    private static readonly string[] GroupClaimTypes = ["groups", "http://schemas.microsoft.com/ws/2008/06/identity/claims/groups"];

    protected override Task HandleRequirementAsync(AuthorizationHandlerContext context, AllowedGroupRequirement requirement)
    {
        var allowedGroupId = options.Value.AllowedGroupId;
        if (string.IsNullOrWhiteSpace(allowedGroupId))
        {
            context.Succeed(requirement); // No group configured: every authenticated user of the tenant.
            return Task.CompletedTask;
        }

        if (IsMember(context.User, allowedGroupId))
        {
            context.Succeed(requirement);
        }
        else if (HasGroupOverage(context.User))
        {
            logger.LogWarning("Group restriction could not be evaluated: the token has a groups overage indicator. Access denied.");
        }

        return Task.CompletedTask;
    }

    internal static bool IsMember(ClaimsPrincipal user, string groupId) =>
        user.Claims.Any(c => GroupClaimTypes.Contains(c.Type) && string.Equals(c.Value, groupId, StringComparison.OrdinalIgnoreCase));

    internal static bool HasGroupOverage(ClaimsPrincipal user) =>
        user.HasClaim(c => c.Type == "hasgroups")
        || user.Claims.Any(c => c.Type == "_claim_names" && c.Value.Contains("groups", StringComparison.Ordinal));
}
