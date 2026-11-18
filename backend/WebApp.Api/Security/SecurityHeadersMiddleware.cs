namespace WebApp.Api.Security;

/// <summary>
/// Adds browser security headers to every response (SPA, static files and API).
/// </summary>
/// <remarks>
/// <para>The default Content-Security-Policy allows only what the SPA needs:</para>
/// <list type="bullet">
/// <item><c>script-src 'self'</c>: Vite emits external module scripts only (no inline scripts).</item>
/// <item><c>style-src 'unsafe-inline'</c>: required by Fluent UI (Griffel injects &lt;style&gt; tags) and the
/// inline style blocks of the pages. Scripts remain strictly same-origin, which is what blocks XSS execution.</item>
/// <item><c>img-src 'self' data: blob:</c>: blocks external images, which prevents data exfiltration through
/// Markdown images injected into agent output (prompt injection).</item>
/// <item><c>connect-src</c>: same origin, Entra ID (MSAL) and Application Insights ingestion.</item>
/// <item><c>frame-src</c>: Entra ID (MSAL silent renew iframe). <c>frame-ancestors 'none'</c> blocks clickjacking.</item>
/// </list>
/// The policy can be overridden with <c>Security:ContentSecurityPolicy</c> without a code change.
/// HSTS is emitted outside Development; TLS terminates at the Container Apps ingress, so the request
/// reaching Kestrel is HTTP and <c>UseHsts()</c> would never fire.
/// </remarks>
public sealed class SecurityHeadersMiddleware(RequestDelegate next, IConfiguration configuration, IHostEnvironment environment)
{
    public const string DefaultContentSecurityPolicy =
        "default-src 'self'; " +
        "script-src 'self'; " +
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
        "font-src 'self' data: https://fonts.gstatic.com; " +
        "img-src 'self' data: blob:; " +
        "connect-src 'self' https://login.microsoftonline.com https://*.in.applicationinsights.azure.com " +
        "https://*.applicationinsights.azure.com https://*.livediagnostics.monitor.azure.com https://js.monitor.azure.com; " +
        "frame-src https://login.microsoftonline.com; " +
        "frame-ancestors 'none'; " +
        "form-action 'self' https://login.microsoftonline.com; " +
        "base-uri 'self'; " +
        "object-src 'none'";

    private readonly string _contentSecurityPolicy =
        configuration["Security:ContentSecurityPolicy"] is { Length: > 0 } csp ? csp : DefaultContentSecurityPolicy;

    private readonly bool _emitHsts = !environment.IsDevelopment();

    public Task InvokeAsync(HttpContext context)
    {
        var headers = context.Response.Headers;
        headers.ContentSecurityPolicy = _contentSecurityPolicy;
        headers.XContentTypeOptions = "nosniff";
        headers.XFrameOptions = "DENY";
        headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
        headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=(), payment=(), usb=()";
        headers["Cross-Origin-Resource-Policy"] = "same-origin";

        if (_emitHsts)
            headers.StrictTransportSecurity = "max-age=31536000; includeSubDomains";

        // API responses carry user data: never cache them in shared or browser caches.
        if (context.Request.Path.StartsWithSegments("/api"))
            headers.CacheControl = "no-store";

        return next(context);
    }
}
