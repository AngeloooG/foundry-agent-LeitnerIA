import type { AppAction, AppState } from "../types/appState";
import { createInitialAgentConsoleState } from "../types/appState";

/**
 * Pure reducer for the global application state.
 */
export const appReducer = (state: AppState, action: AppAction): AppState => {
  switch (action.type) {
    case "AGENT_CONSOLE_PATCH":
      return {
        ...state,
        agentConsole: {
          ...state.agentConsole,
          ...action.payload,
        },
      };

    case "AGENT_CONSOLE_RESET":
      return {
        ...state,
        agentConsole: createInitialAgentConsoleState(),
      };

    default:
      return state;
  }
};
