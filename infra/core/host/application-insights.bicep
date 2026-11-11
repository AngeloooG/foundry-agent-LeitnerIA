@description('Application Insights resource name')
param name string

@description('Azure region')
param location string = resourceGroup().location

@description('Resource tags')
param tags object = {}

@description('Log Analytics workspace resource ID for data ingestion')
param logAnalyticsWorkspaceId string

@description('Require Entra ID authenticated ingestion (rejects telemetry sent with only the instrumentation key). Do not enable for browser telemetry.')
param disableLocalAuth bool = false

@description('Principal that publishes telemetry with Entra ID (granted Monitoring Metrics Publisher). Empty = none.')
param metricsPublisherPrincipalId string = ''

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: name
  location: location
  tags: tags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalyticsWorkspaceId
    DisableLocalAuth: disableLocalAuth
  }
}

// Monitoring Metrics Publisher — least privilege for Entra ID authenticated telemetry ingestion
var monitoringMetricsPublisherRoleId = '3913510d-42f4-4e42-8a64-420c390055eb'

resource publisherRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(metricsPublisherPrincipalId)) {
  name: guid(appInsights.id, metricsPublisherPrincipalId, monitoringMetricsPublisherRoleId)
  scope: appInsights
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', monitoringMetricsPublisherRoleId)
    principalId: metricsPublisherPrincipalId
    principalType: 'ServicePrincipal'
  }
}

output connectionString string = appInsights.properties.ConnectionString
output id string = appInsights.id
output name string = appInsights.name
