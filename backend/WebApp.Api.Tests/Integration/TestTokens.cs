using System.Security.Cryptography;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace WebApp.Api.Tests.Integration;

/// <summary>
/// Mints signed access tokens shaped like Entra ID v2 tokens, for tests that run the real JWT validation pipeline.
/// </summary>
public static class TestTokens
{
    public const string UserOid = "aaaaaaaa-0000-0000-0000-000000000001";
    public const string OtherTenantId = "99999999-9999-9999-9999-999999999999";

    /// <summary>Key trusted by the test host (stands in for Entra ID's published signing keys).</summary>
    public static readonly RsaSecurityKey SigningKey = new(RSA.Create(2048)) { KeyId = "test-signing-key" };

    /// <summary>Key the host does NOT trust (forged signature).</summary>
    public static readonly RsaSecurityKey UntrustedKey = new(RSA.Create(2048)) { KeyId = "untrusted-key" };

    public static string IssuerFor(string tenantId) => $"https://login.microsoftonline.com/{tenantId}/v2.0";

    public static string Create(
        string tenantId = TestWebApplicationFactory.TenantId,
        string? issuer = null,
        string audience = TestWebApplicationFactory.ClientId,
        string scopes = "Chat.ReadWrite",
        string[]? groups = null,
        bool hasGroupsOverage = false,
        DateTime? expires = null,
        SecurityKey? signingKey = null)
    {
        var claims = new Dictionary<string, object>
        {
            ["oid"] = UserOid,
            ["tid"] = tenantId,
            ["scp"] = scopes,
            ["name"] = "Usuario de prueba",
        };
        if (groups is not null)
            claims["groups"] = groups;
        if (hasGroupsOverage)
            claims["hasgroups"] = true;

        var expiry = expires ?? DateTime.UtcNow.AddMinutes(30);
        var descriptor = new SecurityTokenDescriptor
        {
            Issuer = issuer ?? IssuerFor(tenantId),
            Audience = audience,
            Claims = claims,
            NotBefore = expiry.AddHours(-1),
            IssuedAt = expiry.AddHours(-1),
            Expires = expiry,
            SigningCredentials = new SigningCredentials(signingKey ?? SigningKey, SecurityAlgorithms.RsaSha256),
        };

        return new JsonWebTokenHandler().CreateToken(descriptor);
    }
}
