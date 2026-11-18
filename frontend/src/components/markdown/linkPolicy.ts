import { appConfig } from "../../config/appConfig";

export type LinkDisplayInfo =
    | { kind: "sharepoint-file"; href: string }
    | { kind: "external"; href: string; domain: string; showDomain: boolean };

const ALLOWED_PROTOCOLS = new Set(["https:", "http:", "mailto:"]);

/**
 * Decides how a link from agent output is rendered.
 * Returns `null` for links that must not be clickable (unknown protocols, relative or malformed URLs).
 */
export function getLinkDisplayInfo(
    href: string | undefined | null,
    visibleText: string
): LinkDisplayInfo | null {
    if (!href) {
        return null;
    }

    let url: URL;
    try {
        url = new URL(href);
    } catch {
        return null;
    }

    if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
        return null;
    }

    if (isConseinSharePointUrl(url)) {
        return { kind: "sharepoint-file", href: url.href };
    }

    const domain = url.protocol === "mailto:" ? url.pathname : url.hostname;
    const showDomain =
        domain.length > 0 &&
        !visibleText.toLowerCase().includes(domain.toLowerCase());

    return { kind: "external", href: url.href, domain, showDomain };
}

export function isConseinSharePointUrl(value: string | URL): boolean {
    try {
        const url = typeof value === "string" ? new URL(value) : value;
        return (
            url.protocol === "https:" &&
            url.hostname.toLowerCase() === appConfig.sharePointHost
        );
    } catch {
        return false;
    }
}
