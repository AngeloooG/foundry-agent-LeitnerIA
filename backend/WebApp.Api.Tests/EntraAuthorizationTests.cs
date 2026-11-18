using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using WebApp.Api.Security;

namespace WebApp.Api.Tests;

[TestClass]
public class EntraOptionsTests
{
    private const string Tenant = "00000000-0000-0000-0000-000000000002";
    private const string Frontend = "00000000-0000-0000-0000-000000000001";
    private const string Backend = "00000000-0000-0000-0000-0000000000b1";

    private static EntraOptions Valid(string? group = null) =>
        new() { TenantId = Tenant, FrontendClientId = Frontend, BackendClientId = Backend, AllowedGroupId = group };

    [TestMethod]
    public void TenantAndClient_WithoutGroup_IsValid()
    {
        Assert.AreEqual(0, Valid().Validate().Count());
        Assert.IsFalse(Valid().HasGroupRestriction);
    }

    [TestMethod]
    public void ValidGroupGuid_IsValid()
    {
        Assert.AreEqual(0, Valid("11111111-2222-3333-4444-555555555555").Validate().Count());
    }

    [TestMethod]
    [DataRow("not-a-guid")]
    [DataRow("sales-team")]
    public void MalformedGroup_IsInvalid(string group)
    {
        StringAssert.Contains(Valid(group).Validate().Single(), EntraOptions.AllowedGroupIdVariable);
    }

    [TestMethod]
    public void MissingTenantFrontendAndBackend_AreAllReported()
    {
        Assert.AreEqual(3, new EntraOptions().Validate().Count());
    }

    [TestMethod]
    public void SameFrontendAndBackend_IsInvalid()
    {
        var options = Valid();
        options.BackendClientId = Frontend;

        StringAssert.Contains(options.Validate().Single(), EntraOptions.BackendClientIdVariable);
    }

    [TestMethod]
    public void LegacySpaVariable_IsRejected()
    {
        var options = Valid();
        options.LegacyVariablePresent = true;

        StringAssert.Contains(options.Validate().Single(), EntraOptions.LegacySpaClientIdVariable);
    }

    [TestMethod]
    public void ApiScope_TargetsTheBackendRegistration()
    {
        Assert.AreEqual($"api://{Backend}/Chat.ReadWrite", Valid().ApiScope);
    }

    [TestMethod]
    public void EmptyGroupVariable_MeansNoRestriction()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ENTRA_TENANT_ID"] = Tenant,
                ["ENTRA_FRONTEND_CLIENT_ID"] = Frontend,
                ["ENTRA_BACKEND_CLIENT_ID"] = Backend,
                ["ENTRA_ALLOWED_GROUP_ID"] = "  ",
            })
            .Build();

        var options = EntraOptions.From(configuration);

        Assert.IsNull(options.AllowedGroupId);
        Assert.AreEqual(0, options.Validate().Count());
    }

    [TestMethod]
    public void Audiences_AreOnlyTheBackendRegistration()
    {
        CollectionAssert.AreEqual(new[] { Backend, $"api://{Backend}" }, Valid().Audiences.ToArray());
    }
}

[TestClass]
public class CorporateAccessHandlerTests
{
    private const string Tenant = "00000000-0000-0000-0000-000000000002";
    private const string Group = "11111111-2222-3333-4444-555555555555";

    private static ClaimsPrincipal User(string tid = Tenant, params Claim[] extra) =>
        new(new ClaimsIdentity([new Claim("tid", tid), new Claim("oid", "u1"), .. extra], "test"));

    private static async Task<bool> EvaluateAsync(IAuthorizationHandler handler, IAuthorizationRequirement requirement, ClaimsPrincipal user)
    {
        var context = new AuthorizationHandlerContext([requirement], user, null);
        await handler.HandleAsync(context);
        return context.HasSucceeded;
    }

    private static AllowedGroupHandler GroupHandler(string? group) =>
        new(Options.Create(new EntraOptions { TenantId = Tenant, AllowedGroupId = group }),
            NullLogger<AllowedGroupHandler>.Instance);

    [TestMethod]
    public async Task NoGroupConfigured_AnyTenantUserSucceeds()
    {
        Assert.IsTrue(await EvaluateAsync(GroupHandler(null), new AllowedGroupRequirement(), User()));
    }

    [TestMethod]
    public async Task GroupConfigured_MemberSucceeds_NonMemberFails()
    {
        Assert.IsTrue(await EvaluateAsync(GroupHandler(Group), new AllowedGroupRequirement(), User(extra: new Claim("groups", Group.ToUpperInvariant()))));
        Assert.IsFalse(await EvaluateAsync(GroupHandler(Group), new AllowedGroupRequirement(), User(extra: new Claim("groups", Guid.NewGuid().ToString()))));
    }

    [TestMethod]
    public async Task GroupConfigured_Overage_FailsClosed()
    {
        var user = User(extra: new Claim("_claim_names", "{\"groups\":\"src1\"}"));

        Assert.IsFalse(await EvaluateAsync(GroupHandler(Group), new AllowedGroupRequirement(), user));
    }

    [TestMethod]
    public async Task TenantRequirement_RejectsOtherTenant()
    {
        var handler = new TenantMemberHandler(Options.Create(new EntraOptions { TenantId = Tenant }));

        Assert.IsTrue(await EvaluateAsync(handler, new TenantMemberRequirement(), User()));
        Assert.IsFalse(await EvaluateAsync(handler, new TenantMemberRequirement(), User(tid: Guid.NewGuid().ToString())));
    }
}

[TestClass]
public class EntraTokenValidationTests
{
    private const string Tenant = "00000000-0000-0000-0000-000000000002";

    private static JsonWebToken TokenWithTid(string tid) =>
        new(new JsonWebTokenHandler().CreateToken(new SecurityTokenDescriptor
        {
            Claims = new Dictionary<string, object> { ["tid"] = tid },
        }));

    [TestMethod]
    [DataRow("https://login.microsoftonline.com/00000000-0000-0000-0000-000000000002/v2.0")]
    [DataRow("https://sts.windows.net/00000000-0000-0000-0000-000000000002/")]
    public void TenantIssuers_AreAccepted(string issuer)
    {
        Assert.AreEqual(issuer, EntraTokenValidation.ValidateIssuer(issuer, TokenWithTid(Tenant), Tenant));
    }

    [TestMethod]
    [DataRow("https://login.microsoftonline.com/common/v2.0")]
    [DataRow("https://login.microsoftonline.com/99999999-9999-9999-9999-999999999999/v2.0")]
    [DataRow("https://evil.example/00000000-0000-0000-0000-000000000002/v2.0")]
    public void OtherIssuers_AreRejected(string issuer)
    {
        Assert.ThrowsExactly<SecurityTokenInvalidIssuerException>(
            () => EntraTokenValidation.ValidateIssuer(issuer, TokenWithTid(Tenant), Tenant));
    }

    [TestMethod]
    public void TenantIssuerWithForeignTid_IsRejected()
    {
        Assert.ThrowsExactly<SecurityTokenInvalidIssuerException>(() => EntraTokenValidation.ValidateIssuer(
            EntraTokenValidation.ValidIssuers(Tenant)[0], TokenWithTid(Guid.NewGuid().ToString()), Tenant));
    }
}

[TestClass]
public class AllowedGroupLoggingTests
{
    private sealed class CapturingLogger<T> : Microsoft.Extensions.Logging.ILogger<T>
    {
        public List<string> Messages { get; } = [];
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(Microsoft.Extensions.Logging.LogLevel logLevel) => true;
        public void Log<TState>(Microsoft.Extensions.Logging.LogLevel logLevel, Microsoft.Extensions.Logging.EventId eventId,
            TState state, Exception? exception, Func<TState, Exception?, string> formatter) =>
            Messages.Add($"{logLevel}: {formatter(state, exception)} {string.Join(",", (state as IEnumerable<KeyValuePair<string, object?>>)?.Select(kv => $"{kv.Key}={kv.Value}") ?? [])}");
    }

    [TestMethod]
    public async Task Overage_LogsAWarning_WithoutGroupsOrClaims()
    {
        const string tenant = "00000000-0000-0000-0000-000000000002";
        const string allowed = "11111111-2222-3333-4444-555555555555";
        const string memberOf = "66666666-7777-8888-9999-000000000000";
        var logger = new CapturingLogger<AllowedGroupHandler>();
        var handler = new AllowedGroupHandler(
            Options.Create(new EntraOptions { TenantId = tenant, AllowedGroupId = allowed }), logger);
        var user = new ClaimsPrincipal(new ClaimsIdentity(
        [
            new Claim("tid", tenant), new Claim("oid", "user-oid"), new Claim("groups", memberOf),
            new Claim("_claim_names", "{\"groups\":\"src1\"}"),
        ], "test"));
        var context = new AuthorizationHandlerContext([new AllowedGroupRequirement()], user, null);

        await handler.HandleAsync(context);

        Assert.IsFalse(context.HasSucceeded);
        var log = logger.Messages.Single();
        StringAssert.StartsWith(log, "Warning");
        foreach (var sensitive in new[] { allowed, memberOf, tenant, "user-oid", "src1" })
            Assert.IsFalse(log.Contains(sensitive, StringComparison.OrdinalIgnoreCase), $"Log leaks '{sensitive}': {log}");
    }
}
