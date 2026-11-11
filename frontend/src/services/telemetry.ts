import { ApplicationInsights } from "@microsoft/applicationinsights-web";

/**
 * Browser telemetry (Application Insights). The connection string is an ingestion key that is public by design
 * (it ships in the bundle); it is not access control. No user content is ever sent: only exceptions with generic
 * messages, page views and timing of /api calls.
 */
const connectionString = import.meta.env.VITE_APPLICATIONINSIGHTS_CONNECTION_STRING;

let appInsights: ApplicationInsights | null = null;

export function initTelemetry(): void {
  if (!connectionString) return;

  appInsights = new ApplicationInsights({
    config: {
      connectionString,
      enableAutoRouteTracking: true, // react-router navigation (/ and /agente)
      disableFetchTracking: false,
      // Same-origin API: no correlation headers are sent to third parties (Entra ID, fonts).
      enableCorsCorrelation: false,
      enableRequestHeaderTracking: false,
      enableResponseHeaderTracking: false,
      enableUnhandledPromiseRejectionTracking: true,
      disableCookiesUsage: true,
    },
  });

  appInsights.loadAppInsights();
}

/** Records an exception. Callers must pass generic errors and properties without user content. */
export function trackException(error: Error, properties?: Record<string, string>): void {
  appInsights?.trackException({ exception: error }, properties);
}
