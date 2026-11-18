import { describe, expect, it } from "vitest";

import { attachmentLimits } from "../../../../config/appConfig";
import { mergeAttachmentSelection } from "../agentAttachments";

const MB = 1024 * 1024;

function makeFile(name: string, type: string, sizeBytes: number): File {
    return new File([new Uint8Array(sizeBytes)], name, { type, lastModified: 1 });
}

describe("mergeAttachmentSelection", () => {
    it("accepts valid files and rejects duplicates", () => {
        const pdf = makeFile("a.pdf", "application/pdf", 10);

        const first = mergeAttachmentSelection([], [pdf]);
        const second = mergeAttachmentSelection(first.acceptedFiles, [pdf]);

        expect(first.acceptedFiles).toHaveLength(1);
        expect(second.acceptedFiles).toHaveLength(0);
        expect(second.rejectedMessages[0]).toContain("ya está adjuntado");
    });

    it("enforces the per-type image count", () => {
        const images = Array.from({ length: attachmentLimits.maxImageCount + 1 }, (_, i) =>
            makeFile(`img${i}.png`, "image/png", 10)
        );

        const result = mergeAttachmentSelection([], images);

        expect(result.acceptedFiles).toHaveLength(attachmentLimits.maxImageCount);
        expect(result.rejectedMessages).toHaveLength(1);
    });

    it("enforces the total size cap aligned with the backend body limit", () => {
        const big1 = makeFile("a.pdf", "application/pdf", 12 * MB);
        const big2 = makeFile("b.pdf", "application/pdf", 12 * MB);

        const result = mergeAttachmentSelection([], [big1, big2]);

        expect(result.acceptedFiles).toEqual([big1]);
        expect(result.rejectedMessages[0]).toContain("total de adjuntos");
    });

    it("rejects unsupported types", () => {
        const docx = makeFile(
            "a.docx",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            10
        );

        const result = mergeAttachmentSelection([], [docx]);

        expect(result.acceptedFiles).toHaveLength(0);
        expect(result.rejectedMessages).toHaveLength(1);
    });
});
