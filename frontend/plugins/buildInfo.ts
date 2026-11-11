import type { Plugin } from "vite";

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Production builds only:
 * 1. Fail when the Entra ids are missing, not GUIDs or equal (a bundle without them cannot sign in).
 * 2. Emit `leitneria-build.json` with the ids baked into the bundle. The API compares it with its own
 *    configuration at startup (SpaBundleConsistencyCheck) and refuses to start on a mismatch, so an image built
 *    for another backend registration can never serve traffic.
 * Only public identifiers are written (they are already embedded in the JavaScript bundle).
 */
export function buildInfoPlugin(): Plugin {
    let enabled = false;

    return {
        name: "leitneria-build-info",
        apply: "build",
        configResolved(config) {
            enabled = config.mode === "production";
        },
        buildStart() {
            if (!enabled) return;
            const frontend = process.env.VITE_ENTRA_FRONTEND_CLIENT_ID ?? "";
            const backend = process.env.VITE_ENTRA_BACKEND_CLIENT_ID ?? "";
            const tenant = process.env.VITE_ENTRA_TENANT_ID ?? "";
            const problems = [
                !GUID.test(tenant) && "VITE_ENTRA_TENANT_ID must be a GUID",
                !GUID.test(frontend) && "VITE_ENTRA_FRONTEND_CLIENT_ID must be a GUID",
                !GUID.test(backend) && "VITE_ENTRA_BACKEND_CLIENT_ID must be a GUID",
                GUID.test(frontend) && frontend.toLowerCase() === backend.toLowerCase()
                    && "VITE_ENTRA_BACKEND_CLIENT_ID must differ from VITE_ENTRA_FRONTEND_CLIENT_ID",
            ].filter(Boolean);
            if (problems.length > 0) {
                this.error(`Invalid Entra build configuration: ${problems.join("; ")}`);
            }
        },
        generateBundle() {
            if (!enabled) return;
            this.emitFile({
                type: "asset",
                fileName: "leitneria-build.json",
                source: JSON.stringify({
                    frontendClientId: process.env.VITE_ENTRA_FRONTEND_CLIENT_ID,
                    backendClientId: process.env.VITE_ENTRA_BACKEND_CLIENT_ID,
                    apiScope: `api://${process.env.VITE_ENTRA_BACKEND_CLIENT_ID}/Chat.ReadWrite`,
                }),
            });
        },
    };
}
