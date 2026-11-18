#!/usr/bin/env pwsh
# Pre-deploy: Build container (local Docker if available, ACR cloud build as fallback)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot/modules/HookLogging.ps1"
Start-HookLog -HookName "predeploy" -EnvironmentName $env:AZURE_ENV_NAME

Write-Host "Pre-Deploy: Building Container Image" -ForegroundColor Cyan

# Get required values — azd injects env vars into hooks, but `azd env get-value` may fail
# if the subprocess can't locate azure.yaml. Fall back to $env: vars.
function Get-AzdValue($name) {
    $val = (azd env get-value $name 2>&1) | Where-Object { $_ -notmatch 'ERROR|WARNING' } | Select-Object -First 1
    if ([string]::IsNullOrWhiteSpace($val)) { $val = [Environment]::GetEnvironmentVariable($name) }
    return $val
}

$clientId = Get-AzdValue 'ENTRA_FRONTEND_CLIENT_ID'
$tenantId = Get-AzdValue 'ENTRA_TENANT_ID'
$backendClientId = Get-AzdValue 'ENTRA_BACKEND_CLIENT_ID'
$appInsightsConnStr = Get-AzdValue 'APPLICATIONINSIGHTS_FRONTEND_CONNECTION_STRING'
# Escape semicolons for ACR cloud builds — unescaped semicolons are interpreted as shell command separators
if ($appInsightsConnStr) { $appInsightsConnStrEscaped = $appInsightsConnStr -replace ';', '\;' } else { $appInsightsConnStrEscaped = '' }
$acrName = Get-AzdValue 'AZURE_CONTAINER_REGISTRY_NAME'
$resourceGroup = Get-AzdValue 'AZURE_RESOURCE_GROUP_NAME'
$containerApp = Get-AzdValue 'AZURE_CONTAINER_APP_NAME'

if (-not $clientId -or -not $backendClientId -or -not $tenantId) {
    Write-Host "[ERROR] ENTRA_FRONTEND_CLIENT_ID, ENTRA_BACKEND_CLIENT_ID and ENTRA_TENANT_ID are required (run azd provision)" -ForegroundColor Red
    exit 1
}
if ($clientId -eq $backendClientId) {
    Write-Host "[ERROR] ENTRA_BACKEND_CLIENT_ID must differ from ENTRA_FRONTEND_CLIENT_ID" -ForegroundColor Red
    exit 1
}
if (-not $acrName) {
    Write-Host "[ERROR] AZURE_CONTAINER_REGISTRY_NAME not set" -ForegroundColor Red
    exit 1
}

$imageTag = "deploy-$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())"
$imageName = "$acrName.azurecr.io/web:$imageTag"

# Check Docker availability
$dockerAvailable = $false
if (Get-Command docker -EA SilentlyContinue) {
    $dockerVersion = docker version --format '{{.Server.Version}}' 2>$null
    if ($LASTEXITCODE -eq 0 -and $dockerVersion) {
        $dockerAvailable = $true
        Write-Host "[OK] Docker v$dockerVersion" -ForegroundColor Green
    }
}

$projectRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Push-Location $projectRoot

try {
    if ($dockerAvailable) {
        Write-Host "Building with local Docker..." -ForegroundColor Cyan
        $buildArgs = @(
            "--platform", "linux/amd64",
            "--build-arg", "ENTRA_FRONTEND_CLIENT_ID=$clientId",
            "--build-arg", "ENTRA_BACKEND_CLIENT_ID=$backendClientId",
            "--build-arg", "ENTRA_TENANT_ID=$tenantId"
        )
        if ($appInsightsConnStr) { $buildArgs += @("--build-arg", "APPLICATIONINSIGHTS_FRONTEND_CONNECTION_STRING=$appInsightsConnStr") }
        $buildArgs += @("-f", "deployment/docker/web.Dockerfile", "-t", $imageName, ".")
        docker build @buildArgs 2>&1 | Out-Host
        if ($LASTEXITCODE -ne 0) { throw "Docker build failed" }
        
        Write-Host "Pushing to ACR..." -ForegroundColor Cyan
        az acr login --name $acrName | Out-Null
        docker push $imageName 2>&1 | Out-Host
        if ($LASTEXITCODE -ne 0) { throw "Docker push failed" }
    } else {
        Write-Host "Using ACR cloud build (3-5 min)..." -ForegroundColor Yellow
        $acrBuildArgs = @("--build-arg", "ENTRA_FRONTEND_CLIENT_ID=$clientId", "--build-arg", "ENTRA_BACKEND_CLIENT_ID=$backendClientId", "--build-arg", "ENTRA_TENANT_ID=$tenantId")
        if ($appInsightsConnStrEscaped) { $acrBuildArgs += @("--build-arg", "APPLICATIONINSIGHTS_FRONTEND_CONNECTION_STRING=$appInsightsConnStrEscaped") }
        $buildOutput = az acr build --registry $acrName --image "web:$imageTag" `
            @acrBuildArgs `
            --file deployment/docker/web.Dockerfile . `
            --no-logs --only-show-errors 2>&1

        if ($LASTEXITCODE -ne 0) {
            Write-Host "Build output: $buildOutput" -ForegroundColor Red
            throw "ACR build failed"
        }
        Write-Host "[OK] ACR build completed" -ForegroundColor Green
    }
    Write-Host "[OK] Image built: $imageName" -ForegroundColor Green
    
    # Update Container App (skip if doesn't exist yet - first azd up uses placeholder)
    if ($containerApp -and $resourceGroup) {
        $exists = az containerapp show --name $containerApp --resource-group $resourceGroup --query name -o tsv 2>$null
        if ($exists) {
            # The image bakes ENTRA_BACKEND_CLIENT_ID into the SPA. Refuse to roll it out to a Container App configured
            # for another backend registration (run azd provision first). The API repeats this check at startup.
            $appBackendClientId = az containerapp show --name $containerApp --resource-group $resourceGroup `
                --query "properties.template.containers[0].env[?name=='ENTRA_BACKEND_CLIENT_ID'].value | [0]" -o tsv 2>$null
            if ($appBackendClientId -ne $backendClientId) {
                Write-Host "[ERROR] The Container App expects ENTRA_BACKEND_CLIENT_ID '$appBackendClientId' but the image was built for '$backendClientId'. Run 'azd provision' before deploying." -ForegroundColor Red
                throw "Backend client id mismatch"
            }
            Write-Host "Updating Container App..." -ForegroundColor Cyan
            az containerapp update --name $containerApp --resource-group $resourceGroup `
                --image $imageName --output none
            if ($LASTEXITCODE -ne 0) { throw "Container App update failed" }
            Write-Host "[OK] Container App updated" -ForegroundColor Green
        } else {
            Write-Host "[SKIP] Container App not yet provisioned (first run)" -ForegroundColor Yellow
        }
    }
    
    azd env set SERVICE_WEB_IMAGE_NAME $imageName 2>$null
} finally {
    Pop-Location
}

if ($script:HookLogFile) {
    Write-Host "[LOG] Log file: $script:HookLogFile" -ForegroundColor DarkGray
}
Stop-HookLog
