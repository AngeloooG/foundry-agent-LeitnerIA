param name string
param location string
param tags object
param containerAppsEnvironmentId string
param containerRegistryName string
param containerImage string
param targetPort int

@description('Plain (non-secret) environment variables: [{ name, value }]')
param env array = []

@description('Secret environment variables: { ENV_VAR_NAME: value }. Stored as Container Apps secrets and injected with secretRef, so values are not visible in the revision template.')
@secure()
param secretEnv object = {}

param enableIngress bool = true
param external bool = true
param healthProbePath string = ''

@description('vCPU per replica (cost driver). Must pair with memory: 0.25/0.5Gi, 0.5/1Gi, 1/2Gi...')
param cpu string = '0.5'
param memory string = '1Gi'

@description('0 = scale to zero (lowest cost, cold start on first request). Use 1 in production to avoid cold starts.')
@minValue(0)
param minReplicas int = 0
@minValue(1)
param maxReplicas int = 3

@description('Optional ingress allow-list (CIDR ranges, e.g. the corporate egress IPs). Empty = reachable from any IP (authentication still required).')
param allowedIpRanges array = []

@description('User-assigned managed identity resource id (ACR pull + Foundry access)')
param userAssignedIdentityId string

resource containerRegistry 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: containerRegistryName
}

var secretNames = [for item in items(secretEnv): toLower(replace(item.key, '_', '-'))]

var ipRules = [for (cidr, i) in allowedIpRanges: {
  name: 'allow-${i}'
  action: 'Allow'
  ipAddressRange: cidr
}]

var secretEnvRefs = [for (item, i) in items(secretEnv): {
  name: item.key
  secretRef: secretNames[i]
}]

resource containerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: name
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${userAssignedIdentityId}': {}
    }
  }
  properties: {
    managedEnvironmentId: containerAppsEnvironmentId
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: enableIngress ? {
        external: external
        targetPort: targetPort
        transport: 'auto'
        allowInsecure: false
        ipSecurityRestrictions: ipRules
      } : null
      registries: [
        {
          server: containerRegistry.properties.loginServer
          identity: userAssignedIdentityId
        }
      ]
      secrets: [for (item, i) in items(secretEnv): {
        name: secretNames[i]
        // Value comes from the @secure() secretEnv parameter; the linter cannot track it through items().
        #disable-next-line use-secure-value-for-secure-inputs
        value: item.value
      }]
    }
    template: {
      containers: [
        {
          name: name
          image: containerImage
          env: concat(env, secretEnvRefs)
          resources: {
            cpu: json(cpu)
            memory: memory
          }
          probes: !empty(healthProbePath) ? [
            {
              type: 'Liveness'
              httpGet: {
                path: healthProbePath
                port: targetPort
              }
              periodSeconds: 30
              failureThreshold: 3
            }
            {
              type: 'Startup'
              httpGet: {
                path: healthProbePath
                port: targetPort
              }
              periodSeconds: 10
              failureThreshold: 30
              initialDelaySeconds: 5
            }
          ] : []
        }
      ]
      scale: {
        minReplicas: minReplicas
        maxReplicas: maxReplicas
      }
    }
  }
}

output id string = containerApp.id
output name string = containerApp.name
output fqdn string = enableIngress ? containerApp.properties.configuration.ingress.fqdn : ''
