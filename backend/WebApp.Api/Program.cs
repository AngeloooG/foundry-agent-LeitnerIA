using System.Security.Claims;
using System.Text.Json;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Identity.Web;
using WebApp.Api.Models;
using WebApp.Api.Security;
using WebApp.Api.Services;

// Load .env file for local development BEFORE building the configuration.
// Values already present in the environment win: in Azure, Container Apps injects the real configuration
// and a stray .env file must never override it.
var envFilePath = Path.Combine(Directory.GetCurrentDirectory(), ".env");
if (File.Exists(envFilePath))
{
    foreach (var rawLine in File.ReadAllLines(envFilePath))
    {
        var line = rawLine.Trim();
        if (line.Length == 0 || line.StartsWith('#'))
            continue;
        if (line.StartsWith("export ", StringComparison.Ordinal))
            line = line["export ".Length..];

        var parts = line.Split('=', 2, StringSplitOptions.TrimEntries);
        if (parts.Length == 2 && parts[0].Length > 0 && Environment.GetEnvironmentVariable(parts[0]) is null)
        {
            Environment.SetEnvironmentVariable(parts[0], parts[1].Trim('"', '\''));
        }
    }
}

var builder = WebApplication.CreateBuilder(args);

// Enable PII logging for debugging auth issues (ONLY IN DEVELOPMENT)
if (builder.Environment.IsDevelopment())
{
    Microsoft.IdentityModel.Logging.IdentityModelEventSource.ShowPII = true;
}

// Add ServiceDefaults (telemetry, health checks)
builder.AddServiceDefaults();

// RFC 7807 ProblemDetails + single exception-to-ProblemDetails mapping
builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<ApiExceptionHandler>();

builder.Services.AddHttpContextAccessor();

// Request body cap. Attachments travel as base64 inside the JSON body (≈ +33 %), so this is the effective
// limit for all attachments of one message. Keep it aligned with the frontend total-size check.
var maxRequestBodyMegabytes = builder.Configuration.GetValue("Limits:MaxRequestBodyMegabytes", 30);
builder.WebHost.ConfigureKestrel(options =>
    options.Limits.MaxRequestBodySize = maxRequestBodyMegabytes * 1024L * 1024L);

// CORS is only needed in Development (Vite dev server on another port). In Azure the SPA is served by this
// same app (same origin), so no cross-origin access is granted at all.
const string DevCorsPolicy = "DevFrontend";
if (builder.Environment.IsDevelopment())
{
    builder.Services.AddCors(options =>
    {
        options.AddPolicy(DevCorsPolicy, policy => policy
            .SetIsOriginAllowed(origin =>
                Uri.TryCreate(origin, UriKind.Absolute, out var uri)
                && (uri.Host == "localhost" || uri.Host == "127.0.0.1"))
            .WithMethods("GET", "POST")
            .WithHeaders("Authorization", "Content-Type"));
    });
}

// Override ClientId and TenantId from environment variables if provided (set by azd / Container Apps)
var clientId = builder.Configuration["ENTRA_SPA_CLIENT_ID"]
    ?? builder.Configuration["AzureAd:ClientId"];
if (!string.IsNullOrEmpty(clientId))
{
    builder.Configuration["AzureAd:ClientId"] = clientId;
    builder.Configuration["AzureAd:Audience"] = $"api://{clientId}";
}

var tenantId = builder.Configuration["ENTRA_TENANT_ID"]
    ?? builder.Configuration["AzureAd:TenantId"];
if (!string.IsNullOrEmpty(tenantId))
{
    builder.Configuration["AzureAd:TenantId"] = tenantId;
}

const string RequiredScope = "Chat.ReadWrite";
const string ScopePolicyName = "RequireChatScope";
const string ChatRateLimitPolicy = "chat";
const string ApiRateLimitPolicy = "api";

// Microsoft Identity Web: validates JWT bearer tokens issued for the SPA's delegated scope
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddMicrosoftIdentityWebApi(options =>
    {
        builder.Configuration.Bind("AzureAd", options);
        var configuredClientId = builder.Configuration["AzureAd:ClientId"];
        var backendClientId = builder.Configuration["ENTRA_BACKEND_CLIENT_ID"];

        // Access tokens for the exposed API carry aud = api://{clientId} (v1) or {clientId} (v2).
        // When OBO is enabled, tokens are scoped to the backend API app.
        var audiences = new List<string> { configuredClientId!, $"api://{configuredClientId}" };
        if (!string.IsNullOrEmpty(backendClientId))
        {
            audiences.Add(backendClientId);
            audiences.Add($"api://{backendClientId}");
        }
        options.TokenValidationParameters.ValidAudiences = audiences;
        options.TokenValidationParameters.NameClaimType = ClaimTypes.Name;
        options.TokenValidationParameters.RoleClaimType = ClaimTypes.Role;
    }, options => builder.Configuration.Bind("AzureAd", options));

builder.Services.AddAuthorizationBuilder()
    .AddPolicy(ScopePolicyName, policy => policy
        .RequireAuthenticatedUser()
        .RequireScope(RequiredScope))
    // Secure by default: any endpoint without explicit authorization metadata requires the API scope.
    // Public endpoints (health probes, SPA fallback) opt out with AllowAnonymous().
    .SetFallbackPolicy(new AuthorizationPolicyBuilder()
        .RequireAuthenticatedUser()
        .RequireScope(RequiredScope)
        .Build());

// Per-user rate limiting (partitioned by Entra oid). Protects model cost and the Foundry quota.
var chatPermitsPerMinute = builder.Configuration.GetValue("RateLimiting:ChatPermitsPerMinute", 20);
var apiPermitsPerMinute = builder.Configuration.GetValue("RateLimiting:ApiPermitsPerMinute", 120);
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.OnRejected = async (context, cancellationToken) =>
    {
        if (context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter))
            context.HttpContext.Response.Headers.RetryAfter = ((int)Math.Ceiling(retryAfter.TotalSeconds)).ToString();

        await context.HttpContext.Response.WriteAsJsonAsync(new ProblemDetails
        {
            Status = StatusCodes.Status429TooManyRequests,
            Title = "Demasiadas solicitudes",
            Detail = "Ha realizado demasiadas solicitudes en poco tiempo. Espere un momento e intente nuevamente."
        }, options: null, contentType: "application/problem+json", cancellationToken);
    };

    static string PartitionKey(HttpContext context) =>
        context.User.GetOwnerId() ?? context.Connection.RemoteIpAddress?.ToString() ?? "anonymous";

    options.AddPolicy(ChatRateLimitPolicy, context => RateLimitPartition.GetSlidingWindowLimiter(
        PartitionKey(context),
        _ => new SlidingWindowRateLimiterOptions
        {
            PermitLimit = chatPermitsPerMinute,
            Window = TimeSpan.FromMinutes(1),
            SegmentsPerWindow = 6,
            QueueLimit = 0,
        }));

    options.AddPolicy(ApiRateLimitPolicy, context => RateLimitPartition.GetSlidingWindowLimiter(
        PartitionKey(context),
        _ => new SlidingWindowRateLimiterOptions
        {
            PermitLimit = apiPermitsPerMinute,
            Window = TimeSpan.FromMinutes(1),
            SegmentsPerWindow = 6,
            QueueLimit = 0,
        }));
});

// Foundry Agent Service (v2 Agents API) and background maintenance
builder.Services.AddScoped<AgentFrameworkService>();
builder.Services.AddHostedService<UploadedFilesCleanupService>();

var app = builder.Build();

app.UseMiddleware<SecurityHeadersMiddleware>();
app.UseExceptionHandler();
app.UseStatusCodePages();

// Serve the SPA (wwwroot) before routing so static assets never hit authorization
app.UseDefaultFiles();
app.UseStaticFiles();

app.UseRouting();
if (app.Environment.IsDevelopment())
{
    app.UseCors(DevCorsPolicy);
}

// Note: HTTPS redirection not needed - Azure Container Apps terminates TLS at the ingress
// (allowInsecure=false) and forwards HTTP to port 8080. HSTS is emitted by SecurityHeadersMiddleware.
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();

// Health checks (/health, /alive) — anonymous, used by container probes
app.MapDefaultEndpoints();
app.MapGet("/api/health", () => Results.Ok(new { status = "healthy" }))
    .AllowAnonymous()
    .WithName("GetHealth");

var api = app.MapGroup("/api")
    .RequireAuthorization(ScopePolicyName);

// Streaming chat: SSE events conversationId → chunk/annotations/toolUse/mcpApprovalRequest → usage → done | error
api.MapPost("/chat/stream", async (
    ChatRequest request,
    AgentFrameworkService agentService,
    HttpContext httpContext,
    ILogger<Program> logger,
    IHostEnvironment environment,
    CancellationToken cancellationToken) =>
{
    var ownerId = httpContext.User.GetOwnerId();
    if (ownerId is null)
        return Results.Problem(statusCode: StatusCodes.Status403Forbidden, title: "Acceso denegado",
            detail: "El token no identifica a un usuario.");

    // 1) Validate everything before touching Azure (no conversation/file is created for invalid input)
    var validation = ChatRequestValidator.Validate(request);
    if (!validation.IsValid)
    {
        return Results.ValidationProblem(
            validation.Errors,
            title: "Solicitud inválida",
            detail: string.Join(" ", validation.Errors.Values.SelectMany(v => v)));
    }

    // 2) Ownership: create a conversation for the caller or verify they own the one supplied
    //    (ConversationNotFoundException → 404 via ApiExceptionHandler)
    var conversationId = await agentService.ResolveConversationAsync(
        ownerId, request.ConversationId, request.Message, cancellationToken);

    // 3) Stream
    var response = httpContext.Response;
    response.ContentType = "text/event-stream";
    response.Headers.CacheControl = "no-store";

    try
    {
        await WriteSseEventAsync(response, new { type = "conversationId", conversationId }, cancellationToken);

        var startTime = DateTime.UtcNow;
        await foreach (var chunk in agentService.StreamMessageAsync(
            conversationId,
            request.Message,
            validation.Attachments,
            request.McpApproval,
            cancellationToken))
        {
            object? payload = chunk switch
            {
                { IsText: true, TextDelta: { } text } => new { type = "chunk", content = text },
                { HasAnnotations: true, Annotations: { } annotations } => new
                {
                    type = "annotations",
                    annotations = annotations.Select(a => new
                    {
                        type = a.Type,
                        label = a.Label,
                        url = a.Url,
                        fileId = a.FileId,
                        containerId = a.ContainerId,
                        startIndex = a.StartIndex,
                        endIndex = a.EndIndex,
                        quote = a.Quote
                    })
                },
                { IsMcpApprovalRequest: true, McpApprovalRequest: { } approval } => new
                {
                    type = "mcpApprovalRequest",
                    approvalRequest = new
                    {
                        id = approval.Id,
                        toolName = approval.ToolName,
                        serverLabel = approval.ServerLabel,
                        arguments = approval.Arguments,
                        previousResponseId = approval.PreviousResponseId
                    }
                },
                { IsToolUse: true, ToolName: { } toolName } => new { type = "toolUse", toolName },
                _ => null
            };

            if (payload is not null)
                await WriteSseEventAsync(response, payload, cancellationToken);
        }

        var usage = agentService.GetLastUsage();
        await WriteSseEventAsync(response, new
        {
            type = "usage",
            duration = (DateTime.UtcNow - startTime).TotalMilliseconds,
            promptTokens = usage?.InputTokens ?? 0,
            completionTokens = usage?.OutputTokens ?? 0,
            totalTokens = usage?.TotalTokens ?? 0
        }, cancellationToken);

        await WriteSseEventAsync(response, new { type = "done" }, cancellationToken);
    }
    catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
    {
        // The user cancelled or closed the page: not an error, and the connection is gone.
        logger.LogInformation("Chat stream cancelled by the client: {ConversationId}", conversationId);
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "Chat stream failed: {ConversationId}", conversationId);
        var message = environment.IsDevelopment()
            ? ex.Message
            : "Ocurrió un error inesperado al generar la respuesta. Intente nuevamente.";
        try
        {
            await WriteSseEventAsync(response, new { type = "error", message }, CancellationToken.None);
        }
        catch (Exception writeEx) when (writeEx is IOException or InvalidOperationException or OperationCanceledException)
        {
            // Connection already closed; nothing else to do.
        }
    }

    return Results.Empty;
})
.RequireRateLimiting(ChatRateLimitPolicy)
.WithName("StreamChatMessage");

// Public agent information for the UI (no system prompt, no model, no raw metadata)
api.MapGet("/agent", async (AgentFrameworkService agentService, CancellationToken cancellationToken) =>
        Results.Ok(await agentService.GetAgentMetadataAsync(cancellationToken)))
    .RequireRateLimiting(ApiRateLimitPolicy)
    .WithName("GetAgentMetadata");

// The caller's conversations (filtered by owner)
api.MapGet("/conversations", async (
    AgentFrameworkService agentService,
    HttpContext httpContext,
    int? limit,
    CancellationToken cancellationToken) =>
{
    var ownerId = httpContext.User.GetOwnerId();
    if (ownerId is null)
        return Results.Forbid();

    var pageSize = Math.Clamp(limit ?? 20, 1, 100);
    var conversations = await agentService.ListConversationsAsync(ownerId, pageSize, cancellationToken);
    var hasMore = conversations.Count > pageSize;
    return Results.Ok(new { conversations = conversations.Take(pageSize), hasMore });
})
.RequireRateLimiting(ApiRateLimitPolicy)
.WithName("ListConversations");

// Messages of a conversation owned by the caller (404 otherwise)
api.MapGet("/conversations/{conversationId}/messages", async (
    string conversationId,
    AgentFrameworkService agentService,
    HttpContext httpContext,
    CancellationToken cancellationToken) =>
{
    var ownerId = httpContext.User.GetOwnerId();
    if (ownerId is null)
        return Results.Forbid();
    if (!ChatRequestValidator.IsValidId(conversationId))
        return Results.Problem(statusCode: StatusCodes.Status400BadRequest, title: "Solicitud inválida",
            detail: "Identificador de conversación inválido.");

    return Results.Ok(await agentService.GetConversationMessagesAsync(ownerId, conversationId, cancellationToken));
})
.RequireRateLimiting(ApiRateLimitPolicy)
.WithName("GetConversationMessages");

// Unknown API routes are a real 404 (not the SPA's index.html)
app.MapFallback("/api/{**path}", () => Results.Problem(
        statusCode: StatusCodes.Status404NotFound, title: "No encontrado", detail: "El recurso solicitado no existe."))
    .AllowAnonymous();

// SPA fallback: deep links such as /agente return index.html (public; the SPA handles sign-in)
app.MapFallbackToFile("index.html").AllowAnonymous();

app.Run();

static async Task WriteSseEventAsync(HttpResponse response, object payload, CancellationToken cancellationToken)
{
    await response.WriteAsync($"data: {JsonSerializer.Serialize(payload)}\n\n", cancellationToken);
    await response.Body.FlushAsync(cancellationToken);
}

/// <summary>Entry point marker used by WebApplicationFactory in integration tests.</summary>
public partial class Program;
