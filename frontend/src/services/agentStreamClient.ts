export type AgentStreamEventType =
  | "conversationId"
  | "chunk"
  | "annotations"
  | "mcpApprovalRequest"
  | "toolUse"
  | "usage"
  | "done"
  | "error";

export interface AgentStreamRequest {
  message: string;
  token: string;
  apiUrl?: string;
  conversationId?: string | null;
  imageDataUris?: string[];
  fileDataUris?: string[];
  previousResponseId?: string | null;
  mcpApproval?: unknown;
  signal?: AbortSignal;
}

export interface AgentAnnotation {
  type?: string;
  label?: string;
  url?: string;
  fileId?: string;
  containerId?: string;
  textToReplace?: string;
  startIndex?: number;
  endIndex?: number;
  quote?: string;
}

export interface AgentUsage {
  duration?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface AgentStreamHandlers {
  onConversationId?: (conversationId: string) => void;
  onChunk?: (content: string) => void;
  onAnnotations?: (annotations: AgentAnnotation[]) => void;
  onToolUse?: (toolName: string) => void;
  onUsage?: (usage: AgentUsage) => void;
  onDone?: () => void;
  onError?: (message: string) => void;
}

interface RawSseEvent {
  type?: AgentStreamEventType;
  conversationId?: string;
  content?: string;
  annotations?: AgentAnnotation[];
  toolName?: string;
  duration?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  message?: string;
}

export async function streamAgentMessage(
  request: AgentStreamRequest,
  handlers: AgentStreamHandlers = {}
): Promise<string> {
  const apiUrl = request.apiUrl || import.meta.env.VITE_API_URL || "/api";

  const response = await fetch(`${apiUrl}/chat/stream`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${request.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: request.message,
      conversationId: request.conversationId ?? null,
      imageDataUris: request.imageDataUris ?? [],
      fileDataUris: request.fileDataUris ?? [],
      previousResponseId: request.previousResponseId ?? null,
      mcpApproval: request.mcpApproval ?? null,
    }),
    signal: request.signal,
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  if (!response.body) {
    throw new Error("El backend no devolvió un stream de respuesta.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let buffer = "";
  let fullText = "";

  while (true) {
    const { value, done } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const event of events) {
      const parsed = parseSseEvent(event);

      if (!parsed || !parsed.type) {
        continue;
      }

      switch (parsed.type) {
        case "conversationId": {
          if (parsed.conversationId) {
            handlers.onConversationId?.(parsed.conversationId);
          }
          break;
        }

        case "chunk": {
          if (parsed.content) {
            fullText += parsed.content;
            handlers.onChunk?.(parsed.content);
          }
          break;
        }

        case "annotations": {
          handlers.onAnnotations?.(parsed.annotations ?? []);
          break;
        }

        case "toolUse": {
          if (parsed.toolName) {
            handlers.onToolUse?.(parsed.toolName);
          }
          break;
        }

        case "usage": {
          handlers.onUsage?.({
            duration: parsed.duration,
            promptTokens: parsed.promptTokens,
            completionTokens: parsed.completionTokens,
            totalTokens: parsed.totalTokens,
          });
          break;
        }

        case "error": {
          const message = parsed.message || "El agente devolvió un error.";
          handlers.onError?.(message);
          throw new Error(message);
        }

        case "done": {
          handlers.onDone?.();
          break;
        }

        case "mcpApprovalRequest": {
          /*
            El backend puede emitir este evento cuando una herramienta MCP requiere aprobación.
            Lo dejamos reconocido para no romper el stream, pero el flujo de aprobación lo
            podemos implementar después si tu agente lo necesita.
          */
          break;
        }

        default:
          break;
      }
    }
  }

  return fullText;
}

function parseSseEvent(rawEvent: string): RawSseEvent | null {
  const dataLines = rawEvent
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.replace(/^data:\s?/, ""));

  if (!dataLines.length) {
    return null;
  }

  const rawJson = dataLines.join("");

  try {
    return JSON.parse(rawJson) as RawSseEvent;
  } catch {
    return null;
  }
}

export function extractFirstDownloadUrl(text: string): string | null {
  const urlPattern = /(https?:\/\/[^\s)"]+)/i;
  const match = text.match(urlPattern);
  return match?.[1] ?? null;
}