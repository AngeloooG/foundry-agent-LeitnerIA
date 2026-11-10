import { useState } from "react";
import type { ChangeEvent, DragEvent } from "react";

import { formatAttachmentConstraints, getFileIdentity } from "../api/agentAttachments";
import { FILE_INPUT_ID, useFilePicker } from "../hooks/useFilePicker";
import { FILE_INPUT_ACCEPT, formatFileSize } from "../model/consoleContent";
import { getEffectiveMimeType } from "../model/fileAttachments";
import { useAgentConsole } from "../state/AgentConsoleProvider";

/** Drop zone + file list for reference documents and images. */
export function AttachmentPicker() {
    const { state, actions } = useAgentConsole();
    const { selectedFiles, attachmentErrors } = state;
    const disabled = state.status !== "idle";
    const [isDragging, setIsDragging] = useState(false);
    const { inputRef, open } = useFilePicker();

    const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
        actions.addFiles(Array.from(event.target.files ?? []));
        event.target.value = "";
    };

    const handleDrop = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        setIsDragging(false);
        actions.addFiles(Array.from(event.dataTransfer.files));
    };

    const startDrag = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        if (!disabled) setIsDragging(true);
    };

    return (
        <div className="attachment-section">
            <div className="attachment-section__heading">
                <div>
                    <strong>Archivos de referencia</strong>
                    <span>Opcional</span>
                </div>

                {selectedFiles.length > 0 && (
                    <button type="button" className="clear-files-button" onClick={actions.clearFiles} disabled={disabled}>
                        Quitar todos
                    </button>
                )}
            </div>

            <input
                ref={inputRef}
                id={FILE_INPUT_ID}
                className="visually-hidden-file-input"
                type="file"
                multiple
                accept={FILE_INPUT_ACCEPT}
                onChange={handleInputChange}
                disabled={disabled}
            />

            <div
                className={isDragging ? "upload-box upload-box--active" : "upload-box"}
                role="button"
                tabIndex={disabled ? -1 : 0}
                aria-label="Seleccionar o arrastrar archivos de referencia"
                aria-disabled={disabled}
                onClick={() => !disabled && open()}
                onKeyDown={(event) => {
                    if (!disabled && (event.key === "Enter" || event.key === " ")) {
                        event.preventDefault();
                        open();
                    }
                }}
                onDragEnter={startDrag}
                onDragOver={startDrag}
                onDragLeave={(event) => {
                    event.preventDefault();
                    if (event.currentTarget === event.target) setIsDragging(false);
                }}
                onDrop={handleDrop}
            >
                <span className="upload-box__icon" aria-hidden="true">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                        <path d="M12 16V4M7 9l5-5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M5 14v4a2 2 0 002 2h10a2 2 0 002-2v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                </span>
                <strong>Selecciona o arrastra archivos</strong>
                <span>PDF, TXT, MD, CSV, JSON, HTML, XML o imágenes</span>
                <small>{formatAttachmentConstraints()}</small>
            </div>

            {attachmentErrors.length > 0 && (
                <div className="attachment-errors" role="alert">
                    <strong>No se agregaron algunos archivos</strong>
                    <ul>
                        {attachmentErrors.map((error) => (
                            <li key={error}>{error}</li>
                        ))}
                    </ul>
                </div>
            )}

            {selectedFiles.length > 0 && (
                <div className="selected-files" aria-label="Archivos seleccionados">
                    {selectedFiles.map((file, index) => (
                        <div className="selected-file" key={getFileIdentity(file)}>
                            <span className="selected-file__icon" aria-hidden="true">
                                {getEffectiveMimeType(file).startsWith("image/") ? "IMG" : "DOC"}
                            </span>
                            <span className="selected-file__content">
                                <strong title={file.name}>{file.name}</strong>
                                <small>{formatFileSize(file.size)}</small>
                            </span>
                            <button
                                type="button"
                                onClick={() => actions.removeFile(index)}
                                disabled={disabled}
                                aria-label={`Quitar ${file.name}`}
                            >
                                ×
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
