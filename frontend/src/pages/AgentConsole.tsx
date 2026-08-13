import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, DragEvent, ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useAuth } from "../hooks/useAuth";
import { useAgentConsoleState } from "../hooks/useAppState";

import {
    streamAgentMessage,
    type AgentAnnotation,
} from "../services/agentStreamClient";

import {
    formatAttachmentConstraints,
    mergeAttachmentSelection,
    prepareAgentAttachments,
    removeAttachmentAt,
} from "../services/agentAttachments";
import {
    buildBattlecardPrompt,
    initialBattlecardForm,
    isBattlecardFormValid,
    updateFormField,
    validateBattlecardForm,
    type BattlecardForm,
    type BattlecardFormErrors,
} from "./agentConsoleForm";

type MessageRole = "user" | "agent" | "system";

interface ChatMessage {
    id: string;
    role: MessageRole;
    text: string;
}

const sectorOptions = [
    "Servicios tecnológicos",
    "Consultoría tecnológica",
    "Soluciones empresariales",
    "Cloud services",
    "Transformación digital",
    "Ciberseguridad",
    "Banca y finanzas",
    "Gobierno",
];

const quickPrompts = [
    "Quiero comparar CONSEIN contra un competidor.",
    "Ayúdame a crear una Battlecard por servicio.",
    "Necesito analizar un producto o solución Microsoft.",
    "Genera un resumen ejecutivo competitivo.",
];

function createId() {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function AgentConsole() {
    const { getAccessToken } = useAuth();
    const {
        agentConsole,
        patchAgentConsole,
        resetAgentConsole,
    } = useAgentConsoleState();

    /*
     * Se hidrata desde AppContext y se conserva localmente durante el montaje.
     * Esto mantiene seguras las actualizaciones funcionales frecuentes del
     * streaming y sincroniza la sesión cuando el usuario cambia de ruta.
     */
    const [form, setForm] = useState<BattlecardForm>(
        () => agentConsole.form
    );
    const [formErrors, setFormErrors] =
        useState<BattlecardFormErrors>(() => agentConsole.formErrors);
    const [hasPreparedPrompt, setHasPreparedPrompt] =
        useState(() => agentConsole.hasPreparedPrompt);
    const [messages, setMessages] = useState<ChatMessage[]>(
        () => agentConsole.messages
    );
    const [chatInput, setChatInput] = useState(
        () => agentConsole.chatInput
    );
    const [conversationId, setConversationId] = useState<string | null>(
        () => agentConsole.conversationId
    );
    const [isStreaming, setIsStreaming] = useState(false);
    const [toolStatus, setToolStatus] = useState<string>("");
    const [annotations, setAnnotations] = useState<AgentAnnotation[]>(
        () => agentConsole.annotations
    );

    const chatEndRef = useRef<HTMLDivElement | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [selectedFiles, setSelectedFiles] = useState<File[]>(
        () => agentConsole.selectedFiles
    );
    const [attachmentErrors, setAttachmentErrors] = useState<string[]>(
        () => agentConsole.attachmentErrors
    );
    const [isDraggingFiles, setIsDraggingFiles] = useState(false);
    const [isPreparingAttachments, setIsPreparingAttachments] = useState(false);

    useEffect(() => {
        patchAgentConsole({
            form,
            formErrors,
            hasPreparedPrompt,
            messages,
            chatInput,
            conversationId,
            annotations,
            selectedFiles,
            attachmentErrors,
        });
    }, [
        form,
        formErrors,
        hasPreparedPrompt,
        messages,
        chatInput,
        conversationId,
        annotations,
        selectedFiles,
        attachmentErrors,
        patchAgentConsole,
    ]);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, isStreaming]);

    const canPreparePrompt = useMemo(
        () => isBattlecardFormValid(form),
        [form]
    );

    const setField = <Field extends keyof BattlecardForm>(
        field: Field,
        value: BattlecardForm[Field]
    ) => {
        setForm((previous) =>
            updateFormField(previous, field, value)
        );

        setFormErrors((previous) => {
            const nextErrors = {
                ...previous,
            };

            delete nextErrors[
                field as keyof BattlecardFormErrors
            ];

            return nextErrors;
        });

        setHasPreparedPrompt(false);
    };

    const addMessage = (role: MessageRole, text: string) => {
        const id = createId();

        setMessages((prev) => [
            ...prev,
            {
                id,
                role,
                text,
            },
        ]);

        return id;
    };

    const appendToMessage = (messageId: string, chunk: string) => {
        setMessages((prev) =>
            prev.map((message) =>
                message.id === messageId
                    ? {
                        ...message,
                        text: `${message.text}${chunk}`,
                    }
                    : message
            )
        );
    };

    const updateMessage = (messageId: string, text: string) => {
        setMessages((prev) =>
            prev.map((message) =>
                message.id === messageId
                    ? {
                        ...message,
                        text,
                    }
                    : message
            )
        );
    };

    const addSelectedFiles = (incomingFiles: File[]) => {
        if (incomingFiles.length === 0 || isStreaming) {
            return;
        }

        const { acceptedFiles, rejectedMessages } =
            mergeAttachmentSelection(selectedFiles, incomingFiles);

        if (acceptedFiles.length > 0) {
            setSelectedFiles((previous) => [
                ...previous,
                ...acceptedFiles,
            ]);
            setHasPreparedPrompt(false);
        }

        setAttachmentErrors(rejectedMessages);
    };

    const handleFileInputChange = (
        event: ChangeEvent<HTMLInputElement>
    ) => {
        addSelectedFiles(Array.from(event.target.files ?? []));
        event.target.value = "";
    };

    const handleFileDrop = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        setIsDraggingFiles(false);
        addSelectedFiles(Array.from(event.dataTransfer.files));
    };

    const removeSelectedFile = (index: number) => {
        if (isStreaming) {
            return;
        }

        setSelectedFiles((previous) => removeAttachmentAt(previous, index));
        setAttachmentErrors([]);
        setHasPreparedPrompt(false);
    };

    const clearSelectedFiles = () => {
        if (isStreaming) {
            return;
        }

        setSelectedFiles([]);
        setAttachmentErrors([]);
        setHasPreparedPrompt(false);
    };

    const runAgent = async (
        message: string,
        files: File[]
    ) => {
        if (isStreaming) return;

        const trimmedMessage = message.trim();

        if (!trimmedMessage) {
            return;
        }

        setIsStreaming(true);
        setToolStatus("");
        setAnnotations([]);

        const controller = new AbortController();
        abortControllerRef.current = controller;

        const assistantMessageId = addMessage("agent", "");

        try {
            const token = await getAccessToken();

            if (!token) {
                updateMessage(
                    assistantMessageId,
                    "No se pudo obtener un token de autenticación. Inicia sesión de nuevo e intenta otra vez."
                );
                return;
            }

            setIsPreparingAttachments(files.length > 0);
            const preparedAttachments = await prepareAgentAttachments(files);
            setIsPreparingAttachments(false);

            let streamedText = "";
            const collectedAnnotations: AgentAnnotation[] = [];

            await streamAgentMessage(
                {
                    message: trimmedMessage,
                    token,
                    conversationId,
                    imageDataUris: preparedAttachments.imageDataUris,
                    fileDataUris: preparedAttachments.fileDataUris,
                    signal: controller.signal,
                },
                {
                    onConversationId: (id) => {
                        setConversationId(id);
                    },
                    onChunk: (chunk) => {
                        streamedText += chunk;
                        appendToMessage(assistantMessageId, chunk);
                    },
                    onToolUse: (toolName) => {
                        setToolStatus(`Usando herramienta: ${toolName}`);
                    },
                    onAnnotations: (items) => {
                        collectedAnnotations.push(...items);
                        setAnnotations((prev) => [...prev, ...items]);
                    },
                    onError: (errorMessage) => {
                        updateMessage(
                            assistantMessageId,
                            `No se pudo completar la respuesta del agente: ${errorMessage}`
                        );
                    },
                }
            );

            if (files.length > 0) {
                setSelectedFiles([]);
                setAttachmentErrors([]);
            }

            if (!streamedText.trim()) {
                updateMessage(
                    assistantMessageId,
                    "El agente terminó la ejecución, pero no devolvió contenido textual. Revisa si la herramienta generó un archivo o si ocurrió una respuesta vacía."
                );
            }
        } catch (error) {
            if (error instanceof DOMException && error.name === "AbortError") {
                updateMessage(assistantMessageId, "La generación fue cancelada por el usuario.");
            } else {
                const messageText =
                    error instanceof Error ? error.message : "Error desconocido al invocar el agente.";

                updateMessage(
                    assistantMessageId,
                    `No se pudo conectar correctamente con Leitner IA: ${messageText}`
                );
            }
        } finally {
            setIsPreparingAttachments(false);
            setIsStreaming(false);
            setToolStatus("");
            abortControllerRef.current = null;
        }
    };

    const sendChatMessage = async () => {
        const text = chatInput.trim();

        if (!text || isStreaming) {
            return;
        }

        const filesToSend = [...selectedFiles];

        setChatInput("");
        setHasPreparedPrompt(false);

        addMessage("user", text);

        await runAgent(text, filesToSend);
    };

    const cancelStreaming = () => {
        abortControllerRef.current?.abort();
    };

    const prepareBattlecardPrompt = () => {
        const errors = validateBattlecardForm(form);
        setFormErrors(errors);

        if (Object.keys(errors).length > 0) {
            addMessage(
                "system",
                "Completa los campos obligatorios del formulario antes de preparar la solicitud."
            );
            return;
        }

        const generatedPrompt = buildBattlecardPrompt(
            form,
            selectedFiles.map((file) => file.name)
        );

        setChatInput(generatedPrompt);
        setHasPreparedPrompt(true);

        requestAnimationFrame(() => {
            chatEndRef.current?.scrollIntoView({
                behavior: "smooth",
                block: "end",
            });
        });
    };




    const resetConversation = () => {
        abortControllerRef.current?.abort();
        resetAgentConsole();
        setConversationId(null);
        setMessages([
            {
                id: createId(),
                role: "agent",
                text:
                    "Conversación reiniciada. Puedes escribir una solicitud libre o completar el formulario para preparar una solicitud estructurada.",
            },
        ]);
        setChatInput("");
        setToolStatus("");
        setAnnotations([]);
        setHasPreparedPrompt(false);
        setFormErrors({});
        setSelectedFiles([]);
        setAttachmentErrors([]);
        setIsDraggingFiles(false);
        setForm({ ...initialBattlecardForm });
    };
    return (
        <main className="app-shell agent-page">
            <section className="agent-top">
                <div className="container agent-top-inner">
                    <div>
                        <h1>Probar Leitner IA</h1>
                        <p>
                            Genera Battlecards competitivas mediante chat libre o formulario guiado · Impulsado por Azure AI Foundry
                        </p>
                    </div>

                    <div className="agent-badges">
                        {["Azure AI Foundry", "GPT-5", "MCP"].map((item) => (
                            <span key={item}>{item}</span>
                        ))}
                    </div>
                </div>
            </section>

            <section className="container agent-layout">
                <aside className="card form-panel">
                    <div className="form-head">
                        <div>
                            <strong>Preparar una Battlecard</strong>
                            <small>
                                Responde cinco preguntas para construir una solicitud precisa.
                            </small>
                        </div>

                        <span className="form-progress">
                            5 preguntas
                        </span>
                    </div>

                    <div className="form-body">
                        <div className="form-introduction">
                            <strong>Generación guiada</strong>

                            <p>
                                El formulario preparará una instrucción editable en el chat.
                                Nada se enviará hasta que presiones Enviar.
                            </p>
                        </div>

                        <Field
                            label="Empresa principal"
                            helpText="Empresa cuya oferta quieres posicionar."
                        >
                            <input
                                value={form.company}
                                onChange={(event) =>
                                    setField("company", event.target.value)
                                }
                                disabled={isStreaming}
                                placeholder="Ej.: CONSEIN"
                            />
                        </Field>

                        <Field
                            label="1. ¿Qué producto, servicio o solución estás ofreciendo?"
                            required
                            error={formErrors.offering}
                            helpText="Explica la oferta con suficiente detalle. Puedes incluir tecnologías, alcance y modalidad del servicio."
                        >
                            <textarea
                                value={form.offering}
                                onChange={(event) =>
                                    setField("offering", event.target.value)
                                }
                                disabled={isStreaming}
                                rows={4}
                                placeholder="Ej.: Implementación de Microsoft Copilot Studio integrada con Power Automate, Azure AI Search y los sistemas internos del cliente."
                            />
                        </Field>

                        <Field
                            label="2. ¿Quién es el cliente ideal o avatar de decisión?"
                            required
                            error={formErrors.targetCustomer}
                            helpText="Describe la organización, el sector, el cargo del decisor y sus prioridades."
                        >
                            <textarea
                                value={form.targetCustomer}
                                onChange={(event) =>
                                    setField(
                                        "targetCustomer",
                                        event.target.value
                                    )
                                }
                                disabled={isStreaming}
                                rows={4}
                                placeholder="Ej.: Banco mediano. El decisor principal es el Director de Operaciones, acompañado por Tecnología y Cumplimiento."
                            />
                        </Field>

                        <Field
                            label="3. ¿Contra qué empresas, soluciones o alternativas compites?"
                            required
                            error={formErrors.competitors}
                            helpText="Incluye proveedores, productos, desarrollo interno, procesos manuales o la opción de no hacer nada."
                        >
                            <textarea
                                value={form.competitors}
                                onChange={(event) =>
                                    setField(
                                        "competitors",
                                        event.target.value
                                    )
                                }
                                disabled={isStreaming}
                                rows={3}
                                placeholder="Ej.: IBM, Accenture, UiPath, desarrollo interno y mantener el proceso manual actual."
                            />
                        </Field>

                        <Field
                            label="4. ¿Qué resultado desea lograr el cliente?"
                            required
                            error={formErrors.desiredOutcome}
                            helpText="Describe el resultado de negocio esperado, no solamente el objetivo de vender."
                        >
                            <textarea
                                value={form.desiredOutcome}
                                onChange={(event) =>
                                    setField(
                                        "desiredOutcome",
                                        event.target.value
                                    )
                                }
                                disabled={isStreaming}
                                rows={4}
                                placeholder="Ej.: Reducir el tiempo de atención, mantener trazabilidad y desplegar la solución en menos de tres meses."
                            />
                        </Field>

                        <fieldset className="analysis-fieldset">
                            <legend>
                                5. ¿Qué enfoque debe aplicar el análisis?
                                <span aria-hidden="true"> *</span>
                            </legend>

                            <p className="analysis-description">
                                Selecciona el nivel de rigurosidad que debe aplicar Leitner IA.
                            </p>

                            <div className="analysis-options">
                                <label
                                    className={
                                        form.analysisApproach === "strategic"
                                            ? "analysis-option analysis-option--selected"
                                            : "analysis-option"
                                    }
                                >
                                    <input
                                        type="radio"
                                        name="analysisApproach"
                                        value="strategic"
                                        checked={
                                            form.analysisApproach ===
                                            "strategic"
                                        }
                                        disabled={isStreaming}
                                        onChange={() =>
                                            setField(
                                                "analysisApproach",
                                                "strategic"
                                            )
                                        }
                                    />

                                    <span className="analysis-option__control" />

                                    <span className="analysis-option__content">
                                        <strong>
                                            Estratégico basado en evidencia
                                        </strong>

                                        <small>
                                            Construye el posicionamiento comercial más sólido,
                                            identificando claramente las inferencias.
                                        </small>
                                    </span>
                                </label>

                                <label
                                    className={
                                        form.analysisApproach === "verified"
                                            ? "analysis-option analysis-option--selected"
                                            : "analysis-option"
                                    }
                                >
                                    <input
                                        type="radio"
                                        name="analysisApproach"
                                        value="verified"
                                        checked={
                                            form.analysisApproach ===
                                            "verified"
                                        }
                                        disabled={isStreaming}
                                        onChange={() =>
                                            setField(
                                                "analysisApproach",
                                                "verified"
                                            )
                                        }
                                    />

                                    <span className="analysis-option__control" />

                                    <span className="analysis-option__content">
                                        <strong>
                                            Estrictamente verificado
                                        </strong>

                                        <small>
                                            Incluye únicamente afirmaciones confirmables y
                                            señala cualquier información no verificada.
                                        </small>
                                    </span>
                                </label>
                            </div>

                            {formErrors.analysisApproach && (
                                <span className="field-error">
                                    {formErrors.analysisApproach}
                                </span>
                            )}
                        </fieldset>

                        <div className="optional-fields">
                            <div className="optional-fields__heading">
                                <strong>Contexto complementario</strong>
                                <span>Opcional</span>
                            </div>

                            <Field
                                label="Sector o industria"
                                helpText="Ayuda a contextualizar regulaciones, prioridades y lenguaje comercial."
                            >
                                <select
                                    value={form.sector}
                                    onChange={(event) =>
                                        setField("sector", event.target.value)
                                    }
                                    disabled={isStreaming}
                                >
                                    <option value="">
                                        Seleccionar sector...
                                    </option>

                                    {sectorOptions.map((item) => (
                                        <option
                                            key={item}
                                            value={item}
                                        >
                                            {item}
                                        </option>
                                    ))}
                                </select>
                            </Field>

                            <Field
                                label="Contexto adicional de la oportunidad"
                                helpText="Incluye restricciones, antecedentes, fechas, requisitos técnicos o información conocida del proceso de compra."
                            >
                                <textarea
                                    value={form.additionalContext}
                                    onChange={(event) =>
                                        setField(
                                            "additionalContext",
                                            event.target.value
                                        )
                                    }
                                    disabled={isStreaming}
                                    rows={4}
                                    placeholder="Ej.: El cliente ya utiliza Microsoft 365, exige residencia de datos y espera una demostración funcional."
                                />
                            </Field>
                        </div>

                        <div className="attachment-section">
                            <div className="attachment-section__heading">
                                <div>
                                    <strong>Archivos de referencia</strong>
                                    <span>Opcional</span>
                                </div>

                                {selectedFiles.length > 0 && (
                                    <button
                                        type="button"
                                        className="clear-files-button"
                                        onClick={clearSelectedFiles}
                                        disabled={isStreaming}
                                    >
                                        Quitar todos
                                    </button>
                                )}
                            </div>

                            <input
                                ref={fileInputRef}
                                className="visually-hidden-file-input"
                                type="file"
                                multiple
                                accept="image/png,image/jpeg,image/gif,image/webp,application/pdf,text/plain,text/markdown,text/csv,application/json,text/html,application/xml,text/xml,.md,.markdown,.txt,.csv,.json,.html,.htm,.xml,.pdf"
                                onChange={handleFileInputChange}
                                disabled={isStreaming}
                            />

                            <div
                                className={
                                    isDraggingFiles
                                        ? "upload-box upload-box--active"
                                        : "upload-box"
                                }
                                role="button"
                                tabIndex={isStreaming ? -1 : 0}
                                aria-label="Seleccionar o arrastrar archivos de referencia"
                                onClick={() => {
                                    if (!isStreaming) {
                                        fileInputRef.current?.click();
                                    }
                                }}
                                onKeyDown={(event) => {
                                    if (
                                        !isStreaming &&
                                        (event.key === "Enter" || event.key === " ")
                                    ) {
                                        event.preventDefault();
                                        fileInputRef.current?.click();
                                    }
                                }}
                                onDragEnter={(event) => {
                                    event.preventDefault();
                                    if (!isStreaming) setIsDraggingFiles(true);
                                }}
                                onDragOver={(event) => {
                                    event.preventDefault();
                                    if (!isStreaming) setIsDraggingFiles(true);
                                }}
                                onDragLeave={(event) => {
                                    event.preventDefault();
                                    if (event.currentTarget === event.target) {
                                        setIsDraggingFiles(false);
                                    }
                                }}
                                onDrop={handleFileDrop}
                                aria-disabled={isStreaming}
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
                                        <div className="selected-file" key={`${file.name}-${file.size}-${file.lastModified}`}>
                                            <span className="selected-file__icon" aria-hidden="true">
                                                {file.type.startsWith("image/") ? "IMG" : "DOC"}
                                            </span>
                                            <span className="selected-file__content">
                                                <strong title={file.name}>{file.name}</strong>
                                                <small>{formatFileSize(file.size)}</small>
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => removeSelectedFile(index)}
                                                disabled={isStreaming}
                                                aria-label={`Quitar ${file.name}`}
                                            >
                                                ×
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <button
                            type="button"
                            className="dark-btn prepare-prompt-button"
                            disabled={
                                isStreaming || !canPreparePrompt
                            }
                            onClick={prepareBattlecardPrompt}
                        >
                            Preparar solicitud
                            <span aria-hidden="true">→</span>
                        </button>

                        {!canPreparePrompt && (
                            <p className="form-hint">
                                Completa las cinco preguntas obligatorias para preparar la solicitud.
                            </p>
                        )}

                        {hasPreparedPrompt && (
                            <div
                                className="prompt-ready"
                                role="status"
                            >
                                <strong>Solicitud preparada</strong>

                                <span>
                                    Revisa el contenido en el cuadro del chat y presiona Enviar cuando estés de acuerdo.
                                </span>
                            </div>
                        )}
                    </div>
                </aside>

                <section className="card chat-panel">
                    <div className="chat-head">
                        <div>
                            <strong>Leitner IA</strong>
                            <small>Chat libre y generación guiada de Battlecards · CONSEIN</small>
                        </div>

                        <div className="chat-actions">
                            <span className="online-pill">● En línea</span>
                            <button onClick={resetConversation} disabled={isStreaming}>
                                Reiniciar
                            </button>
                        </div>
                    </div>

                    <div className="mode-info">
                        <div>
                            <strong>
                                Conversación libre o solicitud guiada
                            </strong>

                            <p>
                                Escribe directamente al agente o utiliza el formulario para
                                preparar una solicitud estructurada y editable.
                            </p>
                        </div>

                        {hasPreparedPrompt && (
                            <span className="prepared-prompt-badge">
                                Solicitud preparada
                            </span>
                        )}
                    </div>

                    <div className="chat-body">
                        {messages.map((message) => (
                            <div
                                key={message.id}
                                className={`msg ${message.role}`}
                            >
                                <MarkdownMessage content={message.text} />
                            </div>
                        ))}

                        {isPreparingAttachments && (
                            <div className="tool-status">
                                <span className="pulse-dot" />
                                Preparando archivos adjuntos...
                            </div>
                        )}
                        {toolStatus && (
                            <div className="tool-status">
                                <span className="pulse-dot" />
                                {toolStatus}
                            </div>
                        )}

                        {isStreaming && (
                            <div className="typing-row">
                                <span />
                                <span />
                                <span />
                            </div>
                        )}

                        <div ref={chatEndRef} />
                    </div>

                    {annotations.length > 0 && (
                        <div className="annotations-row">
                            <strong>Referencias detectadas</strong>
                            <div>
                                {annotations.slice(0, 4).map((annotation, index) => (
                                    <span key={`${annotation.label || "annotation"}-${index}`}>
                                        {annotation.label || annotation.url || annotation.fileId || "Referencia"}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="quick-row">
                        {quickPrompts.map((item) => (
                            <button
                                key={item}
                                disabled={isStreaming}
                                onClick={() => {
                                    setChatInput(item);
                                    setHasPreparedPrompt(false);
                                }}
                            >
                                {item}
                            </button>
                        ))}
                    </div>

                    <div
                        className={
                            hasPreparedPrompt
                                ? "chat-input-area chat-input-area--prepared"
                                : "chat-input-area"
                        }
                    >
                        {hasPreparedPrompt && (
                            <div className="prepared-prompt-notice">
                                <div>
                                    <strong>
                                        Prompt estructurado listo para revisión
                                    </strong>

                                    <span>
                                        Puedes modificar cualquier parte antes de enviarlo.
                                    </span>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => {
                                        setChatInput("");
                                        setHasPreparedPrompt(false);
                                    }}
                                    disabled={isStreaming}
                                >
                                    Descartar
                                </button>
                            </div>
                        )}

                        <div className="chat-input-row">
                            <textarea
                                value={chatInput}
                                onChange={(event) => {
                                    setChatInput(event.target.value);

                                    if (hasPreparedPrompt) {
                                        setHasPreparedPrompt(true);
                                    }
                                }}
                                disabled={isStreaming}
                                placeholder="Escribe una solicitud libre para Leitner IA..."
                                rows={hasPreparedPrompt ? 10 : 3}
                                onKeyDown={(event) => {
                                    if (
                                        event.key === "Enter" &&
                                        !event.shiftKey &&
                                        !hasPreparedPrompt
                                    ) {
                                        event.preventDefault();
                                        void sendChatMessage();
                                    }
                                }}
                            />

                            <div className="input-actions">
                                <button
                                    type="button"
                                    className="attach-chat-button"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={isStreaming}
                                    aria-label="Adjuntar archivos al mensaje"
                                    title="Adjuntar archivos"
                                >
                                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                        <path d="M21.4 11.6l-8.9 8.9a6 6 0 01-8.5-8.5l9.2-9.2a4 4 0 015.7 5.7l-9.2 9.2a2 2 0 01-2.8-2.8l8.5-8.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                    <span>{selectedFiles.length > 0 ? selectedFiles.length : ""}</span>
                                </button>
                                {isStreaming ? (
                                    <button
                                        type="button"
                                        className="cancel-btn"
                                        onClick={cancelStreaming}
                                    >
                                        Cancelar
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        className="dark-btn"
                                        onClick={sendChatMessage}
                                        disabled={!chatInput.trim()}
                                    >
                                        Enviar
                                    </button>
                                )}
                            </div>
                        </div>

                        <small className="chat-input-help">
                            {hasPreparedPrompt
                                ? "Revisa la solicitud completa. En este modo debes usar el botón Enviar."
                                : selectedFiles.length > 0
                                    ? `${selectedFiles.length} archivo(s) se enviarán con el mensaje.`
                                    : "Presiona Enter para enviar o Shift + Enter para crear una nueva línea."}
                        </small>
                    </div>
                </section>
            </section>

            <style>{`
        .agent-top {
          background: #081527;
          color: #fff;
          padding: 22px 0;
          border-bottom: 1px solid rgba(124,188,227,.12);
        }

        .agent-top-inner {
          display: flex;
          justify-content: space-between;
          gap: 20px;
          align-items: center;
        }

        .agent-top h1 {
          margin: 0;
          font-size: 22px;
          line-height: 1.15;
        }

        .agent-top p {
          margin: 4px 0 0;
          color: rgba(255,255,255,.55);
          font-size: 13px;
          line-height: 1.5;
        }

        .agent-badges {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .agent-badges span {
          border: 1px solid rgba(124,188,227,.25);
          color: rgba(255,255,255,.6);
          border-radius: 999px;
          padding: 5px 12px;
          font: 12px "JetBrains Mono";
        }

        .agent-layout {
        display: grid;
        grid-template-columns: minmax(390px, 440px) minmax(0, 1fr);
        gap: 22px;
        padding-top: 22px;
        padding-bottom: 40px;
        align-items: start;
        }

        .form-panel {
        overflow: hidden;
        position: sticky;
        top: 78px;
        max-height: calc(100vh - 98px);
        display: flex;
        flex-direction: column;
        }

        .form-head {
        flex: 0 0 auto;
        min-height: 76px;
        padding: 18px 20px;
        background: linear-gradient(135deg, #123263, #081f3e);
        color: #ffffff;
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 14px;
        }

        .form-head strong,
        .form-head small {
        display: block;
        }

        .form-head strong {
        font-size: 15px;
        line-height: 1.3;
        }

        .form-head small {
        max-width: 275px;
        margin-top: 5px;
        color: rgba(255, 255, 255, 0.66);
        font-size: 11px;
        line-height: 1.45;
        }

        .form-progress {
        flex: 0 0 auto;
        border: 1px solid rgba(124, 188, 227, 0.24);
        border-radius: 999px;
        padding: 5px 10px;
        background: rgba(124, 188, 227, 0.1);
        color: #a7d9f8;
        font-size: 10px;
        font-weight: 800;
        white-space: nowrap;
        }

        .form-body {
        padding: 20px;
        display: flex;
        flex-direction: column;
        gap: 20px;
        overflow-y: auto;
        overscroll-behavior: contain;
        }

        .form-introduction {
        border: 1px solid rgba(0, 91, 150, 0.12);
        border-radius: 10px;
        padding: 13px 14px;
        background: #f5f9fd;
        }

        .form-introduction strong {
        display: block;
        color: #123263;
        font-size: 12px;
        }

        .form-introduction p {
        margin: 5px 0 0;
        color: #64748b;
        font-size: 11px;
        line-height: 1.5;
        }

        .field {
        display: flex;
        flex-direction: column;
        gap: 7px;
        }

        .field label {
        color: #123263;
        font-size: 12px;
        font-weight: 800;
        line-height: 1.4;
        }

        .required-indicator {
        color: #dc2626;
        }

        .field-help {
        margin-top: -3px;
        color: #718096;
        font-size: 10px;
        line-height: 1.45;
        }

        .field input,
        .field textarea,
        .field select {
        width: 100%;
        border: 1px solid #d8e2ec;
        border-radius: 9px;
        padding: 10px 12px;
        background: #f8fafc;
        color: #061226;
        font-size: 12px;
        line-height: 1.5;
        outline: none;
        transition:
            border-color 150ms ease,
            background-color 150ms ease,
            box-shadow 150ms ease;
        }

        .field textarea {
        min-height: 84px;
        resize: vertical;
        }

        .field input:focus,
        .field textarea:focus,
        .field select:focus {
        border-color: #7cbce3;
        background: #ffffff;
        box-shadow: 0 0 0 3px rgba(124, 188, 227, 0.14);
        }

        .field input:disabled,
        .field textarea:disabled,
        .field select:disabled {
        cursor: not-allowed;
        opacity: 0.65;
        }

        .field--error input,
        .field--error textarea,
        .field--error select {
        border-color: #fca5a5;
        background: #fffafa;
        }

        .field-error {
        color: #b91c1c;
        font-size: 10px;
        font-weight: 650;
        line-height: 1.4;
        }

        .analysis-fieldset {
        min-width: 0;
        margin: 0;
        padding: 0;
        border: 0;
        }

        .analysis-fieldset legend {
        padding: 0;
        color: #123263;
        font-size: 12px;
        font-weight: 800;
        line-height: 1.4;
        }

        .analysis-fieldset legend span {
        color: #dc2626;
        }

        .analysis-description {
        margin: 5px 0 10px;
        color: #718096;
        font-size: 10px;
        line-height: 1.45;
        }

        .analysis-options {
        display: grid;
        gap: 9px;
        }

        .analysis-option {
        position: relative;
        display: grid;
        grid-template-columns: 18px minmax(0, 1fr);
        gap: 10px;
        align-items: start;
        border: 1px solid #d8e2ec;
        border-radius: 10px;
        padding: 12px;
        background: #f8fafc;
        cursor: pointer;
        transition:
            border-color 150ms ease,
            background-color 150ms ease,
            box-shadow 150ms ease;
        }

        .analysis-option:hover {
        border-color: #aacde5;
        background: #f4f9fd;
        }

        .analysis-option--selected {
        border-color: #337ead;
        background: #eef7fc;
        box-shadow: 0 0 0 2px rgba(0, 91, 150, 0.08);
        }

        .analysis-option input {
        position: absolute;
        opacity: 0;
        pointer-events: none;
        }

        .analysis-option__control {
        width: 17px;
        height: 17px;
        margin-top: 2px;
        border: 2px solid #94a3b8;
        border-radius: 50%;
        background: #ffffff;
        box-shadow: inset 0 0 0 3px #ffffff;
        }

        .analysis-option--selected .analysis-option__control {
        border-color: #005b96;
        background: #005b96;
        }

        .analysis-option__content strong {
        display: block;
        color: #17263a;
        font-size: 11px;
        line-height: 1.4;
        }

        .analysis-option__content small {
        display: block;
        margin-top: 3px;
        color: #64748b;
        font-size: 10px;
        line-height: 1.45;
        }

        .optional-fields {
        border-top: 1px solid #e5edf4;
        padding-top: 18px;
        display: flex;
        flex-direction: column;
        gap: 18px;
        }

        .optional-fields__heading {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        }

        .optional-fields__heading strong {
        color: #123263;
        font-size: 12px;
        }

        .optional-fields__heading span {
        border-radius: 999px;
        padding: 4px 8px;
        background: #eef2f6;
        color: #718096;
        font-size: 9px;
        font-weight: 800;
        text-transform: uppercase;
        }

        .attachment-section {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .attachment-section__heading {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .attachment-section__heading > div {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .attachment-section__heading strong {
          color: #123263;
          font-size: 12px;
        }
        .attachment-section__heading span {
          border-radius: 999px;
          padding: 3px 7px;
          background: #eef2f6;
          color: #718096;
          font-size: 9px;
          font-weight: 800;
          text-transform: uppercase;
        }
        .clear-files-button {
          border: 0;
          background: transparent;
          color: #64748b;
          padding: 4px;
          font-size: 10px;
          font-weight: 750;
        }
        .clear-files-button:hover { color: #b91c1c; }
        .visually-hidden-file-input {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
          border: 0;
        }
        .upload-box {
          border: 1.5px dashed #b9cad9;
          border-radius: 11px;
          padding: 17px 14px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 5px;
          background: #f8fafc;
          text-align: center;
          cursor: pointer;
          outline: none;
          transition: border-color 150ms ease, background-color 150ms ease, box-shadow 150ms ease;
        }
        .upload-box:hover,
        .upload-box:focus-visible,
        .upload-box--active {
          border-color: #4389b5;
          background: #eef7fc;
          box-shadow: 0 0 0 3px rgba(124, 188, 227, 0.14);
        }
        .upload-box[aria-disabled="true"] {
          cursor: not-allowed;
          opacity: 0.65;
        }
        .upload-box__icon {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: #e8f2fa;
          color: #005b96;
        }
        .upload-box strong { color: #334155; font-size: 11px; }
        .upload-box > span:not(.upload-box__icon) { color: #64748b; font-size: 10px; line-height: 1.4; }
        .upload-box small { max-width: 340px; color: #8492a3; font-size: 9px; line-height: 1.45; }
        .attachment-errors {
          border: 1px solid #fecaca;
          border-radius: 9px;
          padding: 10px 11px;
          background: #fef2f2;
          color: #991b1b;
        }
        .attachment-errors strong { display: block; font-size: 10px; }
        .attachment-errors ul { margin: 5px 0 0; padding-left: 17px; }
        .attachment-errors li { font-size: 9px; line-height: 1.5; }
        .selected-files { display: grid; gap: 8px; }
        .selected-file {
          min-width: 0;
          display: grid;
          grid-template-columns: 34px minmax(0, 1fr) 28px;
          gap: 9px;
          align-items: center;
          border: 1px solid #dbe7f0;
          border-radius: 9px;
          padding: 8px;
          background: #ffffff;
        }
        .selected-file__icon {
          width: 34px;
          height: 34px;
          border-radius: 8px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: #edf5fb;
          color: #005b96;
          font-size: 8px;
          font-weight: 900;
        }
        .selected-file__content { min-width: 0; }
        .selected-file__content strong,
        .selected-file__content small { display: block; }
        .selected-file__content strong {
          overflow: hidden;
          color: #334155;
          font-size: 10px;
          line-height: 1.35;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .selected-file__content small { margin-top: 2px; color: #8492a3; font-size: 9px; }
        .selected-file > button {
          width: 28px;
          height: 28px;
          border: 0;
          border-radius: 7px;
          background: transparent;
          color: #64748b;
          font-size: 18px;
          line-height: 1;
        }
        .selected-file > button:hover { background: #fef2f2; color: #b91c1c; }
        .attach-chat-button {
          position: relative;
          min-width: 42px;
          height: 42px;
          border: 1px solid #d8e2ec;
          border-radius: 10px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: #f8fafc;
          color: #005b96;
        }
        .attach-chat-button:hover { border-color: #7cbce3; background: #eef7fc; }
        .attach-chat-button span:not(:empty) {
          position: absolute;
          top: -6px;
          right: -6px;
          min-width: 18px;
          height: 18px;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: #8cc63f;
          color: #ffffff;
          font-size: 9px;
          font-weight: 900;
        }
        .prepare-prompt-button {
        width: 100%;
        min-height: 44px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 9px;
        }

        .prepare-prompt-button span {
        transition: transform 150ms ease;
        }

        .prepare-prompt-button:hover span {
        transform: translateX(3px);
        }

        .form-hint {
        margin: -10px 0 0;
        color: #8492a3;
        font-size: 10px;
        line-height: 1.45;
        text-align: center;
        }

        .prompt-ready {
        border: 1px solid #bbf7d0;
        border-radius: 10px;
        padding: 11px 12px;
        background: #f0fdf4;
        }

        .prompt-ready strong,
        .prompt-ready span {
        display: block;
        }

        .prompt-ready strong {
        color: #166534;
        font-size: 11px;
        }

        .prompt-ready span {
        margin-top: 3px;
        color: #3f6f4c;
        font-size: 10px;
        line-height: 1.45;
        }

        .chat-panel {
          min-width: 0;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          min-height: calc(100vh - 122px);
        }

        .chat-head {
          padding: 16px 20px;
          display: flex;
          justify-content: space-between;
          gap: 16px;
          border-bottom: 1px solid #dde6ef;
          align-items: start;
        }

        .chat-head strong,
        .chat-head small {
          display: block;
        }

        .chat-head strong {
          font-size: 14px;
        }

        .chat-head small {
          color: #53637a;
          margin-top: 4px;
          line-height: 1.45;
        }

        .chat-actions {
          display: flex;
          gap: 8px;
          align-items: center;
          flex-wrap: wrap;
          justify-content: flex-end;
        }

        .online-pill {
          background: #dcfce7;
          color: #15803d;
          border-radius: 999px;
          padding: 5px 12px;
          font-size: 12px;
          font-weight: 800;
          white-space: nowrap;
        }

        .chat-actions button {
          border: 1px solid #dde6ef;
          background: #f6f9fc;
          color: #334155;
          border-radius: 999px;
          padding: 6px 12px;
          font-size: 12px;
          font-weight: 700;
        }

        .chat-actions button:disabled {
          cursor: not-allowed;
          opacity: .55;
        }

        .mode-info {
        padding: 14px 20px;
        background: #f8fbfe;
        border-bottom: 1px solid #dde6ef;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        }

        .prepared-prompt-badge {
        flex: 0 0 auto;
        border: 1px solid #bbf7d0;
        border-radius: 999px;
        padding: 5px 10px;
        background: #f0fdf4;
        color: #15803d;
        font-size: 10px;
        font-weight: 800;
        }

        .chat-input-area {
        border-top: 1px solid #dde6ef;
        background: #ffffff;
        }

        .chat-input-area--prepared {
        background: #fbfefc;
        }

        .prepared-prompt-notice {
        margin: 14px 18px 0;
        border: 1px solid #bbf7d0;
        border-radius: 10px;
        padding: 10px 12px;
        background: #f0fdf4;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
        }

        .prepared-prompt-notice strong,
        .prepared-prompt-notice span {
        display: block;
        }

        .prepared-prompt-notice strong {
        color: #166534;
        font-size: 11px;
        }

        .prepared-prompt-notice span {
        margin-top: 3px;
        color: #4b7356;
        font-size: 10px;
        }

        .prepared-prompt-notice button {
        border: 1px solid #bbf7d0;
        border-radius: 999px;
        padding: 6px 10px;
        background: #ffffff;
        color: #166534;
        font-size: 10px;
        font-weight: 800;
        }

        .chat-input-row {
        border-top: 0;
        }

        .chat-input-area--prepared .chat-input-row textarea {
        min-height: 230px;
        max-height: 380px;
        font-family: "JetBrains Mono", monospace;
        font-size: 11px;
        line-height: 1.65;
        }

        .chat-input-help {
        display: block;
        padding: 0 18px 12px;
        color: #8a98a8;
        font-size: 10px;
        line-height: 1.4;
        }

        .mode-info strong {
          display: block;
          font-size: 13px;
          color: #061226;
        }

        .mode-info p {
          margin: 4px 0 0;
          color: #53637a;
          font-size: 12px;
          line-height: 1.45;
        }

        .chat-body {
          min-width: 0;
          flex: 1;
          padding: 18px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          overflow-y: auto;
          overflow-x: hidden;
          min-height: 360px;
          max-height: calc(100vh - 390px);
        }

        .msg {
          min-width: 0;
          max-width: 84%;
          padding: 12px 14px;
          border-radius: 14px;
          font-size: 13px;
          line-height: 1.65;
          white-space: normal;
          overflow-wrap: anywhere;
          word-break: break-word;
        }

        .msg span {
            min-width: 0;
            overflow-wrap: anywhere;
            word-break: break-word;
        }

        .msg.agent {
          align-self: flex-start;
          background: #f5f8fb;
          border: 1px solid #dde6ef;
          color: #334155;
          border-top-left-radius: 4px;
        }

        .msg.user {
          align-self: flex-end;
          background: linear-gradient(135deg, #005b96, #123263);
          color: #fff;
          border-top-right-radius: 4px;
        }

        .msg.system {
          align-self: center;
          background: #fff7ed;
          border: 1px solid #fed7aa;
          color: #9a3412;
          max-width: 92%;
        }

        .markdown-message {
          min-width: 0;
          max-width: 100%;
          overflow-wrap: anywhere;
          word-break: break-word;
        }

        .markdown-message > :first-child {
          margin-top: 0;
        }

        .markdown-message > :last-child {
          margin-bottom: 0;
        }

        .markdown-message p {
          margin: 0 0 10px;
          line-height: 1.7;
        }

        .markdown-message h1,
        .markdown-message h2,
        .markdown-message h3,
        .markdown-message h4 {
          color: #17263a;
          line-height: 1.25;
          letter-spacing: -0.015em;
          text-wrap: balance;
        }

        .markdown-message h1 {
          margin: 22px 0 12px;
          font-size: 23px;
        }

        .markdown-message h2 {
          margin: 20px 0 11px;
          padding-bottom: 7px;
          border-bottom: 1px solid #dce6ef;
          font-size: 20px;
        }

        .markdown-message h3 {
          margin: 18px 0 9px;
          font-size: 17px;
        }

        .markdown-message h4 {
          margin: 16px 0 8px;
          font-size: 15px;
        }

        .markdown-message ul,
        .markdown-message ol {
          margin: 8px 0 12px;
          padding-left: 24px;
        }

        .markdown-message li {
          margin: 5px 0;
          line-height: 1.65;
        }

        .markdown-message blockquote {
          margin: 12px 0;
          border-left: 4px solid #7cbce3;
          border-radius: 0 8px 8px 0;
          padding: 10px 14px;
          background: #edf6fc;
          color: #3f5268;
        }

        .markdown-message blockquote p {
          margin: 0;
        }

        .markdown-message code {
          border-radius: 5px;
          padding: 2px 5px;
          background: #e9eff5;
          color: #123263;
          font-family: "JetBrains Mono", monospace;
          font-size: 0.9em;
        }

        .markdown-message pre {
          max-width: 100%;
          margin: 12px 0;
          overflow-x: auto;
          border-radius: 10px;
          padding: 14px;
          background: #081527;
          color: #eaf4fb;
        }

        .markdown-message pre code {
          padding: 0;
          background: transparent;
          color: inherit;
        }

        .markdown-message hr {
          margin: 18px 0;
          border: 0;
          border-top: 1px solid #dce6ef;
        }

        .markdown-message strong {
          color: #17263a;
          font-weight: 800;
        }

        .markdown-message em {
          color: #475569;
        }

        .markdown-message a:not(.message-link--generated-file) {
          overflow-wrap: anywhere;
          word-break: break-word;
        }

        .markdown-message input[type="checkbox"] {
          margin-right: 7px;
          accent-color: #005b96;
        }

        .markdown-table-block {
          min-width: 0;
          max-width: 100%;
          margin: 14px 0 18px;
        }

        .markdown-table-hint {
          display: none;
          margin-top: 6px;
          color: #718096;
          font-size: 10px;
          line-height: 1.4;
        }

        .markdown-table-container {
          width: 100%;
          max-width: 100%;
          margin: 0;
          overflow-x: auto;
          overscroll-behavior-inline: contain;
          border: 1px solid #cfdbe6;
          border-radius: 12px;
          background: #ffffff;
          box-shadow: 0 3px 12px rgba(18, 50, 99, 0.06);
          scrollbar-width: thin;
          scrollbar-color: #9aabba #eef3f7;
        }

        .markdown-table-container:focus-visible {
          outline: 3px solid rgba(124, 188, 227, 0.38);
          outline-offset: 2px;
        }

        .markdown-table {
          width: max-content;
          min-width: 100%;
          border-collapse: separate;
          border-spacing: 0;
          color: #334155;
          font-size: 12px;
          line-height: 1.5;
          white-space: normal;
        }

        .markdown-table th,
        .markdown-table td {
          min-width: 150px;
          max-width: 300px;
          padding: 11px 13px;
          vertical-align: top;
          border-right: 1px solid #dce6ef;
          border-bottom: 1px solid #dce6ef;
          overflow-wrap: anywhere;
          word-break: normal;
        }

        .markdown-table th:first-child,
        .markdown-table td:first-child {
          min-width: 170px;
          font-weight: 750;
        }

        .markdown-table tbody td:first-child {
          position: sticky;
          left: 0;
          z-index: 1;
          background: #ffffff;
          box-shadow: 1px 0 0 #dce6ef;
        }

        .markdown-table tbody tr:nth-child(even) td:first-child {
          background: #f6f9fc;
        }

        .markdown-table tbody tr:hover td:first-child {
          background: #edf6fc;
        }

        .markdown-table th {
          position: sticky;
          top: 0;
          z-index: 1;
          background: #123263;
          color: #ffffff;
          font-weight: 800;
          text-align: left;
        }

        .markdown-table th:first-child {
          left: 0;
          z-index: 3;
          box-shadow: 1px 0 0 rgba(255, 255, 255, 0.18);
        }

        .markdown-table tbody tr:nth-child(even) td {
          background: #f6f9fc;
        }

        .markdown-table tbody tr:hover td {
          background: #edf6fc;
        }

        .markdown-table th:last-child,
        .markdown-table td:last-child {
          border-right: 0;
        }

        .markdown-table tbody tr:last-child td {
          border-bottom: 0;
        }

        .message-link--generated-file {
          display: inline-flex;
          align-items: center;
          max-width: 100%;
          box-sizing: border-box;
          margin: 4px 2px;
          border: 1px solid rgba(0, 91, 150, 0.22);
          border-radius: 8px;
          padding: 7px 11px;
          background: #eaf4fb;
          color: #005b96;
          font-weight: 800;
          line-height: 1.35;
          text-decoration: none;
          overflow-wrap: anywhere;
          word-break: break-word;
          transition:
            background-color 150ms ease,
            border-color 150ms ease,
            color 150ms ease;
        }

        .message-link--generated-file:hover {
          border-color: #7cbce3;
          background: #dceefa;
          color: #123263;
          text-decoration: underline;
        }

        .message-link--generated-file:focus-visible {
          outline: 3px solid rgba(124, 188, 227, 0.35);
          outline-offset: 2px;
        }


        .message-inline-link {
          color: #005b96;
          font-weight: 650;
          text-decoration: underline;
          text-decoration-thickness: 1px;
          text-underline-offset: 2px;
          overflow-wrap: anywhere;
          word-break: break-word;
        }

        .message-inline-link:hover {
          color: #123263;
        }

        .message-inline-link:focus-visible {
          border-radius: 3px;
          outline: 3px solid rgba(124, 188, 227, 0.35);
          outline-offset: 2px;
        }


        .msg.user .markdown-message h1,
        .msg.user .markdown-message h2,
        .msg.user .markdown-message h3,
        .msg.user .markdown-message h4 {
          color: #ffffff;
          border-bottom-color: rgba(255, 255, 255, 0.2);
        }

        .msg.user .message-inline-link {
          color: #d9f0ff;
        }

        .tool-status {
          align-self: flex-start;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: rgba(0,91,150,.06);
          border: 1px solid rgba(0,91,150,.14);
          color: #005b96;
          padding: 8px 12px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 700;
        }

        .tool-status .pulse-dot {
          width: 7px;
          height: 7px;
          border-radius: 999px;
          background: #8cc63f;
        }

        .typing-row {
          align-self: flex-start;
          display: inline-flex;
          gap: 5px;
          background: #f5f8fb;
          border: 1px solid #dde6ef;
          border-radius: 14px;
          border-top-left-radius: 4px;
          padding: 12px 14px;
        }

        .typing-row span {
          width: 6px;
          height: 6px;
          border-radius: 999px;
          background: #005b96;
          animation: pulse-dot 1.2s ease-in-out infinite;
        }

        .typing-row span:nth-child(2) {
          animation-delay: .15s;
        }

        .typing-row span:nth-child(3) {
          animation-delay: .3s;
        }

        .annotations-row {
          border-top: 1px solid #dde6ef;
          padding: 12px 18px;
          background: #fbfdff;
        }

        .annotations-row strong {
          display: block;
          font-size: 12px;
          margin-bottom: 8px;
          color: #334155;
        }

        .annotations-row div {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .annotations-row span {
          border: 1px solid #dde6ef;
          border-radius: 999px;
          padding: 5px 10px;
          font-size: 11px;
          color: #53637a;
          background: #fff;
        }

        .quick-row {
          border-top: 1px solid #dde6ef;
          padding: 12px 18px;
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .quick-row button,
        .secondary-local {
          border: 1px solid #dde6ef;
          background: #f5f8fb;
          border-radius: 999px;
          padding: 7px 13px;
          color: #334155;
          font-size: 12px;
          font-weight: 700;
        }

        .quick-row button:hover,
        .secondary-local:hover {
          border-color: #7cbce3;
          background: #ebf4fb;
          color: #005b96;
        }

        .quick-row button:disabled {
          cursor: not-allowed;
          opacity: .55;
        }

        .chat-input-row {
          border-top: 1px solid #dde6ef;
          padding: 14px 18px;
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 12px;
          align-items: end;
          background: #fff;
        }

        .chat-input-row textarea {
          min-height: 48px;
          max-height: 120px;
          resize: vertical;
          border: 1px solid #dde6ef;
          border-radius: 10px;
          background: #f6f9fc;
          color: #061226;
          padding: 11px 12px;
          outline: none;
          font-size: 13px;
          line-height: 1.5;
        }

        .chat-input-row textarea:focus {
          border-color: #7cbce3;
          background: #fff;
        }

        .input-actions {
          display: flex;
          gap: 8px;
        }

        .cancel-btn {
          border: 1px solid #fecaca;
          background: #fef2f2;
          color: #b91c1c;
          border-radius: 10px;
          padding: 13px 18px;
          font-size: 14px;
          font-weight: 800;
        }

        @media (max-width: 980px) {
          .agent-layout {
            grid-template-columns: 1fr;
          }

          .form-panel {
            position: static;
            max-height: none;
          }
          .form-body {
            overflow: visible;
          }

          .agent-top-inner {
            align-items: start;
            flex-direction: column;
          }

          .chat-panel {
            min-width: 0;
          }

          .chat-body {
            min-width: 0;
            overflow-x: hidden;
          }
        }

        @media (max-width: 640px) {
          .form-head {
            flex-direction: column;
          }
          .form-progress {
            align-self: flex-start;
          }
          .mode-info {
            align-items: flex-start;
            flex-direction: column;
          }
          .prepared-prompt-notice {
            align-items: flex-start;
            flex-direction: column;
          }
          .chat-input-area--prepared .chat-input-row textarea {
            min-height: 280px;
          }
          .markdown-table-hint {
            display: block;
          }

          .markdown-table {
            font-size: 11px;
          }

          .markdown-table th,
          .markdown-table td {
            min-width: 132px;
            max-width: 250px;
            padding: 9px 10px;
          }

          .markdown-table th:first-child,
          .markdown-table td:first-child {
            min-width: 145px;
          }

          .markdown-message h1 {
            font-size: 20px;
          }

          .markdown-message h2 {
            font-size: 18px;
          }

          .markdown-message h3 {
            font-size: 16px;
          }

          .analysis-option {
            padding: 11px;
          }
          .chat-head {
            flex-direction: column;
          }

          .chat-actions {
            justify-content: flex-start;
          }

          .chat-input-row {
            grid-template-columns: 1fr;
          }
          .input-actions {
            width: 100%;
          }
          .input-actions .dark-btn,
          .input-actions .cancel-btn {
            flex: 1;
          }
          .selected-file {
            grid-template-columns: 32px minmax(0, 1fr) 28px;
          }

        }
      `}</style>
        </main>
    );
}

function MarkdownMessage({
    content,
}: {
    content: string;
}) {
    return (
        <div className="markdown-message">
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    a({ href, children }) {
                        if (!href) {
                            return <>{children}</>;
                        }

                        const isGeneratedSharePointFile =
                            isConseinSharePointUrl(href);

                        return (
                            <a
                                className={
                                    isGeneratedSharePointFile
                                        ? "message-link message-link--generated-file"
                                        : "message-inline-link"
                                }
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={
                                    isGeneratedSharePointFile
                                        ? "Abrir archivo generado en SharePoint"
                                        : href
                                }
                            >
                                {isGeneratedSharePointFile
                                    ? "Abrir archivo generado"
                                    : children}
                            </a>
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
                                    <table className="markdown-table">
                                        {children}
                                    </table>
                                </div>
                                <small className="markdown-table-hint">
                                    Desliza horizontalmente para ver todas las columnas.
                                </small>
                            </div>
                        );
                    },
                }}
            >
                {content}
            </ReactMarkdown>
        </div>
    );
}


function isConseinSharePointUrl(value: string): boolean {
    try {
        const parsedUrl = new URL(value);

        return (
            parsedUrl.protocol === "https:" &&
            parsedUrl.hostname.toLowerCase() ===
            "conseincloud.sharepoint.com"
        );
    } catch {
        return false;
    }
}

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function Field({
    label,
    required,
    helpText,
    error,
    children,
}: {
    label: string;
    required?: boolean;
    helpText?: string;
    error?: string;
    children: ReactNode;
}) {
    return (
        <div
            className={
                error
                    ? "field field--error"
                    : "field"
            }
        >
            <label>
                {label}

                {required && (
                    <span
                        className="required-indicator"
                        aria-label="obligatorio"
                    >
                        {" "}*
                    </span>
                )}
            </label>

            {helpText && (
                <small className="field-help">
                    {helpText}
                </small>
            )}

            {children}

            {error && (
                <span
                    className="field-error"
                    role="alert"
                >
                    {error}
                </span>
            )}
        </div>
    );
}