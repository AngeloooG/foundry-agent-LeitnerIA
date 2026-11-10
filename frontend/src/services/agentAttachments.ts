import {
    convertFilesToDataUris,
    getEffectiveMimeType,
    validateFile,
} from "../utils/fileAttachments";

import { attachmentLimits } from "../config/appConfig";

import type {
    AgentFileAttachment,
} from "./agentStreamClient";

export interface PreparedAgentAttachments {
    imageDataUris: string[];
    fileDataUris: AgentFileAttachment[];
    fileNames: string[];
}

export interface AttachmentSelectionResult {
    acceptedFiles: File[];
    rejectedMessages: string[];
}

const MAX_IMAGE_COUNT = attachmentLimits.maxImageCount;
const MAX_DOCUMENT_COUNT = attachmentLimits.maxDocumentCount;
const MAX_TOTAL_BYTES = attachmentLimits.maxTotalBytes;

export function getFileIdentity(
    file: File
): string {
    return [
        file.name,
        file.size,
        file.lastModified,
        getEffectiveMimeType(file),
    ].join(":");
}

export function mergeAttachmentSelection(
    currentFiles: File[],
    incomingFiles: File[]
): AttachmentSelectionResult {
    const acceptedFiles: File[] = [];
    const rejectedMessages: string[] = [];

    const existingIdentities = new Set(
        currentFiles.map(getFileIdentity)
    );

    let imageCount = currentFiles.filter((file) =>
        getEffectiveMimeType(file).startsWith(
            "image/"
        )
    ).length;

    let documentCount =
        currentFiles.length - imageCount;

    // Total size cap: all attachments travel in one request body (base64), which the backend limits.
    let totalBytes = currentFiles.reduce(
        (sum, file) => sum + file.size,
        0
    );

    for (const file of incomingFiles) {
        const identity = getFileIdentity(file);

        if (existingIdentities.has(identity)) {
            rejectedMessages.push(
                `"${file.name}" ya está adjuntado.`
            );
            continue;
        }

        const validation = validateFile(file);

        if (!validation.valid) {
            rejectedMessages.push(
                validation.error ||
                `"${file.name}" no es válido.`
            );
            continue;
        }

        if (totalBytes + file.size > MAX_TOTAL_BYTES) {
            rejectedMessages.push(
                `"${file.name}" no se agregó. El total de adjuntos no puede superar ${formatMegabytes(MAX_TOTAL_BYTES)} MB.`
            );
            continue;
        }

        const mimeType =
            getEffectiveMimeType(file);

        if (mimeType.startsWith("image/")) {
            if (imageCount >= MAX_IMAGE_COUNT) {
                rejectedMessages.push(
                    `"${file.name}" no se agregó. El máximo es de ${MAX_IMAGE_COUNT} imágenes.`
                );
                continue;
            }

            imageCount += 1;
        } else {
            if (
                documentCount >= MAX_DOCUMENT_COUNT
            ) {
                rejectedMessages.push(
                    `"${file.name}" no se agregó. El máximo es de ${MAX_DOCUMENT_COUNT} documentos.`
                );
                continue;
            }

            documentCount += 1;
        }

        totalBytes += file.size;
        existingIdentities.add(identity);
        acceptedFiles.push(file);
    }

    return {
        acceptedFiles,
        rejectedMessages,
    };
}

export async function prepareAgentAttachments(
    files: File[]
): Promise<PreparedAgentAttachments> {
    if (files.length === 0) {
        return {
            imageDataUris: [],
            fileDataUris: [],
            fileNames: [],
        };
    }

    const results =
        await convertFilesToDataUris(files);

    const imageDataUris: string[] = [];
    const fileDataUris: AgentFileAttachment[] =
        [];

    for (const result of results) {
        if (result.mimeType.startsWith("image/")) {
            imageDataUris.push(result.dataUri);
            continue;
        }

        fileDataUris.push({
            dataUri: result.dataUri,
            fileName: result.name,
            mimeType: result.mimeType,
        });
    }

    return {
        imageDataUris,
        fileDataUris,
        fileNames: results.map(
            (result) => result.name
        ),
    };
}

export function removeAttachmentAt(
    files: File[],
    index: number
): File[] {
    return files.filter(
        (_, currentIndex) =>
            currentIndex !== index
    );
}

export function formatAttachmentConstraints(): string {
    return [
        `Imágenes: PNG, JPEG, GIF o WebP, hasta ${formatMegabytes(attachmentLimits.maxImageBytes)} MB por archivo.`,
        `Documentos: PDF, TXT, Markdown, CSV, JSON, HTML o XML, hasta ${formatMegabytes(attachmentLimits.maxDocumentBytes)} MB por archivo.`,
        `Máximo: ${MAX_IMAGE_COUNT} imágenes y ${MAX_DOCUMENT_COUNT} documentos, ${formatMegabytes(MAX_TOTAL_BYTES)} MB en total.`,
    ].join(" ");
}

function formatMegabytes(bytes: number): string {
    return String(Math.round(bytes / (1024 * 1024)));
}