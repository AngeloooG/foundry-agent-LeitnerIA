using Microsoft.VisualStudio.TestTools.UnitTesting;
using WebApp.Api.Models;
using WebApp.Api.Services;

namespace WebApp.Api.Tests;

[TestClass]
public class ChatRequestValidatorTests
{
    [TestMethod]
    public void ValidNewConversation_IsAccepted()
    {
        var result = ChatRequestValidator.Validate(new ChatRequest { Message = "Genera la battlecard" });

        Assert.IsTrue(result.IsValid);
    }

    [TestMethod]
    [DataRow("")]
    [DataRow("   ")]
    public void EmptyMessage_IsRejected(string message)
    {
        var result = ChatRequestValidator.Validate(new ChatRequest { Message = message });

        Assert.IsFalse(result.IsValid);
        Assert.IsTrue(result.Errors.ContainsKey("message"));
    }

    [TestMethod]
    public void MessageOverLimit_IsRejected()
    {
        var result = ChatRequestValidator.Validate(new ChatRequest
        {
            Message = new string('a', ChatRequestValidator.MaxMessageLength + 1)
        });

        Assert.IsFalse(result.IsValid);
        Assert.IsTrue(result.Errors.ContainsKey("message"));
    }

    [TestMethod]
    [DataRow("../conversations")]
    [DataRow("conv id")]
    [DataRow("conv_%2e%2e")]
    public void InvalidConversationId_IsRejected(string conversationId)
    {
        var result = ChatRequestValidator.Validate(new ChatRequest { Message = "hola", ConversationId = conversationId });

        Assert.IsFalse(result.IsValid);
        Assert.IsTrue(result.Errors.ContainsKey("conversationId"));
    }

    [TestMethod]
    public void McpApproval_WithoutMessage_IsAccepted()
    {
        var result = ChatRequestValidator.Validate(new ChatRequest
        {
            Message = "",
            ConversationId = "conv_123",
            PreviousResponseId = "resp_456",
            McpApproval = new McpApprovalResponse { ApprovalRequestId = "mcpr_789", Approved = true }
        });

        Assert.IsTrue(result.IsValid);
    }

    [TestMethod]
    public void McpApproval_WithoutConversation_IsRejected()
    {
        var result = ChatRequestValidator.Validate(new ChatRequest
        {
            Message = "",
            PreviousResponseId = "resp_456",
            McpApproval = new McpApprovalResponse { ApprovalRequestId = "mcpr_789", Approved = true }
        });

        Assert.IsFalse(result.IsValid);
        Assert.IsTrue(result.Errors.ContainsKey("conversationId"));
    }

    [TestMethod]
    public void InvalidAttachment_IsReportedUnderAttachments()
    {
        var result = ChatRequestValidator.Validate(new ChatRequest
        {
            Message = "hola",
            ImageDataUris = ["not-a-data-uri"]
        });

        Assert.IsFalse(result.IsValid);
        Assert.IsTrue(result.Errors.ContainsKey("attachments"));
    }
}
