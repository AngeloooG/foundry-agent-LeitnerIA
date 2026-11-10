import type {
  AgentConsolePatch,
  AgentConsoleState,
} from "./agentConsoleState";

import {
  initialBattlecardForm,
} from "../pages/agentConsoleForm";

/**
 * Global application state.
 *
 * Only the agent console lives here: it must survive navigation between "/" and "/agente"
 * (AppProvider stays mounted). Authentication state is read directly from MSAL.
 */
export interface AppState {
  agentConsole: AgentConsoleState;
}

export type AppAction =
  | {
    type: "AGENT_CONSOLE_PATCH";
    payload: AgentConsolePatch;
  }
  | {
    type: "AGENT_CONSOLE_RESET";
  };

export const initialAgentConsoleState: AgentConsoleState = {
  messages: [
    {
      id: "leitner-initial-message",
      role: "agent",
      text:
        `Hola. Soy LeitnerIA, tu agente para construir Battlecards ejecutivos para CONSEIN.

Para comenzar necesito:

1. ¿Qué producto o servicio estás ofreciendo?
2. ¿Quién es tu cliente ideal o avatar de decisión?
3. ¿Con qué tipo de soluciones o empresas compites normalmente?
4. ¿Qué resultado desea lograr tu cliente?
5. ¿Quieres que te muestre una versión idealizada o una construida solo con tu información actual?`,
    },
  ],
  conversationId: null,
  form: {
    ...initialBattlecardForm,
  },
  formErrors: {},
  chatInput: "",
  hasPreparedPrompt: false,
  annotations: [],
  selectedFiles: [],
  attachmentErrors: [],
};

/** Returns a fresh copy of the initial console state (no shared object references). */
export function createInitialAgentConsoleState(): AgentConsoleState {
  return {
    ...initialAgentConsoleState,
    form: { ...initialAgentConsoleState.form },
    formErrors: {},
    messages: initialAgentConsoleState.messages.map((message) => ({ ...message })),
    annotations: [],
    selectedFiles: [],
    attachmentErrors: [],
  };
}

export const initialAppState: AppState = {
  agentConsole: createInitialAgentConsoleState(),
};
