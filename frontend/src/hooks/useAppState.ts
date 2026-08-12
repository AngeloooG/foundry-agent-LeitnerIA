import {
  useCallback,
  useMemo,
} from "react";

import {
  useAppContext,
} from "../contexts/AppContext";

import type {
  AgentConsolePatch,
} from "../types/agentConsoleState";

export const useAppState = () => {
  const {
    state,
    dispatch,
  } = useAppContext();

  const isAuthenticated = useMemo(
    () =>
      state.auth.status ===
      "authenticated",
    [state.auth.status]
  );

  const isChatBusy = useMemo(
    () =>
      [
        "sending",
        "streaming",
      ].includes(state.chat.status),
    [state.chat.status]
  );

  const canSendMessage = useMemo(
    () =>
      state.ui.chatInputEnabled &&
      state.chat.status === "idle",
    [
      state.ui.chatInputEnabled,
      state.chat.status,
    ]
  );

  const isStreaming = useMemo(
    () =>
      state.chat.status ===
      "streaming",
    [state.chat.status]
  );

  return useMemo(
    () => ({
      auth: state.auth,
      chat: state.chat,
      agentConsole:
        state.agentConsole,
      ui: state.ui,
      state,
      dispatch,
      isAuthenticated,
      isChatBusy,
      canSendMessage,
      isStreaming,
    }),
    [
      state,
      dispatch,
      isAuthenticated,
      isChatBusy,
      canSendMessage,
      isStreaming,
    ]
  );
};

export const useChatState = () => {
  const {
    state,
    dispatch,
  } = useAppContext();

  return useMemo(
    () => ({
      chat: state.chat,
      dispatch,
    }),
    [
      state.chat,
      dispatch,
    ]
  );
};

export const useAgentConsoleState = () => {
  const {
    state,
    dispatch,
  } = useAppContext();

  const patchAgentConsole = useCallback(
    (
      payload: AgentConsolePatch
    ) => {
      dispatch({
        type: "AGENT_CONSOLE_PATCH",
        payload,
      });
    },
    [dispatch]
  );

  const resetAgentConsole =
    useCallback(() => {
      dispatch({
        type:
          "AGENT_CONSOLE_RESET",
      });
    }, [dispatch]);

  return useMemo(
    () => ({
      agentConsole:
        state.agentConsole,
      patchAgentConsole,
      resetAgentConsole,
    }),
    [
      state.agentConsole,
      patchAgentConsole,
      resetAgentConsole,
    ]
  );
};

export const useUIState = () => {
  const {
    state,
    dispatch,
  } = useAppContext();

  return useMemo(
    () => ({
      ui: state.ui,
      dispatch,
    }),
    [
      state.ui,
      dispatch,
    ]
  );
};