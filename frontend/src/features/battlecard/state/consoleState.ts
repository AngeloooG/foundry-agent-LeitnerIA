import type { AgentAnnotation } from "../api/agentStreamClient";
import {
    initialBattlecardForm,
    updateFormField,
    type BattlecardForm,
    type BattlecardFormErrors,
} from "../model/battlecardForm";
import { WELCOME_MESSAGE, RESET_MESSAGE } from "../model/consoleContent";

export type ConsoleMessageRole = "user" | "agent" | "system";

export interface ConsoleMessage {
    id: string;
    role: ConsoleMessageRole;
    text: string;
}

/**
 * Lifecycle of one agent run:
 * idle → preparing (encoding attachments) → streaming → idle.
 * Cancellation and errors also return to idle; the outcome is written into the agent message.
 */
export type StreamStatus = "idle" | "preparing" | "streaming";

export interface ConsoleState {
    messages: ConsoleMessage[];
    conversationId: string | null;
    form: BattlecardForm;
    formErrors: BattlecardFormErrors;
    chatInput: string;
    hasPreparedPrompt: boolean;
    annotations: AgentAnnotation[];
    /** Kept in memory only: File objects are not serializable and must never be persisted. */
    selectedFiles: File[];
    attachmentErrors: string[];
    status: StreamStatus;
    toolStatus: string;
}

export type ConsoleAction =
    | { type: "formFieldChanged"; field: keyof BattlecardForm; value: BattlecardForm[keyof BattlecardForm] }
    | { type: "formValidationFailed"; errors: BattlecardFormErrors; notice: string }
    | { type: "promptPrepared"; prompt: string }
    | { type: "promptDiscarded" }
    | { type: "chatInputChanged"; value: string; keepPrepared?: boolean }
    | { type: "filesAdded"; accepted: File[]; rejectedMessages: string[] }
    | { type: "fileRemoved"; index: number }
    | { type: "filesCleared" }
    | { type: "runStarted"; userMessage: ConsoleMessage | null; agentMessageId: string; withAttachments: boolean }
    | { type: "attachmentsPrepared" }
    | { type: "conversationIdReceived"; conversationId: string }
    | { type: "chunkReceived"; messageId: string; chunk: string }
    | { type: "toolUsed"; toolName: string }
    | { type: "annotationsReceived"; annotations: AgentAnnotation[] }
    | { type: "agentMessageReplaced"; messageId: string; text: string }
    | { type: "runFinished"; clearAttachments: boolean }
    | { type: "conversationReset"; messageId: string };

export function createInitialConsoleState(): ConsoleState {
    return {
        messages: [{ id: "leitner-initial-message", role: "agent", text: WELCOME_MESSAGE }],
        conversationId: null,
        form: { ...initialBattlecardForm },
        formErrors: {},
        chatInput: "",
        hasPreparedPrompt: false,
        annotations: [],
        selectedFiles: [],
        attachmentErrors: [],
        status: "idle",
        toolStatus: "",
    };
}

const updateMessage = (
    messages: ConsoleMessage[],
    id: string,
    update: (message: ConsoleMessage) => ConsoleMessage
) => messages.map((message) => (message.id === id ? update(message) : message));

/**
 * Pure reducer for the Battlecard console. Single source of truth: the page renders from it and the
 * stream callbacks dispatch into it, so the state survives navigation between routes.
 */
export function consoleReducer(state: ConsoleState, action: ConsoleAction): ConsoleState {
    switch (action.type) {
        case "formFieldChanged": {
            const formErrors = { ...state.formErrors };
            delete formErrors[action.field as keyof BattlecardFormErrors];
            return {
                ...state,
                form: updateFormField(state.form, action.field, action.value as never),
                formErrors,
                hasPreparedPrompt: false,
            };
        }

        case "formValidationFailed":
            return {
                ...state,
                formErrors: action.errors,
                messages: [...state.messages, { id: crypto.randomUUID(), role: "system", text: action.notice }],
            };

        case "promptPrepared":
            return { ...state, chatInput: action.prompt, hasPreparedPrompt: true, formErrors: {} };

        case "promptDiscarded":
            return { ...state, chatInput: "", hasPreparedPrompt: false };

        case "chatInputChanged":
            return {
                ...state,
                chatInput: action.value,
                hasPreparedPrompt: action.keepPrepared ? state.hasPreparedPrompt : false,
            };

        case "filesAdded":
            return {
                ...state,
                selectedFiles: action.accepted.length > 0 ? [...state.selectedFiles, ...action.accepted] : state.selectedFiles,
                attachmentErrors: action.rejectedMessages,
                hasPreparedPrompt: action.accepted.length > 0 ? false : state.hasPreparedPrompt,
            };

        case "fileRemoved":
            return {
                ...state,
                selectedFiles: state.selectedFiles.filter((_, index) => index !== action.index),
                attachmentErrors: [],
                hasPreparedPrompt: false,
            };

        case "filesCleared":
            return { ...state, selectedFiles: [], attachmentErrors: [], hasPreparedPrompt: false };

        case "runStarted":
            return {
                ...state,
                messages: [
                    ...state.messages,
                    ...(action.userMessage ? [action.userMessage] : []),
                    { id: action.agentMessageId, role: "agent", text: "" },
                ],
                chatInput: "",
                hasPreparedPrompt: false,
                annotations: [],
                toolStatus: "",
                status: action.withAttachments ? "preparing" : "streaming",
            };

        case "attachmentsPrepared":
            return { ...state, status: "streaming" };

        case "conversationIdReceived":
            return { ...state, conversationId: action.conversationId };

        case "chunkReceived":
            return {
                ...state,
                messages: updateMessage(state.messages, action.messageId, (m) => ({ ...m, text: m.text + action.chunk })),
            };

        case "toolUsed":
            return { ...state, toolStatus: `Usando herramienta: ${action.toolName}` };

        case "annotationsReceived":
            return { ...state, annotations: [...state.annotations, ...action.annotations] };

        case "agentMessageReplaced":
            return {
                ...state,
                messages: updateMessage(state.messages, action.messageId, (m) => ({ ...m, text: action.text })),
            };

        case "runFinished":
            return {
                ...state,
                status: "idle",
                toolStatus: "",
                selectedFiles: action.clearAttachments ? [] : state.selectedFiles,
                attachmentErrors: action.clearAttachments ? [] : state.attachmentErrors,
            };

        case "conversationReset":
            return {
                ...createInitialConsoleState(),
                messages: [{ id: action.messageId, role: "agent", text: RESET_MESSAGE }],
            };

        default:
            return state;
    }
}
