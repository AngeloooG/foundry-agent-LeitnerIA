/**
 * Application configuration that is not secret and does not change per user.
 * Values can be overridden at build time with VITE_* variables (see frontend/README.md).
 */
export const appConfig = {
    /** Base path of the backend API (same origin in Azure; proxied by Vite in development). */
    apiBaseUrl: import.meta.env.VITE_API_URL || "/api",

    /** SharePoint host where the Battlecard flow stores generated documents. */
    sharePointHost: (
        import.meta.env.VITE_SHAREPOINT_HOST || "conseincloud.sharepoint.com"
    ).toLowerCase(),
} as const;

/**
 * Attachment limits. They mirror the backend (AttachmentValidator + Limits:MaxRequestBodyMegabytes = 30).
 * Attachments travel base64-encoded (+33 %) inside a single JSON body, so the total raw size must stay
 * below ~22 MB; 20 MB leaves room for the prompt and JSON overhead.
 */
export const attachmentLimits = {
    maxImageCount: 5,
    maxDocumentCount: 10,
    maxImageBytes: 5 * 1024 * 1024,
    maxDocumentBytes: 20 * 1024 * 1024,
    maxTotalBytes: 20 * 1024 * 1024,
} as const;
