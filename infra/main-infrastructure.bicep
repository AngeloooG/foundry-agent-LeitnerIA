param location string
param tags object
param resourceToken string

@description('Log Analytics retention in days')
param logRetentionDays int = 30

@description('Log Analytics daily ingestion cap in GB (-1 = no cap)')
param logDailyQuotaGb int = -1

@description('Container Registry SKU')
param containerRegistrySku string = 'Basic'

@description('Backend telemetry with Entra ID (managed identity) instead of the instrumentation key')
param enableEntraTelemetryAuth bool = false

var abbrs = loadJsonContent('./abbreviations.json')

// Log Analytics Workspace
module logAnalytics './core/host/log-analytics.bicep' = {
  name: 'log-analytics'
  params: {
    name: '${abbrs.operationalInsightsWorkspaces}${resourceToken}'
    location: location
    tags: tags
    retentionInDays: logRetentionDays
    dailyQuotaGb: logDailyQuotaGb
  }
}

// Application Insights (backend)
module appInsights './core/host/application-insights.bicep' = {
  name: 'appInsights'
  params: {
    name: '${abbrs.insightsComponents}${resourceToken}'
    location: location
    tags: tags
    logAnalyticsWorkspaceId: logAnalytics.outputs.id
    disableLocalAuth: enableEntraTelemetryAuth
    metricsPublisherPrincipalId: enableEntraTelemetryAuth ? managedIdentity.properties.principalId : ''
  }
}

// Application Insights (frontend) — separate resource so browser telemetry doesn't pollute server metrics.
// Browser SDKs can only use the instrumentation key, so local auth stays enabled here.
module appInsightsFrontend './core/host/application-insights.bicep' = {
  name: 'appInsightsFrontend'
  params: {
    name: '${abbrs.insightsComponents}fe-${resourceToken}'
    location: location
    tags: tags
    logAnalyticsWorkspaceId: logAnalytics.outputs.id
  }
}

// Container Registry
module containerRegistry './core/host/container-registry.bicep' = {
  name: 'container-registry'
  params: {
    name: '${abbrs.containerRegistryRegistries}${resourceToken}'
    location: location
    tags: tags
    skuName: containerRegistrySku
    acrPullPrincipalId: managedIdentity.properties.principalId
  }
}

// Container Apps Environment
module containerAppsEnvironment './core/host/container-apps-environment.bicep' = {
  name: 'container-apps-environment'
  params: {
    name: '${abbrs.appManagedEnvironments}${resourceToken}'
    location: location
    tags: tags
    logAnalyticsWorkspaceId: logAnalytics.outputs.id
  }
}

// User-assigned managed identity — created independently so its principalId
// is available for both Entra FIC and Container App/ACR assignment without circular dependency.
// isolationScope: Regional ensures the identity can only be used in the deployment region.
resource managedIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2024-11-30' = {
  name: '${abbrs.managedIdentityUserAssignedIdentities}web-${resourceToken}'
  location: location
  tags: tags
  properties: {
    isolationScope: 'Regional'
  }
}

output appInsightsConnectionString string = appInsights.outputs.connectionString
output appInsightsFrontendConnectionString string = appInsightsFrontend.outputs.connectionString
output containerRegistryName string = containerRegistry.outputs.name
output containerRegistryLoginServer string = containerRegistry.outputs.loginServer
output containerAppsEnvironmentId string = containerAppsEnvironment.outputs.id
output managedIdentityId string = managedIdentity.id
output managedIdentityPrincipalId string = managedIdentity.properties.principalId
output managedIdentityClientId string = managedIdentity.properties.clientId
