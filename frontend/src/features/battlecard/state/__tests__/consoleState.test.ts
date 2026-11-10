import { describe, expect, it } from "vitest";

import { RESET_MESSAGE } from "../../model/consoleContent";
import { consoleReducer, createInitialConsoleState, type ConsoleState } from "../consoleState";

const file = (name: string) => new File(["x"], name, { type: "application/pdf" });

function startRun(state: ConsoleState, withAttachments = false) {
    return consoleReducer(state, {
        type: "runStarted",
        userMessage: { id: "u1", role: "user", text: "Hola" },
        agentMessageId: "a1",
        withAttachments,
    });
}

describe("consoleReducer", () => {
    it("creates independent initial states", () => {
        const a = createInitialConsoleState();
        const b = createInitialConsoleState();

        expect(a).not.toBe(b);
        expect(a.form).not.toBe(b.form);
        expect(a.messages).not.toBe(b.messages);
    });

    it("changing a form field clears its error and the prepared prompt", () => {
        const state = {
            ...createInitialConsoleState(),
            formErrors: { offering: "Obligatorio", competitors: "Obligatorio" },
            hasPreparedPrompt: true,
        };

        const next = consoleReducer(state, { type: "formFieldChanged", field: "offering", value: "Copilot" });

        expect(next.form.offering).toBe("Copilot");
        expect(next.formErrors).toEqual({ competitors: "Obligatorio" });
        expect(next.hasPreparedPrompt).toBe(false);
    });

    it("editing a prepared prompt keeps the prepared mode", () => {
        const state = consoleReducer(createInitialConsoleState(), { type: "promptPrepared", prompt: "P" });

        const next = consoleReducer(state, { type: "chatInputChanged", value: "P editado", keepPrepared: true });

        expect(next.chatInput).toBe("P editado");
        expect(next.hasPreparedPrompt).toBe(true);
    });

    it("a quick prompt leaves prepared mode", () => {
        const state = consoleReducer(createInitialConsoleState(), { type: "promptPrepared", prompt: "P" });

        const next = consoleReducer(state, { type: "chatInputChanged", value: "rápido" });

        expect(next.hasPreparedPrompt).toBe(false);
    });

    it("runStarted adds the user and an empty agent message and clears the composer", () => {
        const state = { ...createInitialConsoleState(), chatInput: "Hola", hasPreparedPrompt: true };

        const next = startRun(state);

        expect(next.messages.slice(-2).map((m) => [m.role, m.text])).toEqual([["user", "Hola"], ["agent", ""]]);
        expect(next.chatInput).toBe("");
        expect(next.hasPreparedPrompt).toBe(false);
        expect(next.status).toBe("streaming");
    });

    it("runs with attachments go through the preparing state", () => {
        const preparing = startRun(createInitialConsoleState(), true);
        expect(preparing.status).toBe("preparing");

        expect(consoleReducer(preparing, { type: "attachmentsPrepared" }).status).toBe("streaming");
    });

    it("chunks are appended to the agent message only", () => {
        let state = startRun(createInitialConsoleState());
        state = consoleReducer(state, { type: "chunkReceived", messageId: "a1", chunk: "Bat" });
        state = consoleReducer(state, { type: "chunkReceived", messageId: "a1", chunk: "tlecard" });

        expect(state.messages.find((m) => m.id === "a1")?.text).toBe("Battlecard");
        expect(state.messages.find((m) => m.id === "u1")?.text).toBe("Hola");
    });

    it("runFinished clears attachments only when requested", () => {
        let state = consoleReducer(createInitialConsoleState(), { type: "filesAdded", accepted: [file("a.pdf")], rejectedMessages: [] });
        state = startRun(state, true);

        expect(consoleReducer(state, { type: "runFinished", clearAttachments: false }).selectedFiles).toHaveLength(1);
        const finished = consoleReducer(state, { type: "runFinished", clearAttachments: true });
        expect(finished.selectedFiles).toHaveLength(0);
        expect(finished.status).toBe("idle");
        expect(finished.toolStatus).toBe("");
    });

    it("file removal and clearing reset attachment errors", () => {
        let state = consoleReducer(createInitialConsoleState(), {
            type: "filesAdded",
            accepted: [file("a.pdf"), file("b.pdf")],
            rejectedMessages: ["c.docx no válido"],
        });
        expect(state.attachmentErrors).toEqual(["c.docx no válido"]);

        state = consoleReducer(state, { type: "fileRemoved", index: 0 });
        expect(state.selectedFiles.map((f) => f.name)).toEqual(["b.pdf"]);
        expect(state.attachmentErrors).toEqual([]);

        expect(consoleReducer(state, { type: "filesCleared" }).selectedFiles).toEqual([]);
    });

    it("conversationReset drops conversation, form and files", () => {
        let state = startRun(createInitialConsoleState());
        state = consoleReducer(state, { type: "conversationIdReceived", conversationId: "conv_1" });
        state = consoleReducer(state, { type: "formFieldChanged", field: "offering", value: "x" });

        const reset = consoleReducer(state, { type: "conversationReset", messageId: "r1" });

        expect(reset.conversationId).toBeNull();
        expect(reset.form.offering).toBe("");
        expect(reset.messages).toEqual([{ id: "r1", role: "agent", text: RESET_MESSAGE }]);
        expect(reset.status).toBe("idle");
    });

    it("validation failures record errors and a system notice", () => {
        const next = consoleReducer(createInitialConsoleState(), {
            type: "formValidationFailed",
            errors: { offering: "Obligatorio" },
            notice: "Completa los campos",
        });

        expect(next.formErrors).toEqual({ offering: "Obligatorio" });
        expect(next.messages.at(-1)).toMatchObject({ role: "system", text: "Completa los campos" });
    });
});
