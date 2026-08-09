import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Page } from "../App";
import { useAuth } from "../hooks/useAuth";
import {
    extractFirstDownloadUrl,
    streamAgentMessage,
    type AgentAnnotation,
} from "../services/agentStreamClient";
import { updateFormField } from "./agentConsoleForm";

interface Props {
    onNavigate: (page: Page, id?: number) => void;
}

type MessageRole = "user" | "agent" | "system";

interface ChatMessage {
    id: string;
    role: MessageRole;
    text: string;
}

interface BattlecardResult {
    fileName?: string;
    downloadUrl?: string;
    rawText?: string;
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

const servicioOptions = [
    "Migración a Microsoft Azure",
    "IA y automatización de procesos",
    "Ciberseguridad",
    "Modernización de infraestructura",
    "Microsoft 365",
    "Power Platform",
    "Gobierno de datos",
];

const productoOptions = [
    "Azure OpenAI",
    "Microsoft Copilot",
    "Power Automate",
    "Azure AI Search",
    "SharePoint",
    "Microsoft Defender",
    "Microsoft Fabric",
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

export default function AgentConsole({ onNavigate }: Props) {
    const { getAccessToken } = useAuth();

    const [form, setForm] = useState({
        empresa: "CONSEIN",
        competidor: "",
        sector: "",
        servicio: "",
        producto: "",
        contexto: "",
        objetivo: "",
    });

    const [messages, setMessages] = useState<ChatMessage[]>([
        {
            id: createId(),
            role: "agent",
            text:
                "Hola, soy Leitner IA. Puedes interactuar conmigo de dos formas: escribe libremente en el chat o completa el formulario para generar una Battlecard estructurada.",
        },
    ]);

    const [chatInput, setChatInput] = useState("");
    const [conversationId, setConversationId] = useState<string | null>(null);
    const [isStreaming, setIsStreaming] = useState(false);
    const [activeMode, setActiveMode] = useState<"chat" | "form" | null>(null);
    const [toolStatus, setToolStatus] = useState<string>("");
    const [result, setResult] = useState<BattlecardResult | null>(null);
    const [annotations, setAnnotations] = useState<AgentAnnotation[]>([]);

    const chatEndRef = useRef<HTMLDivElement | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, isStreaming]);

    const canGenerateFromForm = useMemo(() => {
        return Boolean(form.empresa.trim() && form.competidor.trim());
    }, [form.empresa, form.competidor]);

    const setField = (field: keyof typeof form, value: string) => {
        setForm((prev) => updateFormField(prev, field, value));
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

    const buildFormPrompt = () => {
        return `
Actúa como Leitner IA, agente de inteligencia competitiva de CONSEIN.

Genera una Battlecard competitiva usando la información siguiente:

Empresa principal: ${form.empresa || "CONSEIN"}
Empresa competidora: ${form.competidor}
Sector o rubro: ${form.sector || "No especificado"}
Servicio a comparar: ${form.servicio || "No especificado"}
Producto o solución: ${form.producto || "No especificado"}
Contexto de la oportunidad: ${form.contexto || "No especificado"}
Objetivo comercial: ${form.objetivo || "No especificado"}

Instrucciones obligatorias:
1. Si la información suministrada es suficiente, no hagas preguntas adicionales.
2. Usa el conocimiento disponible del agente, conocimiento web y herramientas conectadas si están disponibles.
3. Construye una Battlecard comercial accionable para equipos de ventas.
4. Incluye como mínimo:
   - Resumen ejecutivo.
   - Posicionamiento recomendado para CONSEIN.
   - Ventajas competitivas.
   - Riesgos o debilidades frente al competidor.
   - Objeciones probables del cliente.
   - Respuestas comerciales recomendadas.
   - Recomendaciones finales para la conversación comercial.
5. Si existe una herramienta para generar documento Word, PDF o archivo final, ejecútala.
6. Si generas un documento, devuelve claramente el nombre del archivo y el enlace de descarga.
7. Mantén la respuesta en español profesional, precisa y orientada a venta consultiva.

Resultado esperado:
Una Battlecard lista para revisión comercial.
`.trim();
    };

    const runAgent = async (message: string, mode: "chat" | "form") => {
        if (isStreaming) return;

        const trimmedMessage = message.trim();

        if (!trimmedMessage) {
            return;
        }

        setIsStreaming(true);
        setActiveMode(mode);
        setToolStatus("");
        setAnnotations([]);
        setResult(null);

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

            let streamedText = "";
            const collectedAnnotations: AgentAnnotation[] = [];

            await streamAgentMessage(
                {
                    message: trimmedMessage,
                    token,
                    conversationId,
                    imageDataUris: [],
                    fileDataUris: [],
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

            const downloadUrlFromText = extractFirstDownloadUrl(streamedText);
            const downloadUrlFromAnnotation = collectedAnnotations.find((item) => item.url)?.url;

            const downloadUrl = downloadUrlFromText || downloadUrlFromAnnotation;

            if (mode === "form" || downloadUrl) {
                setResult({
                    fileName: buildSuggestedFileName(),
                    downloadUrl: downloadUrl || undefined,
                    rawText: streamedText,
                });
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
            setIsStreaming(false);
            setActiveMode(null);
            setToolStatus("");
            abortControllerRef.current = null;
        }
    };

    const sendChatMessage = async () => {
        const text = chatInput.trim();

        if (!text || isStreaming) {
            return;
        }

        setChatInput("");
        addMessage("user", text);
        await runAgent(text, "chat");
    };

    const generateBattlecardFromForm = async () => {
        if (!canGenerateFromForm) {
            addMessage(
                "agent",
                "Para generar la Battlecard desde el formulario necesito al menos la empresa principal y la empresa competidora."
            );
            return;
        }

        const prompt = buildFormPrompt();

        addMessage(
            "user",
            `Generar Battlecard estructurada: ${form.empresa} vs ${form.competidor}`
        );

        await runAgent(prompt, "form");
    };

    const cancelStreaming = () => {
        abortControllerRef.current?.abort();
    };

    const resetConversation = () => {
        abortControllerRef.current?.abort();
        setConversationId(null);
        setMessages([
            {
                id: createId(),
                role: "agent",
                text:
                    "Conversación reiniciada. Puedes escribir una solicitud libre o completar el formulario para generar una Battlecard.",
            },
        ]);
        setChatInput("");
        setToolStatus("");
        setResult(null);
        setAnnotations([]);
    };

    const buildSuggestedFileName = () => {
        const competitor = form.competidor.trim() || "Competidor";
        const sanitizedCompetitor = competitor.replace(/[^\wáéíóúÁÉÍÓÚñÑ-]+/g, "_");

        return `Battlecard_${form.empresa || "CONSEIN"}_vs_${sanitizedCompetitor}_${new Date()
            .toISOString()
            .slice(0, 10)}.docx`;
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
                        <strong>Parámetros del análisis</strong>
                        <small>Completa el formulario para generar una Battlecard directa</small>
                    </div>

                    <div className="form-body">
                        <Field label="Empresa principal" required>
                            <input
                                value={form.empresa}
                                onChange={(event) => setField("empresa", event.target.value)}
                                disabled={isStreaming}
                                placeholder="CONSEIN"
                            />
                        </Field>

                        <Field label="Empresa competidora" required>
                            <input
                                value={form.competidor}
                                onChange={(event) => setField("competidor", event.target.value)}
                                disabled={isStreaming}
                                placeholder="Ej: IBM, Accenture, Oracle..."
                            />
                        </Field>

                        <Field label="Sector o rubro">
                            <select
                                value={form.sector}
                                onChange={(event) => setField("sector", event.target.value)}
                                disabled={isStreaming}
                            >
                                <option value="">Seleccionar sector...</option>
                                {sectorOptions.map((item) => (
                                    <option key={item} value={item}>
                                        {item}
                                    </option>
                                ))}
                            </select>
                        </Field>

                        <Field label="Servicio a comparar">
                            <select
                                value={form.servicio}
                                onChange={(event) => setField("servicio", event.target.value)}
                                disabled={isStreaming}
                            >
                                <option value="">Seleccionar servicio...</option>
                                {servicioOptions.map((item) => (
                                    <option key={item} value={item}>
                                        {item}
                                    </option>
                                ))}
                            </select>
                        </Field>

                        <Field label="Producto o solución">
                            <select
                                value={form.producto}
                                onChange={(event) => setField("producto", event.target.value)}
                                disabled={isStreaming}
                            >
                                <option value="">Seleccionar producto...</option>
                                {productoOptions.map((item) => (
                                    <option key={item} value={item}>
                                        {item}
                                    </option>
                                ))}
                            </select>
                        </Field>

                        <Field label="Contexto de la oportunidad">
                            <textarea
                                value={form.contexto}
                                onChange={(event) => setField("contexto", event.target.value)}
                                disabled={isStreaming}
                                placeholder="Describe el contexto de la oportunidad comercial..."
                            />
                        </Field>

                        <Field label="Objetivo comercial">
                            <input
                                value={form.objetivo}
                                onChange={(event) => setField("objetivo", event.target.value)}
                                disabled={isStreaming}
                                placeholder="Ej: Ganar licitación de infraestructura Azure..."
                            />
                        </Field>

                        <div className="upload-box" aria-disabled="true">
                            <div>⇧</div>
                            <span>PDF, Word, Excel o PowerPoint</span>
                            <small>Preparado visualmente. La carga real se integra en una fase posterior.</small>
                        </div>

                        <button
                            className="dark-btn generate-btn"
                            disabled={isStreaming || !canGenerateFromForm}
                            onClick={generateBattlecardFromForm}
                        >
                            {isStreaming && activeMode === "form"
                                ? "Generando Battlecard..."
                                : "→ Generar Battlecard"}
                        </button>

                        {!canGenerateFromForm && (
                            <p className="form-hint">
                                Indica al menos el competidor para habilitar la generación directa.
                            </p>
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
                            <strong>Dos formas de trabajar</strong>
                            <p>
                                Usa el chat para conversar con el agente o completa el formulario para enviar una solicitud estructurada.
                            </p>
                        </div>
                    </div>

                    <div className="chat-body">
                        {messages.map((message) => (
                            <div key={message.id} className={`msg ${message.role}`}>
                                {message.text}
                            </div>
                        ))}

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

                    {result && (
                        <div className="result-box">
                            <div>
                                <strong>Resultado de Battlecard</strong>
                                <p>{result.fileName || "Battlecard generada por Leitner IA"}</p>
                            </div>

                            <div className="result-actions">
                                {result.downloadUrl ? (
                                    <a className="primary-btn result-link" href={result.downloadUrl} target="_blank" rel="noreferrer">
                                        Descargar Battlecard
                                    </a>
                                ) : (
                                    <button className="primary-btn" disabled>
                                        Enlace no disponible
                                    </button>
                                )}

                                <button className="secondary-local" onClick={() => onNavigate("detail", 1)}>
                                    Ver demo de detalle
                                </button>
                            </div>

                            {!result.downloadUrl && (
                                <small>
                                    El agente respondió, pero no devolvió URL de descarga. Si esperas documento final, valida que la herramienta MCP o Power Automate devuelva explícitamente el enlace.
                                </small>
                            )}
                        </div>
                    )}

                    <div className="quick-row">
                        {quickPrompts.map((item) => (
                            <button
                                key={item}
                                disabled={isStreaming}
                                onClick={() => setChatInput(item)}
                            >
                                {item}
                            </button>
                        ))}
                    </div>

                    <div className="chat-input-row">
                        <textarea
                            value={chatInput}
                            onChange={(event) => setChatInput(event.target.value)}
                            disabled={isStreaming}
                            placeholder="Escribe una solicitud libre para Leitner IA..."
                            onKeyDown={(event) => {
                                if (event.key === "Enter" && !event.shiftKey) {
                                    event.preventDefault();
                                    void sendChatMessage();
                                }
                            }}
                        />

                        <div className="input-actions">
                            {isStreaming ? (
                                <button className="cancel-btn" onClick={cancelStreaming}>
                                    Cancelar
                                </button>
                            ) : (
                                <button className="dark-btn" onClick={sendChatMessage} disabled={!chatInput.trim()}>
                                    Enviar
                                </button>
                            )}
                        </div>
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
          grid-template-columns: 320px minmax(0, 1fr);
          gap: 18px;
          padding-top: 22px;
          padding-bottom: 40px;
          align-items: start;
        }

        .form-panel {
          overflow: hidden;
          position: sticky;
          top: 78px;
        }

        .form-head {
          padding: 20px;
          background: #123263;
          color: #fff;
        }

        .form-head strong,
        .form-head small {
          display: block;
        }

        .form-head strong {
          font-size: 14px;
        }

        .form-head small {
          color: rgba(255,255,255,.62);
          margin-top: 5px;
          line-height: 1.45;
        }

        .form-body {
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 15px;
        }

        .upload-box {
          border: 1.5px dashed #dde6ef;
          border-radius: 10px;
          background: #f6f9fc;
          color: #7cbce3;
          text-align: center;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 4px;
          cursor: not-allowed;
          opacity: .78;
        }

        .upload-box div {
          font-size: 17px;
        }

        .upload-box span {
          color: #53637a;
          font-size: 12px;
        }

        .upload-box small {
          color: #9aa6b2;
          font-size: 11px;
          line-height: 1.35;
        }

        .generate-btn {
          width: 100%;
        }

        .form-hint {
          margin: -4px 0 0;
          color: #8a98a8;
          font-size: 12px;
          line-height: 1.35;
        }

        .chat-panel {
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
          flex: 1;
          padding: 18px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          overflow: auto;
          min-height: 360px;
          max-height: calc(100vh - 390px);
        }

        .msg {
          max-width: 84%;
          padding: 12px 14px;
          border-radius: 14px;
          font-size: 13px;
          line-height: 1.65;
          white-space: pre-wrap;
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

        .result-box {
          margin: 0 18px 14px;
          border-radius: 12px;
          border: 1px solid #dde6ef;
          padding: 16px;
          background: #f8fbfe;
        }

        .result-box strong {
          display: block;
          font-size: 14px;
        }

        .result-box p {
          color: #53637a;
          font-family: "JetBrains Mono";
          font-size: 12px;
          margin: 6px 0 14px;
          word-break: break-word;
        }

        .result-box small {
          display: block;
          margin-top: 10px;
          color: #8a98a8;
          line-height: 1.45;
        }

        .result-actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }

        .result-link {
          text-decoration: none;
          display: inline-flex;
          align-items: center;
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
          }

          .agent-top-inner {
            align-items: start;
            flex-direction: column;
          }

          .chat-panel {
            min-height: 620px;
          }

          .chat-body {
            max-height: none;
          }
        }

        @media (max-width: 640px) {
          .chat-head {
            flex-direction: column;
          }

          .chat-actions {
            justify-content: flex-start;
          }

          .chat-input-row {
            grid-template-columns: 1fr;
          }

          .msg {
            max-width: 94%;
          }
        }
      `}</style>
        </main>
    );
}

function Field({
    label,
    required,
    children,
}: {
    label: string;
    required?: boolean;
    children: ReactNode;
}) {
    return (
        <div className="field">
            <label>
                {label}
                {required && <span style={{ color: "#ef4444" }}> *</span>}
            </label>
            {children}
        </div>
    );
}