import { afterEach, describe, expect, it, vi } from "vitest";

import { streamAgentMessage } from "../agentStreamClient";

const encoder = new TextEncoder();

/** Builds a fetch Response whose body yields the given raw chunks (to test SSE framing across reads). */
function sseResponse(chunks: string[], init: ResponseInit = {}) {
    const body = new ReadableStream<Uint8Array>({
        start(controller) {
            for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
            controller.close();
        },
    });
    return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" }, ...init });
}

function mockFetch(response: Response) {
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe("streamAgentMessage", () => {
    it("parses events split across network reads", async () => {
        mockFetch(sseResponse([
            'data: {"type":"conversationId","conversationId":"conv_1"}\n\nda',
            'ta: {"type":"chunk","content":"Hola "}\n\ndata: {"type":"chu',
            'nk","content":"mundo"}\n\ndata: {"type":"done"}\n\n',
        ]));
        const onConversationId = vi.fn();
        const onChunk = vi.fn();
        const onDone = vi.fn();

        const text = await streamAgentMessage({ message: "x", token: "t" }, { onConversationId, onChunk, onDone });

        expect(text).toBe("Hola mundo");
        expect(onConversationId).toHaveBeenCalledWith("conv_1");
        expect(onChunk).toHaveBeenCalledTimes(2);
        expect(onDone).toHaveBeenCalledOnce();
    });

    it("supports CRLF framing and a final event without trailing blank line", async () => {
        mockFetch(sseResponse(['data: {"type":"chunk","content":"A"}\r\n\r\ndata: {"type":"chunk","content":"B"}']));

        expect(await streamAgentMessage({ message: "x", token: "t" })).toBe("AB");
    });

    it("ignores malformed events instead of failing the stream", async () => {
        mockFetch(sseResponse(['data: {not json}\n\n: comment\n\ndata: {"type":"chunk","content":"ok"}\n\n']));

        expect(await streamAgentMessage({ message: "x", token: "t" })).toBe("ok");
    });

    it("reports and throws on error events", async () => {
        mockFetch(sseResponse(['data: {"type":"chunk","content":"parcial"}\n\ndata: {"type":"error","message":"falló"}\n\n']));
        const onError = vi.fn();

        await expect(streamAgentMessage({ message: "x", token: "t" }, { onError })).rejects.toThrow("falló");
        expect(onError).toHaveBeenCalledWith("falló");
    });

    it("uses the ProblemDetails detail for HTTP errors", async () => {
        mockFetch(new Response(JSON.stringify({ title: "Solicitud inválida", detail: "El mensaje no puede estar vacío." }), {
            status: 400,
            headers: { "Content-Type": "application/problem+json" },
        }));

        await expect(streamAgentMessage({ message: "", token: "t" })).rejects.toThrow("El mensaje no puede estar vacío.");
    });

    it("sends the bearer token and omits empty attachment arrays", async () => {
        const fetchMock = mockFetch(sseResponse(['data: {"type":"done"}\n\n']));

        await streamAgentMessage({ message: "hola", token: "abc", conversationId: "conv_1", imageDataUris: [] });

        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe("/api/chat/stream");
        expect((init.headers as Record<string, string>).Authorization).toBe("Bearer abc");
        const body = JSON.parse(init.body as string);
        expect(body).toMatchObject({ message: "hola", conversationId: "conv_1" });
        expect(body.imageDataUris).toBeUndefined();
    });
});
