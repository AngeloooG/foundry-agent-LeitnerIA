using System.Security.Claims;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Identity.Web;

namespace WebApp.Api.Security;

public static class RateLimitPolicies
{
    public const string Chat = "chat";
    public const string Api = "api";
}

public static class AuthorizationPolicies
{
    public const string RequiredScope = "Chat.ReadWrite";
    public const string ChatScope = "RequireChatScope";
}

/// <summary>
/// Authentication (Entra ID), authorization (scope + secure-by-default fallback), rate limiting and CORS.
/// </summary>
public static class SecurityServiceCollectionExtensions
{
    public const string DevCorsPolicy = "DevFrontend";

    public static WebApplicationBuilder AddApiSecurity(this WebApplicationBuilder builder)
    {
        var configuration = builder.Configuration;
        var isDevelopment = builder.Environment.IsDevelopment();

        // Entra ID settings come from azd / Container Apps environment variables.
        var clientId = configuration["ENTRA_SPA_CLIENT_ID"] ?? configuration["AzureAd:ClientId"];
        var tenantId = configuration["ENTRA_TENANT_ID"] ?? configuration["AzureAd:TenantId"];
        if (!Guid.TryParse(clientId, out _) || !Guid.TryParse(tenantId, out _))
        {
            // Fail fast: placeholders would otherwise start the app and reject every request at runtime.
            throw new InvalidOperationException(
                "ENTRA_SPA_CLIENT_ID and ENTRA_TENANT_ID must be valid GUIDs. Run 'azd provision' or configure the .env file.");
        }
        configuration["AzureAd:ClientId"] = clientId;
        configuration["AzureAd:TenantId"] = tenantId;
        configuration["AzureAd:Audience"] = $"api://{clientId}";

        builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddMicrosoftIdentityWebApi(options =>
            {
                configuration.Bind("AzureAd", options);
                var backendClientId = configuration["ENTRA_BACKEND_CLIENT_ID"];

                // Access tokens for the exposed API carry aud = api://{clientId} (v1) or {clientId} (v2).
                var audiences = new List<string> { clientId!, $"api://{clientId}" };
                if (!string.IsNullOrEmpty(backendClientId))
                {
                    audiences.Add(backendClientId);
                    audiences.Add($"api://{backendClientId}");
                }
                options.TokenValidationParameters.ValidAudiences = audiences;
                options.TokenValidationParameters.NameClaimType = ClaimTypes.Name;
                options.TokenValidationParameters.RoleClaimType = ClaimTypes.Role;
            }, options => configuration.Bind("AzureAd", options));

        var scopePolicy = new AuthorizationPolicyBuilder()
            .RequireAuthenticatedUser()
            .RequireScope(AuthorizationPolicies.RequiredScope)
            .Build();

        builder.Services.AddAuthorizationBuilder()
            .AddPolicy(AuthorizationPolicies.ChatScope, scopePolicy)
            // Secure by default: endpoints without explicit metadata require the API scope.
            // Public endpoints (health probes, SPA fallback) opt out with AllowAnonymous().
            .SetFallbackPolicy(scopePolicy);

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
