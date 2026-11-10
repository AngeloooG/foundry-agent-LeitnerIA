using Microsoft.Extensions.Configuration;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using WebApp.Api.Endpoints;
using WebApp.Api.Infrastructure.Configuration;
using WebApp.Api.Infrastructure.Foundry;
using WebApp.Api.Models;

namespace WebApp.Api.Tests;

[TestClass]
public class FoundryOptionsTests
{
    private static FoundryOptions Bind(Dictionary<string, string?> values)
    {
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(values).Build();
        var options = new FoundryOptions();
        FoundryOptions.Bind(options, configuration);
        return options;
    }

    [TestMethod]
    public void ValidConfiguration_HasNoErrors()
    {
        var options = Bind(new()
        {
            ["AI_AGENT_ENDPOINT"] = "https://acct.services.ai.azure.com/api/projects/p",
            ["AI_AGENT_ID"] = "LeitnerIA",
        });

        Assert.AreEqual(0, options.Validate(isDevelopment: false).Count());
    }

    [TestMethod]
    public void Placeholders_AreRejected()
    {
        var options = Bind(new()
        {
            ["AI_AGENT_ENDPOINT"] = "PLACEHOLDER_SET_VIA_ENV_VAR_OR_AZD_PREPROVISION",
            ["AI_AGENT_ID"] = "PLACEHOLDER_SET_VIA_ENV_VAR_OR_AZD_PREPROVISION",
        });

        Assert.AreEqual(2, options.Validate(isDevelopment: false).Count());
    }

    [TestMethod]
    public void HttpEndpoint_IsRejected()
    {
        var options = Bind(new() { ["AI_AGENT_ENDPOINT"] = "http://acct/api/projects/p", ["AI_AGENT_ID"] = "a" });

        Assert.AreEqual(1, options.Validate(isDevelopment: false).Count());
    }

    [TestMethod]
    public void Obo_IsOnlyUsedOutsideDevelopment_AndRequiresManagedIdentity()
    {
        var options = Bind(new()
        {
            ["AI_AGENT_ENDPOINT"] = "https://acct/api/projects/p",
            ["AI_AGENT_ID"] = "a",
            ["ENTRA_BACKEND_CLIENT_ID"] = "backend",
            ["ENTRA_TENANT_ID"] = "tenant",
        });

        Assert.IsFalse(options.UseOnBehalfOf(isDevelopment: true));
        Assert.IsTrue(options.UseOnBehalfOf(isDevelopment: false));
        Assert.AreEqual(1, options.Validate(isDevelopment: false).Count(), "OBO without MANAGED_IDENTITY_CLIENT_ID is invalid.");
    }

    [TestMethod]
    public void AgentCacheMinutes_IsConfigurable()
    {
        var options = Bind(new() { ["Foundry:AgentCacheMinutes"] = "3" });

        Assert.AreEqual(TimeSpan.FromMinutes(3), options.AgentCacheDuration);
    }
}

[TestClass]
public class DotEnvLoaderTests
{
    [TestMethod]
    public void Parse_HandlesCommentsExportAndQuotes()
    {
        var parsed = DotEnvLoader.Parse(
        [
            "# comment",
            "",
            "AI_AGENT_ID=LeitnerIA",
            "export ENTRA_TENANT_ID=\"tenant-id\"",
            "QUOTED='value with = sign'",
            "INVALID_LINE",
        ]).ToList();

        CollectionAssert.AreEqual(
            new[] { ("AI_AGENT_ID", "LeitnerIA"), ("ENTRA_TENANT_ID", "tenant-id"), ("QUOTED", "value with = sign") },
            parsed);
    }

    [TestMethod]
    public void LoadIfPresent_DoesNotOverrideExistingEnvironmentVariables()
    {
        var key = $"LEITNERIA_TEST_{Guid.NewGuid():N}";
        var path = Path.GetTempFileName();
        try
        {
            Environment.SetEnvironmentVariable(key, "from-environment");
            File.WriteAllText(path, $"{key}=from-dotenv");

            DotEnvLoader.LoadIfPresent(path);

            Assert.AreEqual("from-environment", Environment.GetEnvironmentVariable(key));
        }
        finally
        {
            Environment.SetEnvironmentVariable(key, null);
            File.Delete(path);
        }
    }
}

[TestClass]
public class SseContractTests
{
    [TestMethod]
    public void Events_UseTypeDiscriminatorAndCamelCase()
    {
        Assert.AreEqual("data: {\"type\":\"chunk\",\"content\":\"Hola\"}\n\n", ChatEndpoints.Format(new TextChunkEvent("Hola")));
        Assert.AreEqual("data: {\"type\":\"done\"}\n\n", ChatEndpoints.Format(new DoneEvent()));
        StringAssert.StartsWith(
            ChatEndpoints.Format(new UsageEvent(1.5, 1, 2, 3)),
            "data: {\"type\":\"usage\",\"duration\":1.5,\"promptTokens\":1,\"completionTokens\":2,\"totalTokens\":3}");
    }

    [TestMethod]
    public void McpApprovalRequest_MatchesFrontendContract()
    {
        var json = ChatEndpoints.Format(new McpApprovalRequestEvent(new McpApprovalRequest
        {
            Id = "mcpr_1",
            ToolName = "tool",
            ServerLabel = "server",
            PreviousResponseId = "resp_1",
        }));

        StringAssert.Contains(json, "\"type\":\"mcpApprovalRequest\"");
        StringAssert.Contains(json, "\"approvalRequest\":{\"id\":\"mcpr_1\",\"toolName\":\"tool\",\"serverLabel\":\"server\"");
        StringAssert.Contains(json, "\"previousResponseId\":\"resp_1\"");
    }

    [TestMethod]
    public void StarterPrompts_AreSplitByLine()
    {
        CollectionAssert.AreEqual(new[] { "Uno", "Dos" }, FoundryAgentGateway.ParseStarterPrompts("Uno\r\n\n  Dos  ")!.ToArray());
        Assert.IsNull(FoundryAgentGateway.ParseStarterPrompts("  "));
    }
}
