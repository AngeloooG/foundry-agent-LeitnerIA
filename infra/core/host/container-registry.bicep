param name string
param location string
param tags object
param acrPullPrincipalId string = ''

@description('Basic (~US$5/month) is enough for one image. Private endpoints and disabling public access require Premium (much higher cost).')
@allowed(['Basic', 'Standard', 'Premium'])
param skuName string = 'Basic'

resource containerRegistry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: name
  location: location
  tags: tags
  sku: {
    name: skuName
  }
  properties: {
    // Admin user stays disabled: pulls use the managed identity (AcrPull), pushes use Entra ID (az acr login).
    adminUserEnabled: false
    // Public endpoint required on Basic/Standard (azd/ACR Tasks push from outside a VNet). See infra/README.md.
    publicNetworkAccess: 'Enabled'
  }
}

// AcrPull role assignment — user-assigned MI can pull images (replaces admin credentials)
var acrPullRoleId = '7f951dda-4ed3-4680-a7ca-43fe172d538d'

resource acrPullRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(acrPullPrincipalId)) {
  name: guid(containerRegistry.id, acrPullPrincipalId, acrPullRoleId)
  scope: containerRegistry
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', acrPullRoleId)
    principalId: acrPullPrincipalId
    principalType: 'ServicePrincipal'
  }
}

output name string = containerRegistry.name
output loginServer string = containerRegistry.properties.loginServer
output id string = containerRegistry.id
