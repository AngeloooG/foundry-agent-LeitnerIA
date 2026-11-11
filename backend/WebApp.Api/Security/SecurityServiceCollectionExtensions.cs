using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Microsoft.Identity.Web;

namespace WebApp.Api.Security;

public static class RateLimitPolicies
{
    public const string Chat = "chat";
    public const string Api = "api";
}

public static class AuthorizationPolicies
{
    /// <summary>Delegated scope exposed by the Entra app registration (infra/entra-app.bicep) and requested by the SPA.</summary>
    public const string RequiredScope = "Chat.ReadWrite";

    /// <summary>Tenant user + API scope + optional group. Applied to the /api group and as fallback policy.</summary>
    public const string ChatScope = "RequireChatScope";
}

/// <summary>
/// Authentication (Entra ID), authorization (tenant + scope + optional group, secure-by-default fallback),
/// rate limiting and CORS. Access decisions live here only; endpoints never repeat them.
/// </summary>
public static class SecurityServiceCollectionExtensions
{
    public const string DevCorsPolicy = "DevFrontend";

    public static WebApplicationBuilder AddApiSecurity(this WebApplicationBuilder builder)
    {
        var configuration = builder.Configuration;
        var isDevelopment = builder.Environment.IsDevelopment();

        // Entra settings: validated when the host starts (fail fast, all errors reported at once).
        builder.Services.AddOptions<EntraOptions>()
            .Configure<IConfiguration>(EntraOptions.Bind)
            .ValidateOnStart();
        builder.Services.AddSingleton<IValidateOptions<EntraOptions>, EntraOptionsValidator>();

        // Microsoft.Identity.Web reads the "AzureAd" section to build the single-tenant authority.
        var entra = EntraOptions.From(configuration);
        configuration["AzureAd:ClientId"] = entra.ClientId;
        configuration["AzureAd:TenantId"] = entra.TenantId;
        configuration["AzureAd:Audience"] = $"api://{entra.ClientId}";

        builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddMicrosoftIdentityWebApi(
                options => configuration.Bind("AzureAd", options),
                options => configuration.Bind("AzureAd", options));

        // Strict validation (issuer + tid pinned to the tenant, audience, signature, lifetime). PostConfigure runs
        // after Microsoft.Identity.Web's own configuration, so these rules are the ones in effect.
        builder.Services.AddOptions<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme)
            .PostConfigure<IOptions<EntraOptions>>((jwt, entraOptions) =>
                EntraTokenValidation.Apply(jwt.TokenValidationParameters, entraOptions.Value));

        // One policy for every API endpoint: authenticated user of the tenant, API scope and, only when
        // ENTRA_ALLOWED_GROUP_ID is set, membership of that group. Azure RBAC is never used for end users.
        var corporateUserPolicy = new AuthorizationPolicyBuilder()
            .RequireAuthenticatedUser()
            .RequireScope(AuthorizationPolicies.RequiredScope)
            .AddRequirements(new TenantMemberRequirement(), new AllowedGroupRequirement())
            .Build();

        builder.Services.AddSingleton<IAuthorizationHandler, TenantMemberHandler>();
        builder.Services.AddSingleton<IAuthorizationHandler, AllowedGroupHandler>();
        builder.Services.AddAuthorizationBuilder()
            .AddPolicy(AuthorizationPolicies.ChatScope, corporateUserPolicy)
            // Secure by default: endpoints without explicit metadata get the same policy.
            // Public endpoints (health probes, SPA fallback) opt out with AllowAnonymous().
            .SetFallbackPolicy(corporateUserPolicy);

        builder.Services.AddRateLimiter(options => ConfigureRateLimiting(options, configuration));

        // CORS only in Development (Vite dev server on another port). In Azure the SPA is same-origin.
        if (isDevelopment)
        {
            builder.Services.AddCors(options => options.AddPolicy(DevCorsPolicy, policy => policy
                .SetIsOriginAllowed(origin =>
                    Uri.TryCreate(origin, UriKind.Absolute, out var uri) && (uri.Host == "localhost" || uri.Host == "127.0.0.1"))
                .WithMethods("GET", "POST")
                .WithHeaders("Authorization", "Content-Type")));
        }

        return builder;
    }

    /// <summary>Per-user sliding windows (partitioned by Entra oid). Protects model cost and the Foundry quota.</summary>
    private static void ConfigureRateLimiting(Microsoft.AspNetCore.RateLimiting.RateLimiterOptions options, IConfiguration configuration)
    {
        var chatPermits = configuration.GetValue("RateLimiting:ChatPermitsPerMinute", 20);
        var apiPermits = configuration.GetValue("RateLimiting:ApiPermitsPerMinute", 120);

        options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
        options.OnRejected = async (context, cancellationToken) =>
        {
            if (context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter))
                context.HttpContext.Response.Headers.RetryAfter = ((int)Math.Ceiling(retryAfter.TotalSeconds)).ToString();

            await context.HttpContext.Response.WriteAsJsonAsync(new ProblemDetails
            {
                Status = StatusCodes.Status429TooManyRequests,
                Title = "Demasiadas solicitudes",
                Detail = "Ha realizado demasiadas solicitudes en poco tiempo. Espere un momento e intente nuevamente.",
            }, options: null, contentType: "application/problem+json", cancellationToken);
        };

        options.AddPolicy(RateLimitPolicies.Chat, context => SlidingWindow(PartitionKey(context), chatPermits));
        options.AddPolicy(RateLimitPolicies.Api, context => SlidingWindow(PartitionKey(context), apiPermits));
    }

    private static string PartitionKey(HttpContext context) =>
        context.User.GetOwnerId() ?? context.Connection.RemoteIpAddress?.ToString() ?? "anonymous";

    private static RateLimitPartition<string> SlidingWindow(string key, int permitsPerMinute) =>
        RateLimitPartition.GetSlidingWindowLimiter(key, _ => new SlidingWindowRateLimiterOptions
        {
            PermitLimit = permitsPerMinute,
            Window = TimeSpan.FromMinutes(1),
            SegmentsPerWindow = 6,
            QueueLimit = 0,
        });
}
