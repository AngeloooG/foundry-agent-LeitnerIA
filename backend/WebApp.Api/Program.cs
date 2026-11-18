using OpenTelemetry.Metrics;
using WebApp.Api.Endpoints;
using WebApp.Api.Infrastructure.Configuration;
using WebApp.Api.Infrastructure.Foundry;
using WebApp.Api.Observability;
using WebApp.Api.Security;

// Local development only: values already present in the environment always win.
DotEnvLoader.LoadIfPresent(Path.Combine(Directory.GetCurrentDirectory(), ".env"));

var builder = WebApplication.CreateBuilder(args);

if (builder.Environment.IsDevelopment())
{
    // PII in identity logs ONLY in Development, to troubleshoot token validation.
    Microsoft.IdentityModel.Logging.IdentityModelEventSource.ShowPII = true;
}

builder.AddServiceDefaults(); // OpenTelemetry (Application Insights), health checks, HttpClient resilience
builder.Services.ConfigureOpenTelemetryMeterProvider(metrics => metrics.AddMeter(ChatMetrics.MeterName));

builder.Services.AddProblemDetails(options => options.CustomizeProblemDetails = ApiProblemDetails.LocalizeAuthErrors);
builder.Services.AddExceptionHandler<ApiExceptionHandler>();

// Request body cap. Attachments travel as base64 inside the JSON body (≈ +33 %), so this bounds all the
// attachments of one message. Keep aligned with frontend/src/config/appConfig.ts (attachmentLimits.maxTotalBytes).
var maxBodyMegabytes = builder.Configuration.GetValue("Limits:MaxRequestBodyMegabytes", 30);
builder.WebHost.ConfigureKestrel(options => options.Limits.MaxRequestBodySize = maxBodyMegabytes * 1024L * 1024L);

builder.AddApiSecurity();
builder.AddLeitnerAgent();

var app = builder.Build();

app.UseMiddleware<SecurityHeadersMiddleware>();
app.UseExceptionHandler();
app.UseStatusCodePages();

// SPA (wwwroot) is served before routing so static assets never reach authorization.
app.UseDefaultFiles();
app.UseStaticFiles();

app.UseRouting();
if (app.Environment.IsDevelopment())
    app.UseCors(SecurityServiceCollectionExtensions.DevCorsPolicy);

// TLS terminates at the Container Apps ingress (allowInsecure=false); HSTS is sent by SecurityHeadersMiddleware.
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();

// Anonymous health probes
app.MapDefaultEndpoints();
app.MapGet("/api/health", () => Results.Ok(new { status = "healthy" })).AllowAnonymous().WithName("GetHealth");

app.MapGroup("/api")
    .RequireAuthorization(AuthorizationPolicies.ChatScope)
    .MapChatEndpoints()
    .MapAgentEndpoints()
    .MapConversationEndpoints();

// Unknown API routes are a real 404 (not the SPA's index.html); deep links such as /agente return the SPA.
// Not anonymous: the FallbackPolicy applies, so unauthenticated callers get 401 and cannot probe API routes.
app.MapFallback("/api/{**path}", ApiResults.NotFound);
app.MapFallbackToFile("index.html").AllowAnonymous();

app.Run();

/// <summary>Entry point marker used by WebApplicationFactory in integration tests.</summary>
public partial class Program;
