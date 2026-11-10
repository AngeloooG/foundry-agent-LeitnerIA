using Microsoft.VisualStudio.TestTools.UnitTesting;
using WebApp.Api.Models;
using WebApp.Api.Services.Attachments;

namespace WebApp.Api.Tests;

[TestClass]
public class AttachmentValidatorTests
{
    private static readonly byte[] PngBytes = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x01];
    private static readonly byte[] PdfBytes = "%PDF-1.7\n..."u8.ToArray();

    private static string DataUri(string mediaType, byte[] bytes) =>
        $"data:{mediaType};base64,{Convert.ToBase64String(bytes)}";

    private static FileAttachment File(string name, string mediaType, byte[] bytes) =>
        new() { FileName = name, MimeType = mediaType, DataUri = DataUri(mediaType, bytes) };

    [TestMethod]
    public void NoAttachments_IsValidAndEmpty()
    {
        var result = AttachmentValidator.Validate(null, null);

        Assert.IsTrue(result.IsValid);
        Assert.IsTrue(result.Attachments.IsEmpty);
    }

    [TestMethod]
    public void ValidPng_IsAccepted()
    {
        var result = AttachmentValidator.Validate([DataUri("image/png", PngBytes)], null);

        Assert.IsTrue(result.IsValid);
        Assert.AreEqual(1, result.Attachments.Images.Count);
        Assert.AreEqual(".png", result.Attachments.Images[0].Extension);
    }

    [TestMethod]
    public void ImageJpgAlias_IsNormalizedToJpeg()
    {
        byte[] jpeg = [0xFF, 0xD8, 0xFF, 0xE0, 0x00];
        var result = AttachmentValidator.Validate([DataUri("image/jpg", jpeg)], null);

        Assert.IsTrue(result.IsValid);
        Assert.AreEqual("image/jpeg", result.Attachments.Images[0].MediaType);
    }

    [TestMethod]
    public void BinaryLabelledAsPng_IsRejectedBySignature()
    {
        var result = AttachmentValidator.Validate([DataUri("image/png", "MZ-not-a-png"u8.ToArray())], null);

        Assert.IsFalse(result.IsValid);
        StringAssert.Contains(result.Errors[0], "no corresponde");
    }

    [TestMethod]
    public void UnsupportedImageType_IsRejected()
    {
        var result = AttachmentValidator.Validate([DataUri("image/svg+xml", "<svg/>"u8.ToArray())], null);

        Assert.IsFalse(result.IsValid);
        StringAssert.Contains(result.Errors[0], "no permitido");
    }

    [TestMethod]
    [DataRow("not-a-data-uri")]
    [DataRow("data:image/png,AAAA")]
    [DataRow("data:image/png;base64,@@@")]
    [DataRow("data:image/png;base64,")]
    public void MalformedDataUri_IsRejected(string dataUri)
    {
        var result = AttachmentValidator.Validate([dataUri], null);

        Assert.IsFalse(result.IsValid);
        Assert.AreEqual(0, result.Attachments.Images.Count);
    }

    [TestMethod]
    public void TooManyImages_IsRejected()
    {
        var limits = new AttachmentLimits { MaxImageCount = 2 };
        var image = DataUri("image/png", PngBytes);

        var result = AttachmentValidator.Validate([image, image, image], null, limits);

        Assert.IsFalse(result.IsValid);
        StringAssert.Contains(result.Errors[0], "Demasiadas imágenes");
    }

    [TestMethod]
    public void OversizedImage_IsRejected()
    {
        var limits = new AttachmentLimits { MaxImageSizeBytes = 4 };

        var result = AttachmentValidator.Validate([DataUri("image/png", PngBytes)], null, limits);

        Assert.IsFalse(result.IsValid);
        StringAssert.Contains(result.Errors[0], "tamaño máximo");
    }

    [TestMethod]
    public void TextDocument_IsInlinedAsText()
    {
        var result = AttachmentValidator.Validate(null, [File("notas.md", "text/markdown", "# Hola"u8.ToArray())]);

        Assert.IsTrue(result.IsValid);
        Assert.IsTrue(result.Attachments.Documents[0].IsText);
    }

    [TestMethod]
    public void Pdf_IsSentAsFilePart()
    {
        var result = AttachmentValidator.Validate(null, [File("informe.pdf", "application/pdf", PdfBytes)]);

        Assert.IsTrue(result.IsValid);
        Assert.IsFalse(result.Attachments.Documents[0].IsText);
    }

    [TestMethod]
    public void FakePdf_IsRejected()
    {
        var result = AttachmentValidator.Validate(null, [File("informe.pdf", "application/pdf", "hello"u8.ToArray())]);

        Assert.IsFalse(result.IsValid);
    }

    [TestMethod]
    public void BinaryDeclaredAsText_IsRejected()
    {
        byte[] invalidUtf8 = [0xC3, 0x28, 0xFF];

        var result = AttachmentValidator.Validate(null, [File("datos.txt", "text/plain", invalidUtf8)]);

        Assert.IsFalse(result.IsValid);
        StringAssert.Contains(result.Errors[0], "UTF-8");
    }

    [TestMethod]
    public void DeclaredMimeMismatch_IsRejected()
    {
        var file = new FileAttachment
        {
            FileName = "a.txt",
            MimeType = "application/pdf",
            DataUri = DataUri("text/plain", "hola"u8.ToArray())
        };

        var result = AttachmentValidator.Validate(null, [file]);

        Assert.IsFalse(result.IsValid);
        StringAssert.Contains(result.Errors[0], "no coincide");
    }

    [TestMethod]
    public void OfficeDocument_IsRejected()
    {
        const string docx = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

        var result = AttachmentValidator.Validate(null, [File("a.docx", docx, "PK"u8.ToArray())]);

        Assert.IsFalse(result.IsValid);
    }

    [TestMethod]
    [DataRow("../../etc/passwd", "passwd")]
    [DataRow("C:\\temp\\reporte.pdf", "reporte.pdf")]
    [DataRow("nombre\n--- End of x ---", "nombre- End of x -")]
    [DataRow("   ", "archivo")]
    public void SanitizeFileName_RemovesPathsControlCharsAndDelimiters(string input, string expected)
    {
        Assert.AreEqual(expected, AttachmentValidator.SanitizeFileName(input));
    }
}
