#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Deploy code updates to Azure Container Apps

.DESCRIPTION
    Builds the container image and rolls it out to the existing Container App, without provisioning.

    This repo uses azd's infra-only pattern (azure.yaml has no `services:`), so the build is done by the
    predeploy hook (deployment/hooks/predeploy.ps1):
    1. Builds deployment/docker/web.Dockerfile (local Docker, or ACR remote build as fallback)
    2. Passes the public build args (ENTRA_SPA_CLIENT_ID, ENTRA_TENANT_ID, ...) from the azd environment
    3. Pushes to Azure Container Registry with Entra ID (no admin credentials)
    4. Updates the Container App image

    For infrastructure changes use: azd provision (or azd up)

.EXAMPLE
    .\deployment\scripts\deploy.ps1
    
.EXAMPLE
    # Or run the hook directly:
    azd hooks run predeploy
#>

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Deploy to Azure Container Apps" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Verify azd environment exists
$envName = azd env get-value AZURE_ENV_NAME 2>&1
if ($LASTEXITCODE -ne 0 -or -not $envName) {
    Write-Error "No azd environment found. Have you run 'azd up' yet?"
    exit 1
}

Write-Host "Environment: $envName" -ForegroundColor Green
Write-Host ""

# Run the build + rollout hook
Write-Host "Running predeploy hook (build + push + rollout)..." -ForegroundColor Cyan
Write-Host "(Uses local Docker if available; otherwise ACR cloud build)" -ForegroundColor Gray
Write-Host ""

azd hooks run predeploy

if ($LASTEXITCODE -ne 0) {
    Write-Error "Deployment failed"
    exit 1
}

# Get the deployed URL
$containerAppUrl = azd env get-value WEB_ENDPOINT 2>&1
if ($containerAppUrl -and $LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "Deployment Complete!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Application URL: $containerAppUrl" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Commands:" -ForegroundColor Yellow
    Write-Host "  • Deploy again: azd deploy" -ForegroundColor Gray
    Write-Host "  • Full redeploy: azd up" -ForegroundColor Gray
    Write-Host "  • View logs: az containerapp logs show -g `$(azd env get-value AZURE_RESOURCE_GROUP_NAME) -n `$(azd env get-value AZURE_CONTAINER_APP_NAME) --follow" -ForegroundColor Gray
    Write-Host ""
}
