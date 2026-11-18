using System.Security.Claims;
using Microsoft.Identity.Web;

namespace WebApp.Api.Security;

/// <summary>
/// Helpers to read the caller's stable identity from the validated Entra ID access token.
/// </summary>
/// <remarks>
/// The <c>oid</c> (object id) claim is the immutable identifier of the user inside the tenant.
/// It is used as the ownership key for conversations; never use <c>name</c>/<c>preferred_username</c>
/// for authorization because they can change and are not guaranteed to be unique.
/// </remarks>
public static class UserIdentity
{
    /// <summary>
    /// Returns the caller's Entra object id (<c>oid</c>) or <c>null</c> when the token does not carry one
    /// (for example app-only tokens, which the scope policy already rejects).
    /// </summary>
    public static string? GetOwnerId(this ClaimsPrincipal user)
    {
        var oid = user.GetObjectId();
        return string.IsNullOrWhiteSpace(oid) ? null : oid;
    }
}
