using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;

namespace WebApp.Api.Security;

/// <summary>
/// Single place that turns unhandled exceptions into RFC 7807 ProblemDetails responses.
/// </summary>
/// <remarks>
/// Replaces the per-endpoint try/catch blocks. Internal details (exception message, type, stack trace)
/// are only included in Development; in other environments the client receives a generic Spanish message
/// and the exception is logged to Application Insights.
/// </remarks>
public sealed class ApiExceptionHandler(
    IProblemDetailsService problemDetailsService,
    IHostEnvironment environment,
    ILogger<ApiExceptionHandler> logger) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        if (exception is OperationCanceledException && httpContext.RequestAborted.IsCancellationRequested)
        {
            // Client disconnected: nothing to send and not an error.
            logger.LogDebug("Request aborted by the client: {Path}", httpContext.Request.Path);
            return true;
        }

        var (status, title, detail) = exception switch
        {
            ConversationNotFoundException => (StatusCodes.Status404NotFound, "Conversación no encontrada",
                "La conversación no existe o no pertenece al usuario actual."),
            BadHttpRequestException badRequest => (badRequest.StatusCode, "Solicitud inválida",
                "La solicitud no tiene un formato válido."),
            _ => (StatusCodes.Status500InternalServerError, "Servicio no disponible temporalmente",
                "Ocurrió un error inesperado. Intente nuevamente en unos minutos."),
        };

        if (status >= StatusCodes.Status500InternalServerError)
            logger.LogError(exception, "Unhandled exception for {Method} {Path}", httpContext.Request.Method, httpContext.Request.Path);
        else
            logger.LogInformation("Request rejected with {Status} for {Path}: {ExceptionType}", status, httpContext.Request.Path, exception.GetType().Name);

        var problem = new ProblemDetails { Status = status, Title = title, Detail = detail };
        if (environment.IsDevelopment())
        {
            problem.Extensions["exceptionType"] = exception.GetType().Name;
            problem.Extensions["exceptionMessage"] = exception.Message;
        }

        httpContext.Response.StatusCode = status;
        return await problemDetailsService.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = httpContext,
            ProblemDetails = problem,
            Exception = exception,
        });
    }
}
