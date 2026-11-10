import { useCallback, useMemo } from "react";

import { useAppContext } from "../contexts/AppContext";
import type { AgentConsolePatch } from "../types/agentConsoleState";

/**
 * Selector hook for the agent console slice of the global state.
 */
export const useAgentConsoleState = () => {
  const { state, dispatch } = useAppContext();

  const patchAgentConsole = useCallback(
    (payload: AgentConsolePatch) => {
      dispatch({ type: "AGENT_CONSOLE_PATCH", payload });
    },
    [dispatch]
  );

  const resetAgentConsole = useCallback(() => {
    dispatch({ type: "AGENT_CONSOLE_RESET" });
  }, [dispatch]);

  return useMemo(
    () => ({
      agentConsole: state.agentConsole,
      patchAgentConsole,
      resetAgentConsole,
    }),
    [state.agentConsole, patchAgentConsole, resetAgentConsole]
  );
};
