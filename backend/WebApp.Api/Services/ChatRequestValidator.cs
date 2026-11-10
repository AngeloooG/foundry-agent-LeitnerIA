using System.Text.RegularExpressions;
using WebApp.Api.Models;
using WebApp.Api.Services.Attachments;

namespace WebApp.Api.Services;

/// <summary>Outcome of validating a <see cref="ChatRequest"/>.</summary>
public sealed record ChatRequestValidationResult(
    IDictionary<string, string[]> Errors,
    ValidatedAttachments Attachments)
{
    public bool IsValid => Errors.Count == 0;
}

/// <summary>
/// Validates a chat request before any Azure call is made, so invalid input never creates conversations,
/// uploads files or consumes model tokens. Messages are in Spanish because the UI shows them as-is.
/// </summary>
public static partial class ChatRequestValidator
{
    /// <summary>
    /// Maximum message length in characters. The Battlecard prompt builder produces prompts of a few thousand
    /// characters; this cap leaves ample room while bounding token cost per request.
    /// </summary>
    public const int MaxMessageLength = 32_000;

    /// <summary>Foundry/OpenAI ids are short opaque tokens (e.g. <c>conv_…</c>, <c>resp_…</c>, <c>mcpr_…</c>).</summary>
    [GeneratedRegex("^[A-Za-z0-9_-]{1,128}$", RegexOptions.CultureInvariant)]
    private static partial Regex IdPattern();

    public static bool IsValidId(string? value) => value is not null && IdPattern().IsMatch(value);

    public static ChatRequestValidationResult Validate(ChatRequest? request, AttachmentLimits? limits = null)
    {
        var errors = new Dictionary<string, string[]>(StringComparer.Ordinal);

        if (request is null)
        {
            errors["request"] = ["La solicitud está vacía."];
            return new ChatRequestValidationResult(errors, ValidatedAttachments.Empty);
        }

        if (request.ConversationId is not null && !IsValidId(request.ConversationId))
            errors["conversationId"] = ["Identificador de conversación inválido."];

        if (request.PreviousResponseId is not null && !IsValidId(request.PreviousResponseId))
            errors["previousResponseId"] = ["Identificador de respuesta inválido."];

        var isApproval = request.McpApproval is not null;
        if (isApproval)
        {
            if (!IsValidId(request.McpApproval!.ApprovalRequestId))
                errors["mcpApproval.approvalRequestId"] = ["Identificador de aprobación inválido."];
            if (request.ConversationId is null)
                errors["conversationId"] = ["Una aprobación de herramienta requiere una conversación existente."];
            if (string.IsNullOrEmpty(request.PreviousResponseId))
                errors["previousResponseId"] = ["Una aprobación de herramienta requiere previousResponseId."];
        }
        else if (string.IsNullOrWhiteSpace(request.Message))
        {
            errors["message"] = ["El mensaje no puede estar vacío."];
        }

        if (request.Message is { Length: > MaxMessageLength })
            errors["message"] = [$"El mensaje supera el máximo de {MaxMessageLength:N0} caracteres."];

        var attachmentResult = AttachmentValidator.Validate(request.ImageDataUris, request.FileDataUris, limits);
        if (!attachmentResult.IsValid)
            errors["attachments"] = [.. attachmentResult.Errors];

        return new ChatRequestValidationResult(errors, attachmentResult.Attachments);
    }
}
