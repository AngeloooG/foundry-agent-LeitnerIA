import { useCallback, useMemo } from "react";

import { InteractionRequiredAuthError } from "@azure/msal-browser";
import { useMsal } from "@azure/msal-react";

import { tokenRequest } from "../config/authConfig";

/**
 * Access-token helper for calls to the backend API.
 *
 * - Uses the active account (set in main.tsx after login), falling back to the first cached account.
 * - Tries a silent acquisition first. When user interaction is required (expired session, new consent)
 *   it starts a full-page redirect, the same interaction type used for login, and returns `null`
 *   because the page is about to navigate away.
 */
export const useAuth = () => {
    const { instance, accounts } = useMsal();

    const getAccessToken = useCallback(async (): Promise<string | null> => {
        const account = instance.getActiveAccount() ?? accounts[0];
        if (!account) {
            return null;
        }

        const request = { ...tokenRequest, account };

        try {
            const response = await instance.acquireTokenSilent(request);
            return response.accessToken;
        } catch (error) {
            if (error instanceof InteractionRequiredAuthError) {
                await instance.acquireTokenRedirect(request);
                return null;
            }

            // Do not log the error object: it can include claims and correlation data.
            console.error("No se pudo obtener el token de acceso.");
            return null;
        }
    }, [instance, accounts]);

    const user = instance.getActiveAccount() ?? accounts[0];

    return useMemo(
        () => ({
            getAccessToken,
            isAuthenticated: accounts.length > 0,
            user,
        }),
        [getAccessToken, accounts.length, user]
    );
};
