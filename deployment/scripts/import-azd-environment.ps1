#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Recreates a local azd environment from what is already deployed in Azure (read-only), so that
    `azd provision --preview` shows only the real changes instead of new resources.

.DESCRIPTION
    Use it on a machine that does not have the azd environment folder (.azure/<env>) of an existing deployment.
    The script only READS Azure (resource group, Container App, Log Analytics, ACR, Foundry account) and only
    WRITES the local azd environment (`azd env new` / `azd env set`). It does not provision or deploy anything,
    does not touch Entra ID or RBAC, and never reads keys, secrets or connection strings.

    The resource names depend on uniqueString(subscription, environment name, location): the environment name,
    subscription and location must be exactly the ones of the deployment, or azd would create new resources.
    The script refuses to continue if the resource group does not contain exactly one Container App.

.PARAMETER EnvironmentName
    azd environment name of the existing deployment (e.g. env-LeitnerIA).

.PARAMETER SubscriptionId
    Subscription of the existing deployment.

.PARAMETER ResourceGroup
    Resource group of the existing deployment. Default: rg-<EnvironmentName>.

.PARAMETER SingleAppRegistration
    Sets ENTRA_SINGLE_APP_REGISTRATION=true (development: the SPA registration is also the API audience, no new
    Entra consent). See docs/decisiones-arquitectura.md, section 6.

.PARAMETER AllowLocalhostRedirects
    Sets ENTRA_ALLOW_LOCALHOST_REDIRECTS=true (development only).

.PARAMETER DryRun
    Only reads Azure and prints the values; the local azd environment is not created or modified.

.EXAMPLE
    ./deployment/scripts/import-azd-environment.ps1 -EnvironmentName env-LeitnerIA `
        -SubscriptionId b6d04525-e7b4-4b17-8492-2471f9779962 -SingleAppRegistration -AllowLocalhostRedirects
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)] [string] $EnvironmentName,
    [Parameter(Mandatory)] [Guid] $SubscriptionId,
    [string] $ResourceGroup = "",
    [switch] $SingleAppRegistration,
    [switch] $AllowLocalhostRedirects,
    [switch] $DryRun
)

$ErrorActionPreference = "Stop"
if ([string]::IsNullOrWhiteSpace($ResourceGroup)) { $ResourceGroup = "rg-$EnvironmentName" }
$sub = $SubscriptionId.ToString()

function Invoke-AzJson([string[]] $Arguments) {
    $output = & az @Arguments --subscription $sub -o json 2>$null
    if ($LASTEXITCODE -ne 0) { throw "az $($Arguments[0..2] -join ' ') failed (exit $LASTEXITCODE). Check 'az login' and Reader access on $ResourceGroup." }
    return $output | ConvertFrom-Json
}

function Set-AzdValue([string] $Name, [string] $Value) {
    if (-not $DryRun) {
        azd env set $Name $Value --environment $EnvironmentName | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "azd env set $Name failed" }
    }
    Write-Host ("  {0,-34} {1}" -f $Name, $Value)
}

Write-Host "Import azd environment '$EnvironmentName' from $ResourceGroup (read-only in Azure)" -ForegroundColor Cyan

foreach ($tool in $(if ($DryRun) { @("az") } else { @("az", "azd") })) {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "$tool is not installed" }
}

# ---------------------------------------------------------------------------------------------------------------
# 1. Read the deployed state (selected, non-secret properties only)
# ---------------------------------------------------------------------------------------------------------------
$rg = Invoke-AzJson @("group", "show", "--name", $ResourceGroup, "--query", "{location:location,tags:tags}")

$apps = @(Invoke-AzJson @("containerapp", "list", "--resource-group", $ResourceGroup, "--query",
    "[].{name:name,image:properties.template.containers[0].image,cpu:properties.template.containers[0].resources.cpu,memory:properties.template.containers[0].resources.memory,min:properties.template.scale.minReplicas,max:properties.template.scale.maxReplicas,ipRules:properties.configuration.ingress.ipSecurityRestrictions,env:properties.template.containers[0].env[].{name:name,value:value}}"))
if ($apps.Count -ne 1) { throw "Expected exactly one Container App in $ResourceGroup, found $($apps.Count)." }
$app = $apps[0]
# Only these plain (non-secret) variables are kept; the filter is done here and not in --query because a JMESPath
# '||' would be interpreted by cmd.exe through az.cmd. Secret-backed variables carry no value in this listing.
$wanted = @('AI_AGENT_ENDPOINT', 'AI_AGENT_ID', 'AI_AGENT_VERSION', 'ENTRA_TENANT_ID', 'ENTRA_ALLOWED_GROUP_ID', 'Telemetry__UseEntraAuthentication')
$envVars = @{}
foreach ($item in @($app.env)) { if ($item.name -in $wanted) { $envVars[$item.name] = $item.value } }

$workspace = @(Invoke-AzJson @("monitor", "log-analytics", "workspace", "list", "--resource-group", $ResourceGroup,
    "--query", "[].{retention:retentionInDays,quota:workspaceCapping.dailyQuotaGb}")) | Select-Object -First 1
$registry = @(Invoke-AzJson @("acr", "list", "--resource-group", $ResourceGroup, "--query", "[].{sku:sku.name}")) | Select-Object -First 1

# Foundry account and project from the project endpoint: https://<account>.services.ai.azure.com/api/projects/<project>
$endpoint = $envVars['AI_AGENT_ENDPOINT']
if ($endpoint -notmatch '^https://(?<account>[^./]+)\.services\.ai\.azure\.com/api/projects/(?<project>[^/]+)/?$') {
    throw "AI_AGENT_ENDPOINT of the Container App is missing or has an unexpected format."
}
$foundryAccount = $Matches['account']
$foundryProject = $Matches['project']
$foundry = @(Invoke-AzJson @("cognitiveservices", "account", "list", "--query",
    "[?name=='$foundryAccount'].{resourceGroup:resourceGroup,location:location}")) | Select-Object -First 1
if (-not $foundry) { throw "Foundry account '$foundryAccount' not found in the subscription." }

if ($app.ipRules) {
    Write-Host "[!] The ingress has IP restrictions; set INGRESS_ALLOWED_IP_RANGES manually before the preview." -ForegroundColor Yellow
}

# ---------------------------------------------------------------------------------------------------------------
# 2. Create or select the local azd environment
# ---------------------------------------------------------------------------------------------------------------
if ($DryRun) {
    Write-Host "[DryRun] The local azd environment is not created or modified." -ForegroundColor Yellow
} elseif (@(azd env list --output json 2>$null | ConvertFrom-Json) | Where-Object { $_.Name -eq $EnvironmentName }) {
    Write-Host "[i] azd environment '$EnvironmentName' already exists locally: the values below overwrite it." -ForegroundColor Yellow
    azd env select $EnvironmentName | Out-Null
} else {
    azd env new $EnvironmentName --subscription $sub --location $rg.location --no-prompt | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "azd env new failed" }
    Write-Host "[OK] azd environment '$EnvironmentName' created" -ForegroundColor Green
}

# ---------------------------------------------------------------------------------------------------------------
# 3. Write the values (identifiers and sizing only; nothing secret)
# ---------------------------------------------------------------------------------------------------------------
Write-Host "Values:" -ForegroundColor Cyan
Set-AzdValue AZURE_SUBSCRIPTION_ID $sub
Set-AzdValue AZURE_LOCATION $rg.location
Set-AzdValue ENTRA_TENANT_ID $envVars['ENTRA_TENANT_ID']
Set-AzdValue SERVICE_WEB_IMAGE_NAME $app.image
Set-AzdValue AI_AGENT_ENDPOINT $endpoint
Set-AzdValue AI_AGENT_ID $envVars['AI_AGENT_ID']
Set-AzdValue AI_AGENT_VERSION ([string]$envVars['AI_AGENT_VERSION'])
Set-AzdValue AI_FOUNDRY_RESOURCE_NAME $foundryAccount
Set-AzdValue AI_FOUNDRY_PROJECT_NAME $foundryProject
Set-AzdValue AI_FOUNDRY_RESOURCE_GROUP $foundry.resourceGroup
Set-AzdValue AI_FOUNDRY_LOCATION $foundry.location
Set-AzdValue ENTRA_ALLOWED_GROUP_ID ([string]$envVars['ENTRA_ALLOWED_GROUP_ID'])
Set-AzdValue ENABLE_ENTRA_TELEMETRY_AUTH ($(if ($envVars['Telemetry__UseEntraAuthentication'] -eq 'True') { 'true' } else { 'false' }))
Set-AzdValue ENABLE_OBO false
Set-AzdValue ENTRA_SINGLE_APP_REGISTRATION ($SingleAppRegistration.IsPresent.ToString().ToLowerInvariant())
Set-AzdValue ENTRA_ALLOW_LOCALHOST_REDIRECTS ($AllowLocalhostRedirects.IsPresent.ToString().ToLowerInvariant())
Set-AzdValue ENTRA_GRANT_SPA_ADMIN_CONSENT false
Set-AzdValue CONTAINER_CPU ([string]$app.cpu)
Set-AzdValue CONTAINER_MEMORY $app.memory
Set-AzdValue CONTAINER_MIN_REPLICAS ([string]$app.min)
Set-AzdValue CONTAINER_MAX_REPLICAS ([string]$app.max)
if ($workspace) {
    Set-AzdValue LOG_RETENTION_DAYS ([string]$workspace.retention)
    Set-AzdValue LOG_DAILY_QUOTA_GB ([string][int]$workspace.quota)
}
if ($registry) { Set-AzdValue CONTAINER_REGISTRY_SKU $registry.sku }
foreach ($pair in @(@('TAG_AGENTE', 'Agente'), @('TAG_ENTORNO', 'Entorno'), @('TAG_PLATAFORMA', 'Plataforma'))) {
    $tagValue = $rg.tags.($pair[1])
    if ($tagValue) { Set-AzdValue $pair[0] $tagValue }
}

Write-Host ""
Write-Host "[OK] Done. Nothing was changed in Azure." -ForegroundColor Green
if ($DryRun) { return }
Write-Host "Next: azd provision --preview   (expected: 0 Create / 0 Delete; Entra changes are not shown by the preview)" -ForegroundColor Cyan
