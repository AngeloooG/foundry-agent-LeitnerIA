import type { AgentAnnotation } from "../services/agentStreamClient";
import type {
  BattlecardForm,
  BattlecardFormErrors,
} from "../pages/agentConsoleForm";

export type AgentConsoleMessageRole =
  | "user"
  | "agent"
  | "system";

export interface AgentConsoleMessage {
  id: string;
  role: AgentConsoleMessageRole;
  text: string;
}

export interface AgentConsoleResult {
  fileName?: string;
  downloadUrl?: string;
  rawText?: string;
}

export interface AgentConsoleState {
  messages: AgentConsoleMessage[];
  conversationId: string | null;
  form: BattlecardForm;
  formErrors: BattlecardFormErrors;
  chatInput: string;
  hasPreparedPrompt: boolean;
  annotations: AgentAnnotation[];
  result: AgentConsoleResult | null;

  /**
   * Se conserva únicamente en memoria.
   * File no es serializable y no debe guardarse en localStorage
   * ni sessionStorage.
   */
  selectedFiles: File[];
  attachmentErrors: string[];
}

export type AgentConsolePatch =
  Partial<AgentConsoleState>;