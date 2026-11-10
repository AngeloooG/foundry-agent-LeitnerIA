import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useReducer, useRef } from "react";
import type { ReactNode } from "react";

import { useAuth } from "../../../hooks/useAuth";
import { trackException } from "../../../services/telemetry";
import { mergeAttachmentSelection, prepareAgentAttachments } from "../api/agentAttachments";
import { streamAgentMessage } from "../api/agentStreamClient";
import { buildBattlecardPrompt, validateBattlecardForm, type BattlecardForm } from "../model/battlecardForm";
import { FORM_INCOMPLETE_NOTICE, RUN_MESSAGES } from "../model/consoleContent";
import { consoleReducer, createInitialConsoleState, type ConsoleState } from "./consoleState";

export interface AgentConsoleActions {
    setField: <Field extends keyof BattlecardForm>(field: Field, value: BattlecardForm[Field]) => void;
    setChatInput: (value: string) => void;
    applyQuickPrompt: (prompt: string) => void;
    preparePrompt: () => boolean;
    discardPrompt: () => void;
    addFiles: (files: File[]) => void;
    removeFile: (index: number) => void;
    clearFiles: () => void;
    send: () => Promise<void>;
    cancel: () => void;
    reset: () => void;
}

interface AgentConsoleContextValue {
    state: ConsoleState;
    actions: AgentConsoleActions;
}

const AgentConsoleContext = createContext<AgentConsoleContextValue | null>(null);

/**
 * Owns the Battlecard console state and the agent run (streaming, cancellation).
 *
 * Mounted above the routes, so a generation keeps running and its result is kept when the user navigates
 * between "/" and "/agente"; "Cancelar" still works after coming back. The run is aborted only when the
 * provider unmounts (the app closes) or the user resets the conversation.
 */
export function AgentConsoleProvider({ children }: { children: ReactNode }) {
    const [state, dispatch] = useReducer(consoleReducer, undefined, createInitialConsoleState);
    const { getAccessToken } = useAuth();

    // Refs hold values the async run needs without stale closures; isRunningRef blocks double submits
    // (a fast double Enter/click happens before React re-renders with status !== "idle").
    const stateRef = useRef(state);
    useLayoutEffect(() => {
        stateRef.current = state;
    });
    const isRunningRef = useRef(false);
    const abortRef = useRef<AbortController | null>(null);

    useEffect(() => () => abortRef.current?.abort(), []);

    const run = useCallback(async (message: string, files: File[]) => {
        const text = message.trim();
        if (!text || isRunningRef.current) {
            return;
        }
        isRunningRef.current = true;

        const agentMessageId = crypto.randomUUID();
        dispatch({
            type: "runStarted",
            userMessage: { id: crypto.randomUUID(), role: "user", text },
            agentMessageId,
            withAttachments: files.length > 0,
        });

        const controller = new AbortController();
        abortRef.current = controller;

        let streamedText = "";
        let errorShown = false;
        let succeeded = false;
        const replace = (value: string) => dispatch({ type: "agentMessageReplaced", messageId: agentMessageId, text: value });
        // Keep partial output when the stream fails midway; replace only an empty bubble.
        const showError = (detail: string, build: (d: string) => string) => {
            errorShown = true;
            replace(streamedText.trim() ? streamedText + RUN_MESSAGES.partialSuffix(detail) : build(detail));
            // Telemetry without payload: no prompt, response, file names or error text from the agent.
            trackException(new Error("Agent run failed"), { stage: "stream" });
        };

        try {
            const token = await getAccessToken();
            if (!token) {
                replace(RUN_MESSAGES.noToken);
                return;
            }

            const attachments = await prepareAgentAttachments(files);
            dispatch({ type: "attachmentsPrepared" });

            await streamAgentMessage(
                {
                    message: text,
                    token,
                    conversationId: stateRef.current.conversationId,
                    imageDataUris: attachments.imageDataUris,
                    fileDataUris: attachments.fileDataUris,
                    signal: controller.signal,
                },
                {
                    onConversationId: (conversationId) => dispatch({ type: "conversationIdReceived", conversationId }),
                    onChunk: (chunk) => {
                        streamedText += chunk;
                        dispatch({ type: "chunkReceived", messageId: agentMessageId, chunk });
                    },
                    onToolUse: (toolName) => dispatch({ type: "toolUsed", toolName }),
                    onAnnotations: (annotations) => dispatch({ type: "annotationsReceived", annotations }),
                    onError: (detail) => showError(detail, RUN_MESSAGES.agentError),
                }
            );

            succeeded = true;
            if (!streamedText.trim()) {
                replace(RUN_MESSAGES.empty);
            }
        } catch (error) {
            if (error instanceof DOMException && error.name === "AbortError") {
                replace(streamedText.trim() ? streamedText + RUN_MESSAGES.partialSuffix(RUN_MESSAGES.cancelled) : RUN_MESSAGES.cancelled);
            } else if (!errorShown) {
                const detail = error instanceof Error ? error.message : "Error desconocido al invocar el agente.";
                showError(detail, RUN_MESSAGES.connectionError);
            }
        } finally {
            dispatch({ type: "runFinished", clearAttachments: succeeded && files.length > 0 });
            abortRef.current = null;
            isRunningRef.current = false;
        }
    }, [getAccessToken]);

    const actions = useMemo<AgentConsoleActions>(() => ({
        setField: (field, value) => dispatch({ type: "formFieldChanged", field, value }),
        setChatInput: (value) => dispatch({ type: "chatInputChanged", value, keepPrepared: true }),
        applyQuickPrompt: (prompt) => dispatch({ type: "chatInputChanged", value: prompt }),
        preparePrompt: () => {
            const { form, selectedFiles } = stateRef.current;
            const errors = validateBattlecardForm(form);
            if (Object.keys(errors).length > 0) {
                dispatch({ type: "formValidationFailed", errors, notice: FORM_INCOMPLETE_NOTICE });
                return false;
            }
            dispatch({ type: "promptPrepared", prompt: buildBattlecardPrompt(form, selectedFiles.map((f) => f.name)) });
            return true;
        },
        discardPrompt: () => dispatch({ type: "promptDiscarded" }),
        addFiles: (files) => {
            if (files.length === 0 || isRunningRef.current) return;
            const { acceptedFiles, rejectedMessages } = mergeAttachmentSelection(stateRef.current.selectedFiles, files);
            dispatch({ type: "filesAdded", accepted: acceptedFiles, rejectedMessages });
        },
        removeFile: (index) => {
            if (!isRunningRef.current) dispatch({ type: "fileRemoved", index });
        },
        clearFiles: () => {
            if (!isRunningRef.current) dispatch({ type: "filesCleared" });
        },
        send: () => run(stateRef.current.chatInput, [...stateRef.current.selectedFiles]),
        cancel: () => abortRef.current?.abort(),
        reset: () => {
            abortRef.current?.abort();
            dispatch({ type: "conversationReset", messageId: crypto.randomUUID() });
        },
    }), [run]);

    const value = useMemo(() => ({ state, actions }), [state, actions]);

    return <AgentConsoleContext.Provider value={value}>{children}</AgentConsoleContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAgentConsole(): AgentConsoleContextValue {
    const context = useContext(AgentConsoleContext);
    if (!context) {
        throw new Error("useAgentConsole must be used within AgentConsoleProvider");
    }
    return context;
}
