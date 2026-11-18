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
            ["ENABLE_OBO"] = "true",
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

[TestClass]
public class EnableOboTests
{
    private static FoundryOptions Bind(string? enableObo)
    {
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["AI_AGENT_ENDPOINT"] = "https://acct/api/projects/p",
            ["AI_AGENT_ID"] = "a",
            ["ENTRA_TENANT_ID"] = "00000000-0000-0000-0000-000000000002",
            ["ENTRA_BACKEND_CLIENT_ID"] = "00000000-0000-0000-0000-0000000000b1",
            ["MANAGED_IDENTITY_CLIENT_ID"] = "00000000-0000-0000-0000-0000000000c1",
            ["ENABLE_OBO"] = enableObo,
        }).Build();
        var options = new FoundryOptions();
        FoundryOptions.Bind(options, configuration);
        return options;
    }

    [TestMethod]
    [DataRow(null)]
    [DataRow("")]
    [DataRow("false")]
    [DataRow("False")]
    public void SeparateBackendRegistration_DoesNotEnableObo(string? value)
    {
        var options = Bind(value);

        Assert.IsFalse(options.UseOnBehalfOf(isDevelopment: false), "Managed identity must stay the default.");
        Assert.AreEqual(0, options.Validate(isDevelopment: false).Count());
    }

    [TestMethod]
    public void EnableOboTrue_EnablesOboOutsideDevelopment()
    {
        var options = Bind("true");

        Assert.IsTrue(options.UseOnBehalfOf(isDevelopment: false));
        Assert.IsFalse(options.UseOnBehalfOf(isDevelopment: true));
    }

    [TestMethod]
    [DataRow("yes")]
    [DataRow("1")]
    [DataRow("enabled")]
    public void InvalidBoolean_IsAConfigurationError(string value)
    {
        var options = Bind(value);

        Assert.IsFalse(options.UseOnBehalfOf(isDevelopment: false));
        StringAssert.Contains(options.Validate(isDevelopment: false).Single(), "ENABLE_OBO");
    }
}

[TestClass]
public class SpaBundleConsistencyTests
{
    private const string Frontend = "00000000-0000-0000-0000-000000000001";
    private const string Backend = "00000000-0000-0000-0000-0000000000b1";
    private static readonly WebApp.Api.Security.EntraOptions Entra = new()
    {
        TenantId = "00000000-0000-0000-0000-000000000002",
        FrontendClientId = Frontend,
        BackendClientId = Backend,
    };

    private static string NewWebRoot(string? buildInfoJson, bool withIndex = true)
    {
        var dir = Directory.CreateTempSubdirectory("leitneria-wwwroot-").FullName;
        if (withIndex)
            File.WriteAllText(Path.Combine(dir, "index.html"), "<html></html>");
        if (buildInfoJson is not null)
            File.WriteAllText(Path.Combine(dir, WebApp.Api.Security.SpaBundleConsistencyCheck.BuildInfoFileName), buildInfoJson);
        return dir;
    }

    [TestMethod]
    public void ApiOnlyHost_IsSkipped()
    {
        Assert.IsNull(WebApp.Api.Security.SpaBundleConsistencyCheck.Validate(NewWebRoot(null, withIndex: false), null, Entra));
        Assert.IsNull(WebApp.Api.Security.SpaBundleConsistencyCheck.Validate(null, null, Entra));
    }

    [TestMethod]
    public void MatchingBundle_IsAccepted()
    {
        var root = NewWebRoot($$"""{"frontendClientId":"{{Frontend}}","backendClientId":"{{Backend.ToUpperInvariant()}}"}""");

        Assert.IsNull(WebApp.Api.Security.SpaBundleConsistencyCheck.Validate(root, null, Entra));
    }

    [TestMethod]
    public void BundleBuiltForAnotherBackend_IsRejected()
    {
        var root = NewWebRoot($$"""{"frontendClientId":"{{Frontend}}","backendClientId":"99999999-0000-0000-0000-000000000000"}""");

        StringAssert.Contains(WebApp.Api.Security.SpaBundleConsistencyCheck.Validate(root, null, Entra), "ENTRA_BACKEND_CLIENT_ID");
    }

    [TestMethod]
    public void BundleBuiltForAnotherFrontend_IsRejected()
    {
        var root = NewWebRoot($$"""{"frontendClientId":"99999999-0000-0000-0000-000000000000","backendClientId":"{{Backend}}"}""");

        StringAssert.Contains(WebApp.Api.Security.SpaBundleConsistencyCheck.Validate(root, null, Entra), "ENTRA_FRONTEND_CLIENT_ID");
    }

    [TestMethod]
    [DataRow(null)]
    [DataRow("not json")]
    public void BundleWithoutValidBuildInfo_IsRejected(string? content)
    {
        Assert.IsNotNull(WebApp.Api.Security.SpaBundleConsistencyCheck.Validate(NewWebRoot(content), null, Entra));
    }

    [TestMethod]
    public void MismatchedBundle_StopsTheHost()
    {
        var root = NewWebRoot($$"""{"frontendClientId":"{{Frontend}}","backendClientId":"99999999-0000-0000-0000-000000000000"}""");
        using var factory = new WebApp.Api.Tests.Integration.TestWebApplicationFactory(settings: new Dictionary<string, string?>
        {
            ["Spa:BuildInfoPath"] = Path.Combine(root, WebApp.Api.Security.SpaBundleConsistencyCheck.BuildInfoFileName),
        });

        var exception = Assert.ThrowsExactly<InvalidOperationException>(() => factory.CreateClient());
        StringAssert.Contains(exception.Message, "ENTRA_BACKEND_CLIENT_ID");
    }
}
