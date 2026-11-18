extension microsoftGraphV1

// ============================================================================
// Entra ID app registrations for LeitnerIA (two registrations):
//   1. Frontend SPA  - interactive sign-in, redirect URIs, requests the backend scope. No secrets.
//   2. Backend API   - exposes Chat.ReadWrite and is the ONLY audience accepted by the API.
// Both are single-tenant with "Assignment required = No" (every authenticated user of the tenant).
// Changes to this file modify the real tenant on `azd provision`: senior review required.
// ============================================================================

@description('Name suffix for the Entra apps (e.g., environment name)')
param environmentName string

@description('Service Management Reference GUID (required by some orgs)')
param serviceManagementReference string = ''

@description('Enable On-Behalf-Of: the backend calls Foundry with the user identity (requires per-user Foundry RBAC and admin consent). Default: managed identity.')
param enableObo bool = false

@description('Optional security group (object id). When set, access tokens carry the groups claim and the API only authorizes its members. Empty = every user of the tenant.')
param allowedGroupId string = ''

@description('Add http://localhost redirect URIs to the SPA (development only). postprovision adds the Container App URL.')
param allowLocalhostRedirects bool = false

@description('Grant tenant-wide (admin) consent SPA -> backend Chat.ReadWrite. Requires an Entra admin role. When false, users consent on first sign-in (if the tenant allows user consent).')
param grantSpaAdminConsent bool = false

// Emit the groups claim only when the optional group restriction is configured.
var groupMembershipClaims = empty(allowedGroupId) ? 'None' : 'SecurityGroup'

// ============================================================================
// Well-known first-party app IDs and scope IDs (stable across all Entra tenants)
// ============================================================================

// Azure Machine Learning Services — the resource behind https://ai.azure.com/.default (used only with OBO).
// ⚠️ NOT the same as "Microsoft Cognitive Services" (7d312290-...) — a common mistake.
var azureMachineLearningAppId = '18a66f5f-dbdf-4c17-9dd7-1634712a9cbe'
var azureMachineLearningUserImpersonationScopeId = '1a7925b5-f871-417a-9b8b-303f9f29fa10'

// Deterministic scope IDs — stable across redeployments
var legacyChatReadWriteScopeId = guid(resourceGroup().id, environmentName, 'Chat.ReadWrite')
var backendChatScopeId = guid(resourceGroup().id, environmentName, 'Backend.Chat.ReadWrite')

// ============================================================================
// Backend API registration (audience of the API)
// ============================================================================

resource backendApp 'Microsoft.Graph/applications@v1.0' = {
  // Same uniqueName the optional OBO registration used before: an existing backend app is updated, not recreated.
  uniqueName: 'ai-foundry-agent-backend-${environmentName}'
  displayName: 'ai-foundry-agent-backend-${environmentName}'
  signInAudience: 'AzureADMyOrg'
  // The access token targets this app, so it carries the groups claim when the restriction is on.
  groupMembershipClaims: groupMembershipClaims
  serviceManagementReference: empty(serviceManagementReference) ? null : serviceManagementReference
  web: {
    redirectUris: []
  }
  api: {
    // v2 access tokens: aud = backend client id, iss = https://login.microsoftonline.com/{tid}/v2.0
    requestedAccessTokenVersion: 2
    oauth2PermissionScopes: [
      {
        adminConsentDescription: 'Allows the LeitnerIA web app to call the LeitnerIA API on behalf of the signed-in user'
        adminConsentDisplayName: 'Use LeitnerIA as the signed-in user'
        id: backendChatScopeId
        isEnabled: true
        type: 'User'
        userConsentDescription: 'Allows LeitnerIA to send your requests to the LeitnerIA agent'
        userConsentDisplayName: 'Use LeitnerIA'
        value: 'Chat.ReadWrite'
      }
    ]
  }
  // Delegated permission to Azure ML Services, only needed when the backend uses OBO towards Foundry.
  requiredResourceAccess: enableObo ? [
    {
      resourceAppId: azureMachineLearningAppId
      resourceAccess: [
        {
          id: azureMachineLearningUserImpersonationScopeId
          type: 'Scope'
        }
      ]
    }
  ] : []
  // identifierUris (api://{appId}) and the OBO federated credential are set by postprovision.ps1:
  // the URI references this app's own appId and FICs fail on Graph eventual consistency.
}

resource backendSp 'Microsoft.Graph/servicePrincipals@v1.0' = {
  appId: backendApp.appId
  appRoleAssignmentRequired: false
}

// ============================================================================
// Frontend SPA registration (sign-in only)
// ============================================================================

resource app 'Microsoft.Graph/applications@v1.0' = {
  // Kept unchanged so the existing registration (and its redirect URIs, sign-ins and consents) is updated in place.
  uniqueName: 'ai-foundry-agent-${environmentName}'
  displayName: 'ai-foundry-agent-${environmentName}'
  signInAudience: 'AzureADMyOrg'
  serviceManagementReference: empty(serviceManagementReference) ? null : serviceManagementReference
  spa: {
    redirectUris: allowLocalhostRedirects ? [
      'http://localhost:5173'
      'http://localhost:8080'
    ] : []
  }
  api: {
    // LEGACY scope from the single-registration model. The new API rejects tokens for this app (wrong audience),
    // but the scope is kept so the previous image keeps working during the rollback window. Remove in two steps
    // after the rollback window (Entra rejects deleting an enabled scope): 1) isEnabled: false, 2) remove it.
    oauth2PermissionScopes: [
      {
        adminConsentDescription: 'LEGACY - Allows the app to read and write chat messages'
        adminConsentDisplayName: 'LEGACY - Read and write chat messages'
        id: legacyChatReadWriteScopeId
        isEnabled: true
        type: 'User'
        userConsentDescription: 'Allows the app to read and write your chat messages'
        userConsentDisplayName: 'Read and write your chat messages'
        value: 'Chat.ReadWrite'
      }
    ]
  }
  // The SPA declares the delegated permission it needs on the backend API.
  requiredResourceAccess: [
    {
      resourceAppId: backendApp.appId
      resourceAccess: [
        {
          id: backendChatScopeId
          type: 'Scope'
        }
      ]
    }
  ]
}

resource sp 'Microsoft.Graph/servicePrincipals@v1.0' = {
  appId: app.appId
  // Access decision (CONSEIN): every authenticated user of the tenant may use the app, so assignment is not required.
  // Authorization is enforced by the API (tenant-pinned token validation + scope + optional ENTRA_ALLOWED_GROUP_ID).
  appRoleAssignmentRequired: false
}

// Optional tenant-wide consent SPA -> backend (admin action).
resource spaAdminConsent 'Microsoft.Graph/oauth2PermissionGrants@v1.0' = if (grantSpaAdminConsent) {
  clientId: sp.id
  consentType: 'AllPrincipals'
  resourceId: backendSp.id
  scope: 'Chat.ReadWrite'
}

// ============================================================================
// OBO only: admin consent backend -> Azure Machine Learning Services / user_impersonation
// ============================================================================

resource azureMachineLearningServiceSp 'Microsoft.Graph/servicePrincipals@v1.0' existing = if (enableObo) {
  appId: azureMachineLearningAppId
}

resource oboAdminConsent 'Microsoft.Graph/oauth2PermissionGrants@v1.0' = if (enableObo) {
  clientId: backendSp.id
  consentType: 'AllPrincipals'
  resourceId: azureMachineLearningServiceSp!.id
  scope: 'user_impersonation'
}

output frontendClientId string = app.appId
output frontendAppObjectId string = app.id
output backendClientId string = backendApp.appId
output backendAppObjectId string = backendApp.id
output backendChatScope string = 'api://${backendApp.appId}/Chat.ReadWrite'
