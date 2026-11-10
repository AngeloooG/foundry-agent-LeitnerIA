using Azure.Core;
using Azure.Identity;

namespace WebApp.Api.Services;

/// <summary>
/// Creates the application (non-user) credential used to call Azure AI Foundry.
/// </summary>
/// <remarks>
/// <list type="bullet">
/// <item><b>Development</b>: Azure CLI, then Azure Developer CLI (the developer's own identity).</item>
/// <item><b>Other environments</b>: managed identity only. A user-assigned identity is used when
/// <c>MANAGED_IDENTITY_CLIENT_ID</c> is set (the deployed configuration).</item>
/// </list>
/// <c>DefaultAzureCredential</c> is intentionally not used so production can never fall back to
/// environment-variable secrets or developer credentials.
/// </remarks>
public static class FoundryCredentialFactory
{
    /// <summary>Token scope for the Foundry data plane.</summary>
    public const string FoundryScope = "https://ai.azure.com/.default";

    public static TokenCredential CreateAppCredential(IConfiguration configuration, IHostEnvironment environment)
    {
        if (environment.IsDevelopment())
        {
            return new ChainedTokenCredential(new AzureCliCredential(), new AzureDeveloperCliCredential());
        }

        var managedIdentityClientId = GetManagedIdentityClientId(configuration);
        return string.IsNullOrEmpty(managedIdentityClientId)
            ? new ManagedIdentityCredential(ManagedIdentityId.SystemAssigned)
            : new ManagedIdentityCredential(ManagedIdentityId.FromUserAssignedClientId(managedIdentityClientId));
    }

    public static string? GetManagedIdentityClientId(IConfiguration configuration) =>
        configuration["MANAGED_IDENTITY_CLIENT_ID"] ?? configuration["OBO_MANAGED_IDENTITY_CLIENT_ID"];
}
