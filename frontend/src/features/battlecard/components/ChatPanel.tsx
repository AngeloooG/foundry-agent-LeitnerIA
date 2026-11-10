import { useEffect } from "react";

import { SafeMarkdown } from "../../../components/markdown/SafeMarkdown";
import { useAutoScroll } from "../hooks/useAutoScroll";
import { useFilePicker } from "../hooks/useFilePicker";
import { QUICK_PROMPTS } from "../model/consoleContent";
import { useAgentConsole } from "../state/AgentConsoleProvider";

/** Conversation with the agent: messages, progress, references, quick prompts and the composer. */
export function ChatPanel() {
    const { state, actions } = useAgentConsole();
    const { messages, annotations, chatInput, hasPreparedPrompt, selectedFiles, status, toolStatus } = state;
    const isBusy = status !== "idle";
    const lastMessage = messages[messages.length - 1];
    const { containerRef, onScroll, scrollToBottom } = useAutoScroll<HTMLDivElement>(
        `${messages.length}:${lastMessage?.text.length ?? 0}:${status}`
    );
    const { open: openFilePicker } = useFilePicker();

    // When the form prepares a prompt, bring the composer into view.
    useEffect(() => {
        if (hasPreparedPrompt) scrollToBottom();
    }, [hasPreparedPrompt, scrollToBottom]);

    return (
        <section className="card chat-panel">
            <div className="chat-head">
                <div>
                    <strong>Leitner IA</strong>
                    <small>Chat libre y generación guiada de Battlecards · CONSEIN</small>
                </div>

                <div className="chat-actions">
                    <span className="online-pill">● En línea</span>
                    <button type="button" onClick={actions.reset} disabled={isBusy}>
                        Reiniciar
                    </button>
                </div>
            </div>

            <div className="mode-info">
                <div>
                    <strong>Conversación libre o solicitud guiada</strong>
                    <p>
                        Escribe directamente al agente o utiliza el formulario para
                        preparar una solicitud estructurada y editable.
                    </p>
                </div>
                {hasPreparedPrompt && <span className="prepared-prompt-badge">Solicitud preparada</span>}
            </div>

            <div className="chat-body" ref={containerRef} onScroll={onScroll} aria-live="polite" aria-busy={isBusy}>
                {messages.map((message) => (
                    <div key={message.id} className={`msg ${message.role}`}>
                        <SafeMarkdown content={message.text} />
                    </div>
                ))}

                {status === "preparing" && (
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
                {isBusy && (
                    <div className="typing-row" aria-label="Leitner IA está escribiendo">
                        <span />
                        <span />
                        <span />
                    </div>
                )}
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
                {QUICK_PROMPTS.map((item) => (
                    <button key={item} type="button" disabled={isBusy} onClick={() => actions.applyQuickPrompt(item)}>
                        {item}
                    </button>
                ))}
            </div>

            <div className={hasPreparedPrompt ? "chat-input-area chat-input-area--prepared" : "chat-input-area"}>
                {hasPreparedPrompt && (
                    <div className="prepared-prompt-notice">
                        <div>
                            <strong>Prompt estructurado listo para revisión</strong>
                            <span>Puedes modificar cualquier parte antes de enviarlo.</span>
                        </div>
                        <button type="button" onClick={actions.discardPrompt} disabled={isBusy}>
                            Descartar
                        </button>
                    </div>
                )}

                <div className="chat-input-row">
                    <textarea
                        value={chatInput}
                        onChange={(event) => actions.setChatInput(event.target.value)}
                        disabled={isBusy}
                        aria-label="Mensaje para Leitner IA"
                        placeholder="Escribe una solicitud libre para Leitner IA..."
                        rows={hasPreparedPrompt ? 10 : 3}
                        onKeyDown={(event) => {
                            // In prepared-prompt mode Enter inserts new lines; the user must press "Enviar".
                            if (event.key === "Enter" && !event.shiftKey && !hasPreparedPrompt) {
                                event.preventDefault();
                                void actions.send();
                            }
                        }}
                    />

                    <div className="input-actions">
                        <button
                            type="button"
                            className="attach-chat-button"
                            onClick={openFilePicker}
                            disabled={isBusy}
                            aria-label="Adjuntar archivos al mensaje"
                            title="Adjuntar archivos"
                        >
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                <path d="M21.4 11.6l-8.9 8.9a6 6 0 01-8.5-8.5l9.2-9.2a4 4 0 015.7 5.7l-9.2 9.2a2 2 0 01-2.8-2.8l8.5-8.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            <span>{selectedFiles.length > 0 ? selectedFiles.length : ""}</span>
                        </button>
                        {isBusy ? (
                            <button type="button" className="cancel-btn" onClick={actions.cancel}>
                                Cancelar
                            </button>
                        ) : (
                            <button type="button" className="dark-btn" onClick={() => void actions.send()} disabled={!chatInput.trim()}>
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
    );
}
