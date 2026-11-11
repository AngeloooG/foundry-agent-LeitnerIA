import type { Configuration } from "@azure/msal-browser";
import { LogLevel } from "@azure/msal-browser";

// Build-time configuration (public identifiers). Two app registrations:
//  - VITE_ENTRA_FRONTEND_CLIENT_ID: this SPA (MSAL client id, interactive sign-in).
//  - VITE_ENTRA_BACKEND_CLIENT_ID: the API registration; its Chat.ReadWrite scope is the only one requested.
// There is deliberately NO fallback from the backend id to the frontend id: the API rejects SPA-audience tokens.
const clientId = import.meta.env.VITE_ENTRA_FRONTEND_CLIENT_ID;

if (!clientId) {
  throw new Error(
    "VITE_ENTRA_FRONTEND_CLIENT_ID is not set. It must be provided at build time " +
    "(azd hooks run postprovision writes it to frontend/.env.local for local development)."
  );
}

const backendClientId = import.meta.env.VITE_ENTRA_BACKEND_CLIENT_ID;

if (!backendClientId) {
  throw new Error("VITE_ENTRA_BACKEND_CLIENT_ID is not set. It must be provided at build time.");
}

if (backendClientId.toLowerCase() === clientId.toLowerCase()) {
  throw new Error("VITE_ENTRA_BACKEND_CLIENT_ID must differ from VITE_ENTRA_FRONTEND_CLIENT_ID.");
}

/** Delegated scope exposed by the backend registration: api://<BACKEND_CLIENT_ID>/Chat.ReadWrite */
export const apiScope = `api://${backendClientId}/Chat.ReadWrite`;

const tenantId = import.meta.env.VITE_ENTRA_TENANT_ID;

if (!tenantId) {
  throw new Error(
    "VITE_ENTRA_TENANT_ID is not set. This must be provided during build time. " +
    "For local dev, run setup-local-dev.ps1 to configure from azd environment."
  );
}

export const msalConfig: Configuration = {
  auth: {
    clientId: clientId,
    authority: `https://login.microsoftonline.com/${tenantId}`,
    redirectUri: window.location.origin, // Will be https://<container-app-url> in production
    postLogoutRedirectUri: window.location.origin,
    navigateToLoginRequestUrl: false, // Avoid redirect loops
  },
  cache: {
    // sessionStorage: tokens are scoped to the tab and cleared when it closes, which reduces the
    // impact of an XSS (localStorage persists refresh tokens across sessions and tabs).
    // Opening a new tab signs in silently through the Entra ID session cookie.
    cacheLocation: "sessionStorage",
  },
  system: {
    loggerOptions: {
      logLevel: import.meta.env.DEV ? LogLevel.Info : LogLevel.Warning,
      loggerCallback: (level, message, containsPii) => {
        if (containsPii) return;
        switch (level) {
          case LogLevel.Error:
            console.error(message);
            break;
          case LogLevel.Warning:
            console.warn(message);
            break;
          case LogLevel.Info:
            console.info(message);
            break;
          case LogLevel.Verbose:
            console.debug(message);
            break;
        }
      },
    },
  },
};

// Sign-in and silent/redirect token acquisition request exactly the backend scope.
export const loginRequest = {
  scopes: [apiScope],
};

export const tokenRequest = {
  scopes: [apiScope],
  forceRefresh: false, // Use cached token if valid
};
