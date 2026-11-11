targetScope = 'subscription'

// Force re-deployment after resource group deletion
@minLength(1)
@maxLength(64)
@description('Name of the environment (e.g., dev, prod)')
param environmentName string

@minLength(1)
@description('Primary location for all resources')
param location string

@description('AI Agent endpoint (auto-discovered by preprovision hook)')
param aiAgentEndpoint string = ''

@description('AI Agent ID (configured via azd env set AI_AGENT_ID)')
param aiAgentId string = ''

@description('Entra ID Tenant ID (set by azd hook or auto-detected)')
param entraTenantId string = tenant().tenantId

@description('Service Management Reference GUID (required by some orgs for Entra app registration)')
param serviceManagementReference string = ''

@description('Enable OBO (On-Behalf-Of) flow for user-delegated access to Agent Service (secretless via FIC)')
param enableObo bool = false

@description('Container image for web service (set by postprovision hook)')
param webImageName string = 'mcr.microsoft.com/k8se/quickstart:latest'  // Placeholder during initial provision

@description('Pinned Foundry agent version (empty = newest published version)')
param aiAgentVersion string = ''

@description('Default tags applied by Azure Policy (optional)')
param defaultTags object = {}

// ---------------------------------------------------------------------------
// Per-environment sizing and hardening (set with `azd env set`, see
// deployment/scripts/set-environment-profile.ps1). Defaults = current dev values.
// ---------------------------------------------------------------------------

@description('vCPU per replica. Cost scales with vCPU-seconds; 0.5 vCPU / 1 GiB is enough for SSE proxying.')
@allowed(['0.25', '0.5', '0.75', '1', '1.5', '2'])
param containerCpu string = '0.5'

@description('Memory per replica (must match the CPU pairing: 0.5 → 1Gi, 1 → 2Gi, ...)')
param containerMemory string = '1Gi'

@description('Minimum replicas. 0 = scale to zero (near-zero idle cost, ~10-20 s cold start). Production: 1.')
@minValue(0)
param minReplicas int = 0

@description('Maximum replicas')
@minValue(1)
@maxValue(10)
param maxReplicas int = 3

@description('Optional ingress IP allow-list (CIDR). Empty = any IP (Entra ID sign-in still required).')
param allowedIpRanges array = []

@description('Log Analytics retention (days)')
param logRetentionDays int = 30

@description('Log Analytics daily cap in GB (-1 = none). Recommended: 1 in dev to bound cost.')
param logDailyQuotaGb int = -1

@description('Container Registry SKU (Basic is enough; Premium only for private endpoints)')
@allowed(['Basic', 'Standard', 'Premium'])
param containerRegistrySku string = 'Basic'

@description('Backend telemetry authenticated with Entra ID (disables key-based ingestion on the backend App Insights)')
param enableEntraTelemetryAuth bool = false

@description('Require users to be assigned to the Entra enterprise app (true = only assigned users/groups can sign in)')
param requireUserAssignment bool = true

var abbrs = loadJsonContent('./abbreviations.json')
var resourceToken = toLower(uniqueString(subscription().id, environmentName, location))
var appTags = {
  'azd-env-name': environmentName
  'app-name': 'leitneria'
}

var tags = union(defaultTags, appTags)

resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: '${abbrs.resourcesResourceGroups}${environmentName}'
  location: location
  tags: tags
}

// Deploy infrastructure (ACR + Container Apps Environment)
module infrastructure 'main-infrastructure.bicep' = {
  name: 'infrastructure'
  scope: rg
  params: {
    location: location
    tags: tags
    resourceToken: resourceToken
    logRetentionDays: logRetentionDays
    logDailyQuotaGb: logDailyQuotaGb
    containerRegistrySku: containerRegistrySku
    enableEntraTelemetryAuth: enableEntraTelemetryAuth
  }
}

// Create Entra app registration (Microsoft Graph Bicep extension)
// Creates with localhost-only redirect URIs; postprovision adds Container App FQDN + FIC
module entraApp 'entra-app.bicep' = {
  name: 'entra-app'
  scope: rg
  params: {
    environmentName: environmentName
    serviceManagementReference: serviceManagementReference
    enableObo: enableObo
    requireUserAssignment: requireUserAssignment
  }
}

// Deploy application (Container Apps + RBAC)
module app 'main-app.bicep' = {
  name: 'app'
  scope: rg
  params: {
    location: location
    tags: tags
    resourceToken: resourceToken
    containerAppsEnvironmentId: infrastructure.outputs.containerAppsEnvironmentId
    containerRegistryName: infrastructure.outputs.containerRegistryName
    aiAgentEndpoint: aiAgentEndpoint
    aiAgentId: aiAgentId
    aiAgentVersion: aiAgentVersion
    entraSpaClientId: entraApp.outputs.clientAppId
    entraTenantId: entraTenantId
    entraBackendClientId: enableObo ? entraApp.outputs.backendClientAppId : ''
    webImageName: webImageName
    userAssignedIdentityId: infrastructure.outputs.managedIdentityId
    managedIdentityClientId: infrastructure.outputs.managedIdentityClientId
    appInsightsConnectionString: infrastructure.outputs.appInsightsConnectionString
    appInsightsFrontendConnectionString: infrastructure.outputs.appInsightsFrontendConnectionString
    enableEntraTelemetryAuth: enableEntraTelemetryAuth
    containerCpu: containerCpu
    containerMemory: containerMemory
    minReplicas: minReplicas
    maxReplicas: maxReplicas
    allowedIpRanges: allowedIpRanges
  }
}

// Note: Role assignment to AI Foundry resource is done via Azure CLI in postprovision.ps1
// This avoids azd tracking the external resource group and deleting it on 'azd down'

output AZURE_CONTAINER_REGISTRY_ENDPOINT string = infrastructure.outputs.containerRegistryLoginServer
output AZURE_CONTAINER_REGISTRY_NAME string = infrastructure.outputs.containerRegistryName
output AZURE_CONTAINER_APPS_ENVIRONMENT_ID string = infrastructure.outputs.containerAppsEnvironmentId
output AZURE_RESOURCE_GROUP_NAME string = rg.name
output AZURE_CONTAINER_APP_NAME string = app.outputs.webAppName
output WEB_ENDPOINT string = app.outputs.webEndpoint
output WEB_IDENTITY_PRINCIPAL_ID string = infrastructure.outputs.managedIdentityPrincipalId
output ENTRA_SPA_CLIENT_ID string = entraApp.outputs.clientAppId
output ENTRA_APP_OBJECT_ID string = entraApp.outputs.appObjectId
output ENTRA_BACKEND_CLIENT_ID string = enableObo ? entraApp.outputs.backendClientAppId : ''
output ENTRA_BACKEND_APP_OBJECT_ID string = enableObo ? entraApp.outputs.backendAppObjectId : ''
output APPLICATIONINSIGHTS_CONNECTION_STRING string = infrastructure.outputs.appInsightsConnectionString
output APPLICATIONINSIGHTS_FRONTEND_CONNECTION_STRING string = infrastructure.outputs.appInsightsFrontendConnectionString
