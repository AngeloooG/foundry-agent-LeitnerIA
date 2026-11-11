import { beforeEach, describe, expect, it, vi } from "vitest";

const FRONTEND = "00000000-0000-0000-0000-000000000001";
const BACKEND = "00000000-0000-0000-0000-0000000000b1";

describe("authConfig", () => {
    beforeEach(() => {
        vi.resetModules();
        vi.unstubAllEnvs();
        vi.stubEnv("VITE_ENTRA_TENANT_ID", "00000000-0000-0000-0000-000000000002");
    });

    it("requests exactly the backend scope for sign-in and tokens", async () => {
        vi.stubEnv("VITE_ENTRA_FRONTEND_CLIENT_ID", FRONTEND);
        vi.stubEnv("VITE_ENTRA_BACKEND_CLIENT_ID", BACKEND);

        const { apiScope, loginRequest, msalConfig, tokenRequest } = await import("../authConfig");

        expect(apiScope).toBe(`api://${BACKEND}/Chat.ReadWrite`);
        expect(loginRequest.scopes).toEqual([`api://${BACKEND}/Chat.ReadWrite`]);
        expect(tokenRequest.scopes).toEqual([`api://${BACKEND}/Chat.ReadWrite`]);
        expect(msalConfig.auth.clientId).toBe(FRONTEND);
    });

    it("does not fall back to the frontend id when the backend id is missing", async () => {
        vi.stubEnv("VITE_ENTRA_FRONTEND_CLIENT_ID", FRONTEND);
        vi.stubEnv("VITE_ENTRA_BACKEND_CLIENT_ID", "");

        await expect(import("../authConfig")).rejects.toThrow("VITE_ENTRA_BACKEND_CLIENT_ID");
    });

    it("rejects a backend id equal to the frontend id", async () => {
        vi.stubEnv("VITE_ENTRA_FRONTEND_CLIENT_ID", FRONTEND);
        vi.stubEnv("VITE_ENTRA_BACKEND_CLIENT_ID", FRONTEND.toUpperCase());

        await expect(import("../authConfig")).rejects.toThrow("must differ");
    });
});
