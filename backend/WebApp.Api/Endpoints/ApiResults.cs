namespace WebApp.Api.Endpoints;

/// <summary>ProblemDetails helpers with user-facing Spanish messages (shown as-is by the SPA).</summary>
internal static class ApiResults
{
    public static IResult Validation(IDictionary<string, string[]> errors) =>
        Results.ValidationProblem(
            errors,
            title: "Solicitud inválida",
            detail: string.Join(" ", errors.Values.SelectMany(v => v)));

    public static IResult BadRequest(string detail) =>
        Results.Problem(statusCode: StatusCodes.Status400BadRequest, title: "Solicitud inválida", detail: detail);

    public static IResult Forbidden(string detail) =>
        Results.Problem(statusCode: StatusCodes.Status403Forbidden, title: "Acceso denegado", detail: detail);

    public static IResult NotFound() =>
        Results.Problem(statusCode: StatusCodes.Status404NotFound, title: "No encontrado", detail: "El recurso solicitado no existe.");
}
