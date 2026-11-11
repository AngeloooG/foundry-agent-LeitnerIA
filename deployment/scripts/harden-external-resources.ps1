#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Hardening of the Azure resources LeitnerIA depends on but does not provision (MCP Function App,
    its storage account and the Foundry account).

.DESCRIPTION
    DRY RUN BY DEFAULT: prints the commands and their impact. Use -Apply to execute them.
    These resources are shared/managed outside this repository, so every change must be reviewed by a
    senior engineer and the owners of the other consumers (security, networking and permissions changes).

    Findings (read-only review, 2026-11-10):
      Function App (MCP server)  : httpsOnly = false, no authentication, no managed identity.
      Function storage account   : shared-key access enabled, minimum TLS 1.0, network rules = Allow.
      Foundry account            : local (key) authentication enabled, public network access = Allow.
      Agent MCP tool             : require_approval = "never".

.PARAMETER FunctionAppName / FunctionResourceGroup / StorageAccountName
    MCP Function App, its resource group and its storage account.

.PARAMETER FoundryAccountName / FoundryResourceGroup
    Foundry (AIServices) account used by the agent.

.PARAMETER Apply
    Execute the commands (otherwise only print them).

.EXAMPLE
    ./deployment/scripts/harden-external-resources.ps1 -FunctionAppName leitnermcp3 -FunctionResourceGroup leitnermcp3 `
        -StorageAccountName leitnermcp3 -FoundryAccountName <account> -FoundryResourceGroup <rg>
#>
param(
    [Parameter(Mandatory)] [string]$FunctionAppName,
    [Parameter(Mandatory)] [string]$FunctionResourceGroup,
    [Parameter(Mandatory)] [string]$StorageAccountName,
    [string]$FoundryAccountName,
    [string]$FoundryResourceGroup,
    [switch]$Apply
)

$ErrorActionPreference = "Stop"

$steps = @(
    @{
        Title  = "Function App: HTTPS only"
        Impact = "HTTP requests are redirected to HTTPS. No impact on Foundry (it already calls https://)."
        Cmd    = "az functionapp update -g $FunctionResourceGroup -n $FunctionAppName --set httpsOnly=true"
    }
    @{
        Title  = "Function App: system-assigned managed identity"
        Impact = "Enables identity-based access to storage (next steps). No functional change by itself."
        Cmd    = "az functionapp identity assign -g $FunctionResourceGroup -n $FunctionAppName"
    }
    @{
        Title  = "Storage: minimum TLS 1.2"
        Impact = "Clients using TLS 1.0/1.1 are rejected. The Functions runtime uses TLS 1.2."
        Cmd    = "az storage account update -g $FunctionResourceGroup -n $StorageAccountName --min-tls-version TLS1_2"
    }
    @{
        Title  = "Storage: no public blob access"
        Impact = "Anonymous container access is blocked (already false; enforced)."
        Cmd    = "az storage account update -g $FunctionResourceGroup -n $StorageAccountName --allow-blob-public-access false"
    }
)

if ($FoundryAccountName -and $FoundryResourceGroup) {
    $steps += @{
        Title  = "Foundry: disable key (local) authentication"
        Impact = "BREAKING for any client that uses API keys (including MCP/tool connections configured with keys " +
                 "and other apps sharing the account). LeitnerIA uses Entra ID only. Verify every consumer first."
        Cmd    = "az resource update -g $FoundryResourceGroup -n $FoundryAccountName --resource-type Microsoft.CognitiveServices/accounts --set properties.disableLocalAuth=true"
    }
}

Write-Host ($(if ($Apply) { "APPLY MODE" } else { "DRY RUN (use -Apply to execute)" })) -ForegroundColor Cyan
foreach ($step in $steps) {
    Write-Host ""
    Write-Host "== $($step.Title)" -ForegroundColor Yellow
    Write-Host "   Impact: $($step.Impact)" -ForegroundColor Gray
    Write-Host "   $($step.Cmd)"
    if ($Apply) {
        Invoke-Expression $step.Cmd | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "Failed: $($step.Title)" }
        Write-Host "   [OK]" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "Manual follow-ups (not automated, they need design decisions):" -ForegroundColor Cyan
Write-Host "  - Storage shared-key access: switch the Functions runtime to identity-based connections" -ForegroundColor Gray
Write-Host "    (AzureWebJobsStorage__accountName + Storage Blob/Queue/Table Data roles), then" -ForegroundColor Gray
Write-Host "    'az storage account update --allow-shared-key-access false'." -ForegroundColor Gray
Write-Host "  - MCP endpoint authentication: keep the system key in the Foundry project connection (rotate it)" -ForegroundColor Gray
Write-Host "    or protect the Function with Entra ID (App Service Authentication) and use a managed-identity connection." -ForegroundColor Gray
Write-Host "  - Agent tool policy: review require_approval='never' for MCP tools that write data (SharePoint/Word)." -ForegroundColor Gray
Write-Host "  - Network: private endpoints / VNet integration (Function Flex Consumption and Foundry support them; extra cost)." -ForegroundColor Gray
