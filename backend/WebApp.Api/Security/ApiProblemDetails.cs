using Microsoft.AspNetCore.Http;

namespace WebApp.Api.Security;

/// <summary>
/// User-facing (Spanish) messages for the 401/403 responses produced by the authentication and authorization
/// middleware. The SPA shows the ProblemDetails "detail" as-is. No internal reason (tenant, group id, claims) is
/// disclosed to the client.
/// </summary>
public static class ApiProblemDetails
{
    public static void LocalizeAuthErrors(ProblemDetailsContext context)
    {
        var problem = context.ProblemDetails;
        if (!string.IsNullOrEmpty(problem.Detail))
            return; // Explicit messages written by the API are kept.

        switch (problem.Status)
        {
            case StatusCodes.Status401Unauthorized:
                problem.Title = "Sesión no válida";
                problem.Detail = "Su sesión no es válida o ha expirado. Vuelva a iniciar sesión.";
                break;
            case StatusCodes.Status403Forbidden:
                problem.Title = "Acceso denegado";
                problem.Detail = "No tiene permiso para usar Leitner IA. Si necesita acceso, contacte al administrador.";
                break;
        }
    }
}
