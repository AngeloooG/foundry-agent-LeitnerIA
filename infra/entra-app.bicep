extension microsoftGraphV1

@description('Name suffix for the Entra app (e.g., environment name)')
param environmentName string

@description('Service Management Reference GUID (required by some orgs)')
param serviceManagementReference string = ''

@description('Enable OBO backend API app registration for user-delegated access to Agent Service')
param enableObo bool = false

@description('Optional security group (object id). When set, the access token carries the groups claim and the API only authorizes its members. Empty = every user of the tenant.')
param allowedGroupId string = ''

// Emit the groups claim only when the optional group restriction is configured.
var groupMembershipClaims = empty(allowedGroupId) ? 'None' : 'SecurityGroup'

// ============================================================================
// Well-known first-party app IDs and scope IDs (stable across all Entra tenants)
// ============================================================================

// Azure Machine Learning Services — the resource behind https://ai.azure.com/.default
// This is what AIProjectClient.AuthorizationScopes requests (verified via SDK reflection).
// ⚠️ NOT the same as "Microsoft Cognitive Services" (7d312290-...) — a common mistake.
var azureMachineLearningAppId = '18a66f5f-dbdf-4c17-9dd7-1634712a9cbe'
var azureMachineLearningUserImpersonationScopeId = '1a7925b5-f871-417a-9b8b-303f9f29fa10'

// Deterministic scope ID — stable across redeployments
var chatReadWriteScopeId = guid(resourceGroup().id, environmentName, 'Chat.ReadWrite')

// ============================================================================
// SPA App Registration (always created)
// ============================================================================

resource app 'Microsoft.Graph/applications@v1.0' = {
  uniqueName: 'ai-foundry-agent-${environmentName}'
  displayName: 'ai-foundry-agent-${environmentName}'
  // Single-tenant: only accounts of this directory (members and B2B guests) can obtain tokens.
  signInAudience: 'AzureADMyOrg'
  groupMembershipClaims: groupMembershipClaims
  serviceManagementReference: empty(serviceManagementReference) ? null : serviceManagementReference
  spa: {
    redirectUris: [
      'http://localhost:5173'
      'http://localhost:8080'
    ]
  }
  api: {
    // When OBO is enabled, the SPA is a known client of the backend app — combined consent
    knownClientApplications: []
    oauth2PermissionScopes: [
      {
        adminConsentDescription: 'Allows the app to read and write chat messages'
        adminConsentDisplayName: 'Read and write chat messages'
        id: chatReadWriteScopeId
        isEnabled: true
        type: 'User'
        userConsentDescription: 'Allows the app to read and write your chat messages'
        userConsentDisplayName: 'Read and write your chat messages'
        value: 'Chat.ReadWrite'
      }
    ]
  }
}

resource sp 'Microsoft.Graph/servicePrincipals@v1.0' = {
  appId: app.appId
  // Access decision (CONSEIN): every authenticated user of the tenant may use the app, so assignment is not required.
  // Authorization is enforced by the API (tenant-pinned token validation + scope + optional ENTRA_ALLOWED_GROUP_ID).
  appRoleAssignmentRequired: false
}

// ============================================================================
// Backend API App Registration for OBO (only when enableObo is true)
// ============================================================================

var backendChatScopeId = guid(resourceGroup().id, environmentName, 'Backend.Chat.ReadWrite')

resource backendApp 'Microsoft.Graph/applications@v1.0' = if (enableObo) {
  uniqueName: 'ai-foundry-agent-backend-${environmentName}'
  displayName: 'ai-foundry-agent-backend-${environmentName}'
  signInAudience: 'AzureADMyOrg'
  // With OBO the access token targets this app, so it must also carry the groups claim when the restriction is on.
  groupMembershipClaims: groupMembershipClaims
  serviceManagementReference: empty(serviceManagementReference) ? null : serviceManagementReference
  web: {
    redirectUris: []
  }
  api: {
    // SPA is a known client — enables combined consent (user consents to SPA + backend in one prompt)
    knownClientApplications: [app.appId]
    oauth2PermissionScopes: [
      {
        adminConsentDescription: 'Allows the backend to access AI Agent Service on behalf of the user'
        adminConsentDisplayName: 'Access AI Agent Service on behalf of user'
        id: backendChatScopeId
        isEnabled: true
        type: 'User'
        userConsentDescription: 'Allows the app to access AI services on your behalf'
        userConsentDisplayName: 'Access AI services on your behalf'
        value: 'Chat.ReadWrite'
      }
    ]
  }
  // requiredResourceAccess for Azure ML Services / user_impersonation
  requiredResourceAccess: [
    {
      resourceAppId: azureMachineLearningAppId
      resourceAccess: [
        {
          id: azureMachineLearningUserImpersonationScopeId
          type: 'Scope' // Delegated permission
        }
      ]
    }
  ]

  // NOTE: FIC (federatedIdentityCredentials) is NOT declared here.
  // Graph API eventual consistency causes the FIC child resource to fail
  // when the parent app hasn't replicated yet. FIC is created in postprovision.ps1
  // which runs after Bicep completes and Graph has had time to replicate.
}

resource backendSp 'Microsoft.Graph/servicePrincipals@v1.0' = if (enableObo) {
  appId: enableObo ? backendApp!.appId : 'placeholder'
}

// ============================================================================
// Admin Consent — grant delegated permission to Azure ML Services (ai.azure.com)
// ============================================================================

// Look up the Azure Machine Learning Services service principal in the tenant
resource azureMachineLearningServiceSp 'Microsoft.Graph/servicePrincipals@v1.0' existing = if (enableObo) {
  appId: azureMachineLearningAppId
}

// Grant admin consent: backend app → Azure Machine Learning Services / user_impersonation
// consentType 'AllPrincipals' = admin consent for all users in the tenant
resource oboAdminConsent 'Microsoft.Graph/oauth2PermissionGrants@v1.0' = if (enableObo) {
  clientId: backendSp!.id
  consentType: 'AllPrincipals'
  resourceId: azureMachineLearningServiceSp!.id
  scope: 'user_impersonation'
}

output clientAppId string = app.appId
output appObjectId string = app.id
output backendClientAppId string = enableObo ? backendApp!.appId : ''
output backendAppObjectId string = enableObo ? backendApp!.id : ''
