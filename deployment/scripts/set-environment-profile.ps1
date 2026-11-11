#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Applies a sizing/hardening profile (dev or prod) to the current azd environment.

.DESCRIPTION
    Sets the azd environment variables consumed by infra/main.parameters.json. Nothing is deployed:
    review the values and run `azd provision` afterwards. Values can be overridden individually with
    `azd env set <NAME> <value>`.

    Cost impact (approximate, check the Azure Pricing Calculator for your region):
      dev  : scale-to-zero container (near zero when idle), Log Analytics capped at 1 GB/day.
      prod : 1 always-on replica of 0.5 vCPU / 1 GiB (~US$ 35-45/month in Consumption), 90-day retention,
             no localhost redirect URIs, Entra-authenticated backend telemetry.

.PARAMETER Profile
    dev | prod

.PARAMETER AllowedIpRanges
    Optional CIDR list for the ingress allow-list (e.g. corporate egress IPs). Empty = any IP.

.EXAMPLE
    ./deployment/scripts/set-environment-profile.ps1 -Profile prod -AllowedIpRanges "203.0.113.0/24"
#>
param(
    [Parameter(Mandatory)]
    [ValidateSet("dev", "prod")]
    [string]$Profile,

    [string[]]$AllowedIpRanges = @()
)

$ErrorActionPreference = "Stop"

$profiles = @{
    dev = [ordered]@{
        CONTAINER_CPU                    = "0.5"
        CONTAINER_MEMORY                 = "1Gi"
        CONTAINER_MIN_REPLICAS           = "0"
        CONTAINER_MAX_REPLICAS           = "2"
        LOG_RETENTION_DAYS               = "30"
        LOG_DAILY_QUOTA_GB               = "1"
        CONTAINER_REGISTRY_SKU           = "Basic"
        ENABLE_ENTRA_TELEMETRY_AUTH      = "false"
        ENTRA_REQUIRE_USER_ASSIGNMENT    = "true"
        ENTRA_ALLOW_LOCALHOST_REDIRECTS  = "true"
    }
    prod = [ordered]@{
        CONTAINER_CPU                    = "0.5"
        CONTAINER_MEMORY                 = "1Gi"
        CONTAINER_MIN_REPLICAS           = "1"
        CONTAINER_MAX_REPLICAS           = "5"
        LOG_RETENTION_DAYS               = "90"
        LOG_DAILY_QUOTA_GB               = "-1"
        CONTAINER_REGISTRY_SKU           = "Basic"
        ENABLE_ENTRA_TELEMETRY_AUTH      = "true"
        ENTRA_REQUIRE_USER_ASSIGNMENT    = "true"
        ENTRA_ALLOW_LOCALHOST_REDIRECTS  = "false"
    }
}

$envName = azd env get-value AZURE_ENV_NAME 2>$null
if (-not $envName) {
    Write-Host "[ERROR] No azd environment selected. Run 'azd env select <name>' first." -ForegroundColor Red
    exit 1
}

Write-Host "Applying profile '$Profile' to azd environment '$envName'" -ForegroundColor Cyan
foreach ($entry in $profiles[$Profile].GetEnumerator()) {
    azd env set $entry.Key $entry.Value | Out-Null
    Write-Host ("  {0,-34} = {1}" -f $entry.Key, $entry.Value)
}

$ipJson = ConvertTo-Json -InputObject @($AllowedIpRanges) -Compress
azd env set INGRESS_ALLOWED_IP_RANGES $ipJson | Out-Null
Write-Host ("  {0,-34} = {1}" -f "INGRESS_ALLOWED_IP_RANGES", $ipJson)

if ($Profile -eq "prod" -and $AllowedIpRanges.Count -eq 0) {
    Write-Host "[INFO] Ingress is reachable from any IP (sign-in still required). Consider -AllowedIpRanges." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Next: review with 'azd env get-values', then 'azd provision --preview' and 'azd provision'." -ForegroundColor Green
Write-Host "Changes to RBAC, networking or Entra settings require senior review before production." -ForegroundColor Yellow
