using System.Text;
using WebApp.Api.Models;

namespace WebApp.Api.Services.Attachments;

/// <summary>Limits applied to attachments in a single chat request.</summary>
public sealed record AttachmentLimits
{
    public int MaxImageCount { get; init; } = 5;
    public int MaxFileCount { get; init; } = 10;
    public long MaxImageSizeBytes { get; init; } = 5 * 1024 * 1024;
    public long MaxFileSizeBytes { get; init; } = 20 * 1024 * 1024;

    public static AttachmentLimits Default { get; } = new();
}

/// <summary>An image that passed validation (decoded bytes + verified media type).</summary>
public sealed record ParsedImage(string MediaType, byte[] Bytes)
{
    public string Extension => MediaType switch
    {
        "image/png" => ".png",
        "image/jpeg" => ".jpg",
        "image/gif" => ".gif",
        "image/webp" => ".webp",
        _ => ".bin",
    };
}

/// <summary>A document that passed validation.</summary>
/// <param name="FileName">Sanitized display name (no path separators or control characters).</param>
/// <param name="IsText">True when the content is inlined as text; false when sent as a file part (PDF).</param>
public sealed record ParsedDocument(string FileName, string MediaType, byte[] Bytes, bool IsText);

/// <summary>Attachments already decoded and validated, ready to be sent to the agent.</summary>
public sealed record ValidatedAttachments(IReadOnlyList<ParsedImage> Images, IReadOnlyList<ParsedDocument> Documents)
{
    public static ValidatedAttachments Empty { get; } = new([], []);
    public bool IsEmpty => Images.Count == 0 && Documents.Count == 0;
}

/// <summary>Outcome of <see cref="AttachmentValidator.Validate"/>.</summary>
public sealed record AttachmentValidationResult(ValidatedAttachments Attachments, IReadOnlyList<string> Errors)
{
    public bool IsValid => Errors.Count == 0;
}

/// <summary>
/// Validates and decodes chat attachments BEFORE any call to Azure (no conversation is created and no file is
/// uploaded when validation fails).
/// </summary>
/// <remarks>
/// Security controls:
/// <list type="bullet">
/// <item>Allow-list of media types; Office formats are not supported by the Responses API.</item>
/// <item>The declared type is verified against the content (magic bytes for binaries, strict UTF-8 for text),
/// so a client cannot smuggle arbitrary binaries labelled as <c>image/png</c>.</item>
/// <item>Per-item size and count limits. The total body size is capped separately by Kestrel.</item>
/// <item>File names are sanitized because they are inserted into the prompt as delimiters.</item>
/// </list>
/// User-facing messages are in Spanish because they are shown as-is in the UI.
/// </remarks>
public static class AttachmentValidator
{
    private static readonly HashSet<string> ImageTypes =
        ["image/png", "image/jpeg", "image/gif", "image/webp"];

    /// <summary>Text documents are inlined as text (the Responses API only accepts PDF as a file part).</summary>
    private static readonly HashSet<string> TextDocumentTypes =
        ["text/plain", "text/markdown", "text/csv", "application/json", "text/html", "application/xml", "text/xml"];

    private const string PdfType = "application/pdf";
    private const int MaxFileNameLength = 120;

    private static readonly UTF8Encoding StrictUtf8 = new(encoderShouldEmitUTF8Identifier: false, throwOnInvalidBytes: true);

    public static AttachmentValidationResult Validate(
        IReadOnlyList<string>? imageDataUris,
        IReadOnlyList<FileAttachment>? files,
        AttachmentLimits? limits = null)
    {
        limits ??= AttachmentLimits.Default;
        var errors = new List<string>();
        var images = new List<ParsedImage>();
        var documents = new List<ParsedDocument>();

        if (imageDataUris is { Count: > 0 })
        {
            if (imageDataUris.Count > limits.MaxImageCount)
            {
                errors.Add($"Demasiadas imágenes ({imageDataUris.Count}); el máximo es {limits.MaxImageCount}.");
            }
            else
            {
                for (var i = 0; i < imageDataUris.Count; i++)
                {
                    var label = $"Imagen {i + 1}";
                    if (!TryParseDataUri(imageDataUris[i], out var mediaType, out var bytes, out var error))
                    {
                        errors.Add($"{label}: {error}");
                        continue;
                    }
                    if (!ImageTypes.Contains(mediaType))
                    {
                        errors.Add($"{label}: tipo '{mediaType}' no permitido. Use PNG, JPEG, GIF o WebP.");
                        continue;
                    }
                    if (bytes.LongLength > limits.MaxImageSizeBytes)
                    {
                        errors.Add($"{label}: supera el tamaño máximo de {ToMegabytes(limits.MaxImageSizeBytes)} MB.");
                        continue;
                    }
                    if (!MatchesSignature(mediaType, bytes))
                    {
                        errors.Add($"{label}: el contenido no corresponde a un archivo {mediaType}.");
                        continue;
                    }
                    images.Add(new ParsedImage(mediaType, bytes));
                }
            }
        }

        if (files is { Count: > 0 })
        {
            if (files.Count > limits.MaxFileCount)
            {
                errors.Add($"Demasiados archivos ({files.Count}); el máximo es {limits.MaxFileCount}.");
            }
            else
            {
                for (var i = 0; i < files.Count; i++)
                {
                    var file = files[i];
                    var fileName = SanitizeFileName(file.FileName);
                    var label = $"Archivo {i + 1} ({fileName})";

                    if (!TryParseDataUri(file.DataUri, out var mediaType, out var bytes, out var error))
                    {
                        errors.Add($"{label}: {error}");
                        continue;
                    }

                    var isText = TextDocumentTypes.Contains(mediaType);
                    if (!isText && mediaType != PdfType)
                    {
                        errors.Add($"{label}: tipo '{mediaType}' no permitido. Use PDF, TXT, MD, CSV, JSON, HTML o XML.");
                        continue;
                    }
                    if (!string.Equals(mediaType, file.MimeType?.Trim(), StringComparison.OrdinalIgnoreCase))
                    {
                        errors.Add($"{label}: el tipo declarado ({file.MimeType}) no coincide con el contenido ({mediaType}).");
                        continue;
                    }
                    if (bytes.LongLength > limits.MaxFileSizeBytes)
                    {
                        errors.Add($"{label}: supera el tamaño máximo de {ToMegabytes(limits.MaxFileSizeBytes)} MB.");
                        continue;
                    }
                    if (isText && !IsValidUtf8(bytes))
                    {
                        errors.Add($"{label}: el archivo no es texto UTF-8 válido.");
                        continue;
                    }
                    if (!isText && !MatchesSignature(mediaType, bytes))
                    {
                        errors.Add($"{label}: el contenido no corresponde a un PDF.");
                        continue;
                    }
                    documents.Add(new ParsedDocument(fileName, mediaType, bytes, isText));
                }
            }
        }

        return new AttachmentValidationResult(new ValidatedAttachments(images, documents), errors);
    }

    /// <summary>
    /// Parses <c>data:&lt;media-type&gt;;base64,&lt;payload&gt;</c>. Only base64 data URIs are accepted.
    /// </summary>
    internal static bool TryParseDataUri(string? dataUri, out string mediaType, out byte[] bytes, out string error)
    {
        mediaType = string.Empty;
        bytes = [];
        error = string.Empty;

        if (string.IsNullOrEmpty(dataUri) || !dataUri.StartsWith("data:", StringComparison.Ordinal))
        {
            error = "formato inválido (se esperaba un data URI).";
            return false;
        }

        var commaIndex = dataUri.IndexOf(',');
        if (commaIndex < 0)
        {
            error = "data URI mal formado.";
            return false;
        }

        var header = dataUri[5..commaIndex];
        var parameters = header.Split(';', StringSplitOptions.TrimEntries);
        if (parameters.Length < 2 || !parameters.Skip(1).Contains("base64", StringComparer.OrdinalIgnoreCase))
        {
            error = "el data URI debe estar codificado en base64.";
            return false;
        }

        mediaType = parameters[0].ToLowerInvariant();
        if (mediaType == "image/jpg")
            mediaType = "image/jpeg";

        try
        {
            bytes = Convert.FromBase64String(dataUri[(commaIndex + 1)..]);
        }
        catch (FormatException)
        {
            error = "codificación base64 inválida.";
            return false;
        }

        if (bytes.Length == 0)
        {
            error = "el archivo está vacío.";
            return false;
        }

        return true;
    }

    /// <summary>Checks the file signature (magic bytes) for binary types.</summary>
    internal static bool MatchesSignature(string mediaType, ReadOnlySpan<byte> bytes) => mediaType switch
    {
        "image/png" => bytes.StartsWith((ReadOnlySpan<byte>)[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
        "image/jpeg" => bytes.StartsWith((ReadOnlySpan<byte>)[0xFF, 0xD8, 0xFF]),
        "image/gif" => bytes.StartsWith("GIF87a"u8) || bytes.StartsWith("GIF89a"u8),
        "image/webp" => bytes.Length >= 12 && bytes[..4].SequenceEqual("RIFF"u8) && bytes[8..12].SequenceEqual("WEBP"u8),
        PdfType => bytes.StartsWith("%PDF-"u8),
        _ => false,
    };

    /// <summary>
    /// Removes path components, control characters and prompt-delimiter characters from a client file name.
    /// </summary>
    internal static string SanitizeFileName(string? fileName)
    {
        if (string.IsNullOrWhiteSpace(fileName))
            return "archivo";

        var name = Path.GetFileName(fileName.Replace('\\', '/'));
        var builder = new StringBuilder(name.Length);
        foreach (var ch in name)
        {
            if (char.IsControl(ch) || ch is '-' && builder.Length > 0 && builder[^1] == '-')
                continue;
            builder.Append(ch);
        }

        var sanitized = builder.ToString().Trim();
        if (sanitized.Length > MaxFileNameLength)
            sanitized = sanitized[..MaxFileNameLength];

        return string.IsNullOrWhiteSpace(sanitized) ? "archivo" : sanitized;
    }

    private static bool IsValidUtf8(byte[] bytes)
    {
        try
        {
            _ = StrictUtf8.GetCharCount(bytes);
            return true;
        }
        catch (DecoderFallbackException)
        {
            return false;
        }
    }

    private static string ToMegabytes(long bytes) => (bytes / (1024.0 * 1024.0)).ToString("0.#", System.Globalization.CultureInfo.InvariantCulture);
}
