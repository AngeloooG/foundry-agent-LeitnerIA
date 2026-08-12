export type AgentStreamEventType =
  | "conversationId"
  | "chunk"
  | "annotations"
  | "mcpApprovalRequest"
  | "toolUse"
  | "usage"
  | "done"
  | "error";

export interface AgentFileAttachment {
  dataUri: string;
  fileName: string;
  mimeType: string;
}

export interface AgentMcpApprovalResponse {
  approvalRequestId: string;
  approved: boolean;
}

export interface AgentStreamRequest {
  message: string;
  token: string;
  apiUrl?: string;
  conversationId?: string | null;
  imageDataUris?: string[];
  fileDataUris?: AgentFileAttachment[];
  previousResponseId?: string | null;
  mcpApproval?: AgentMcpApprovalResponse | null;
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

export interface AgentMcpApprovalRequest {
  id: string;
  toolName: string;
  serverLabel: string;
  arguments?: string;
  previousResponseId?: string;
}

export interface AgentStreamHandlers {
  onConversationId?: (conversationId: string) => void;
  onChunk?: (content: string) => void;
  onAnnotations?: (annotations: AgentAnnotation[]) => void;
  onToolUse?: (toolName: string) => void;
  onUsage?: (usage: AgentUsage) => void;
  onMcpApprovalRequest?: (
    approvalRequest: AgentMcpApprovalRequest
  ) => void;
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
  approvalRequest?: AgentMcpApprovalRequest;
}

export async function streamAgentMessage(
  request: AgentStreamRequest,
  handlers: AgentStreamHandlers = {}
): Promise<string> {
  const apiUrl =
    request.apiUrl ||
    import.meta.env.VITE_API_URL ||
    "/api";

  const response = await fetch(`${apiUrl}/chat/stream`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${request.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: request.message,
      conversationId: request.conversationId ?? null,
      imageDataUris:
        request.imageDataUris &&
          request.imageDataUris.length > 0
          ? request.imageDataUris
          : undefined,
      fileDataUris:
        request.fileDataUris &&
          request.fileDataUris.length > 0
          ? request.fileDataUris
          : undefined,
      previousResponseId:
        request.previousResponseId ?? null,
      mcpApproval: request.mcpApproval ?? null,
    }),
    signal: request.signal,
  });

  if (!response.ok) {
    const errorMessage =
      await readHttpErrorMessage(response);

    throw new Error(
      errorMessage ||
      `HTTP ${response.status}: ${response.statusText}`
    );
  }

  if (!response.body) {
    throw new Error(
      "El backend no devolvió un stream de respuesta."
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let buffer = "";
  let fullText = "";

  try {
    while (true) {
      const { value, done } = await reader.read();

      if (done) {
        buffer += decoder.decode();

        if (buffer.trim()) {
          processBufferedEvents(
            buffer,
            handlers,
            (content) => {
              fullText += content;
            }
          );
        }

        break;
      }

      buffer += decoder.decode(value, {
        stream: true,
      });

      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() ?? "";

      for (const event of events) {
        processBufferedEvents(
          event,
          handlers,
          (content) => {
            fullText += content;
          }
        );
      }
    }
  } finally {
    reader.releaseLock();
  }

  return fullText;
}

function processBufferedEvents(
  rawEvent: string,
  handlers: AgentStreamHandlers,
  appendContent: (content: string) => void
): void {
  const parsed = parseSseEvent(rawEvent);

  if (!parsed?.type) {
    return;
  }

  switch (parsed.type) {
    case "conversationId": {
      if (parsed.conversationId) {
        handlers.onConversationId?.(
          parsed.conversationId
        );
      }

      break;
    }

    case "chunk": {
      if (parsed.content) {
        appendContent(parsed.content);
        handlers.onChunk?.(parsed.content);
      }

      break;
    }

    case "annotations": {
      handlers.onAnnotations?.(
        parsed.annotations ?? []
      );

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

    case "mcpApprovalRequest": {
      if (parsed.approvalRequest) {
        handlers.onMcpApprovalRequest?.(
          parsed.approvalRequest
        );
      }

      break;
    }

    case "error": {
      const message =
        parsed.message ||
        "El agente devolvió un error.";

      handlers.onError?.(message);

      throw new Error(message);
    }

    case "done": {
      handlers.onDone?.();
      break;
    }

    default:
      break;
  }
}

function parseSseEvent(
  rawEvent: string
): RawSseEvent | null {
  const dataLines = rawEvent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("data:"))
    .map((line) =>
      line.replace(/^data:\s?/, "")
    );

  if (dataLines.length === 0) {
    return null;
  }

  const rawJson = dataLines.join("");

  try {
    return JSON.parse(rawJson) as RawSseEvent;
  } catch {
    return null;
  }
}

async function readHttpErrorMessage(
  response: Response
): Promise<string | null> {
  try {
    const contentType =
      response.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      const body = (await response.json()) as {
        title?: string;
        detail?: string;
        message?: string;
      };

      return (
        body.detail ||
        body.message ||
        body.title ||
        null
      );
    }

    const text = await response.text();
    return text.trim() || null;
  } catch {
    return null;
  }
}

export function extractFirstDownloadUrl(
  text: string
): string | null {
  const urlPattern = /(https?:\/\/[^\s)"'<>]+)/i;
  const match = text.match(urlPattern);

  return match?.[1] ?? null;
}