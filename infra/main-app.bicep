param location string
param tags object
param resourceToken string
param containerAppsEnvironmentId string
param containerRegistryName string
param aiAgentEndpoint string
param aiAgentId string
@description('Pinned agent version (empty = newest version, re-resolved every 10 minutes)')
param aiAgentVersion string = ''
@description('Frontend SPA registration (sign-in only)')
param entraFrontendClientId string
param entraTenantId string
@description('Backend API registration: the only audience accepted by the API')
param entraBackendClientId string
@description('Backend calls Foundry On-Behalf-Of the user instead of with the managed identity')
param enableObo bool = false
@description('Optional group restriction enforced by the API (empty = every user of the tenant)')
param entraAllowedGroupId string = ''
param webImageName string
param userAssignedIdentityId string = ''
param managedIdentityClientId string = ''
@secure()
param appInsightsConnectionString string = ''
@secure()
param appInsightsFrontendConnectionString string = ''
param enableEntraTelemetryAuth bool = false

// Sizing and network (see main.bicep for descriptions and cost notes)
param containerCpu string = '0.5'
param containerMemory string = '1Gi'
param minReplicas int = 0
param maxReplicas int = 3
param allowedIpRanges array = []

var abbrs = loadJsonContent('./abbreviations.json')

// Non-secret configuration (identifiers only)
var baseEnv = [
  {
    name: 'ASPNETCORE_ENVIRONMENT'
    value: 'Production'
  }
  {
    name: 'ASPNETCORE_URLS'
    value: 'http://+:8080'
  }
  {
    name: 'ENTRA_FRONTEND_CLIENT_ID'
    value: entraFrontendClientId
  }
  {
    name: 'ENTRA_BACKEND_CLIENT_ID'
    value: entraBackendClientId
  }
  {
    name: 'ENABLE_OBO'
    value: string(enableObo)
  }
  {
    name: 'ENTRA_TENANT_ID'
    value: entraTenantId
  }
  {
    name: 'AI_AGENT_ENDPOINT'
    value: aiAgentEndpoint
  }
  {
    name: 'AI_AGENT_ID'
    value: aiAgentId
  }
  {
    // User-assigned MI client id — used for Foundry RBAC, ACR pull and (OBO) the federated credential
    name: 'MANAGED_IDENTITY_CLIENT_ID'
    value: managedIdentityClientId
  }
  {
    name: 'Telemetry__UseEntraAuthentication'
    value: string(enableEntraTelemetryAuth)
  }
]

var versionEnv = !empty(aiAgentVersion) ? [
  {
    name: 'AI_AGENT_VERSION'
    value: aiAgentVersion
  }
] : []

var groupEnv = !empty(entraAllowedGroupId) ? [
  {
    name: 'ENTRA_ALLOWED_GROUP_ID'
    value: entraAllowedGroupId
  }
] : []


// Single Container App - serves both frontend (wwwroot) and backend API
module webApp './core/host/container-app.bicep' = {
  name: 'web-container-app'
  params: {
    name: '${abbrs.appContainerApps}web-${resourceToken}'
    location: location
    tags: union(tags, { 'azd-service-name': 'web' })
    containerAppsEnvironmentId: containerAppsEnvironmentId
    containerRegistryName: containerRegistryName
    containerImage: webImageName
    targetPort: 8080
    env: concat(baseEnv, versionEnv, groupEnv)
    // Connection strings are ingestion keys: stored as Container Apps secrets, not plain env vars.
    secretEnv: {
      APPLICATIONINSIGHTS_CONNECTION_STRING: appInsightsConnectionString
      APPLICATIONINSIGHTS_FRONTEND_CONNECTION_STRING: appInsightsFrontendConnectionString
    }
    enableIngress: true
    external: true
    healthProbePath: '/api/health'
    cpu: containerCpu
    memory: containerMemory
    minReplicas: minReplicas
    maxReplicas: maxReplicas
    allowedIpRanges: allowedIpRanges
    userAssignedIdentityId: userAssignedIdentityId
  }
}

output webEndpoint string = 'https://${webApp.outputs.fqdn}'
output webAppName string = webApp.outputs.name
