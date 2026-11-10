import { describe, it, expect } from 'vitest';
import { appReducer } from '../appReducer';
import { createInitialAgentConsoleState, initialAppState } from '../../types/appState';
import type { AppState } from '../../types/appState';

function createInitialState(): AppState {
  return {
    ...initialAppState,
    agentConsole: createInitialAgentConsoleState(),
  };
}

describe('appReducer', () => {
  describe('AGENT_CONSOLE_PATCH', () => {
    it('updates only the supplied agent console properties', () => {
      const state = createInitialState();

      const result = appReducer(state, {
        type: 'AGENT_CONSOLE_PATCH',
        payload: {
          chatInput: 'Mensaje persistente',
          conversationId: 'conversation-123',
          hasPreparedPrompt: true,
        },
      });

      expect(
        result.agentConsole.chatInput
      ).toBe('Mensaje persistente');

      expect(
        result.agentConsole.conversationId
      ).toBe('conversation-123');

      expect(
        result.agentConsole.hasPreparedPrompt
      ).toBe(true);

      expect(
        result.agentConsole.form
      ).toEqual(state.agentConsole.form);

      expect(
        result.agentConsole.messages
      ).toEqual(state.agentConsole.messages);
    });

    it('preserves the previous agent console object immutably', () => {
      const state = createInitialState();
      const previousAgentConsole =
        state.agentConsole;

      const result = appReducer(state, {
        type: 'AGENT_CONSOLE_PATCH',
        payload: {
          chatInput: 'Nuevo contenido',
        },
      });

      expect(
        result.agentConsole
      ).not.toBe(previousAgentConsole);

      expect(
        state.agentConsole.chatInput
      ).toBe('');

      expect(
        result.agentConsole.chatInput
      ).toBe('Nuevo contenido');
    });

    it('updates the guided form without losing other state', () => {
      const state = createInitialState();

      const nextForm = {
        ...state.agentConsole.form,
        company: 'CONSEIN',
        offering:
          'Implementación de Microsoft Copilot Studio',
        competitors:
          'UiPath y desarrollo interno',
      };

      const result = appReducer(state, {
        type: 'AGENT_CONSOLE_PATCH',
        payload: {
          form: nextForm,
        },
      });

      expect(
        result.agentConsole.form
      ).toEqual(nextForm);

      expect(
        result.agentConsole.chatInput
      ).toBe(state.agentConsole.chatInput);

      expect(
        result.agentConsole.conversationId
      ).toBe(
        state.agentConsole.conversationId
      );
    });

    it('stores selected File objects temporarily in memory', () => {
      const state = createInitialState();

      const file = new File(
        ['contenido de prueba'],
        'requerimientos.txt',
        {
          type: 'text/plain',
        }
      );

      const result = appReducer(state, {
        type: 'AGENT_CONSOLE_PATCH',
        payload: {
          selectedFiles: [file],
        },
      });

      expect(
        result.agentConsole.selectedFiles
      ).toHaveLength(1);

      expect(
        result.agentConsole.selectedFiles[0]
          .name
      ).toBe('requerimientos.txt');

      expect(
        result.agentConsole.selectedFiles[0]
          .type
      ).toBe('text/plain');

      expect(
        state.agentConsole.selectedFiles
      ).toEqual([]);
    });

    it('stores messages and annotations', () => {
      const state = createInitialState();

      const result = appReducer(state, {
        type: 'AGENT_CONSOLE_PATCH',
        payload: {
          messages: [
            {
              id: 'agent-message-1',
              role: 'agent',
              text: 'Respuesta persistente',
            },
          ],

          annotations: [
            {
              type: 'uri_citation',
              label: 'Fuente oficial',
              url: 'https://example.com',
            },
          ],
        },
      });

      expect(
        result.agentConsole.messages
      ).toHaveLength(1);

      expect(
        result.agentConsole.messages[0].text
      ).toBe('Respuesta persistente');

      expect(
        result.agentConsole.annotations
      ).toHaveLength(1);
    });
  });

  describe('AGENT_CONSOLE_RESET', () => {
    it('resets the complete agent console state', () => {
      const state = createInitialState();

      state.agentConsole = {
        ...state.agentConsole,

        chatInput: 'Texto temporal',
        conversationId: 'conversation-123',
        hasPreparedPrompt: true,

        form: {
          ...state.agentConsole.form,
          offering:
            'Servicio temporal',
          competitors:
            'Competidor temporal',
        },

        formErrors: {
          offering:
            'Error temporal',
        },

        messages: [
          {
            id: 'message-1',
            role: 'user',
            text: 'Mensaje temporal',
          },
        ],

        annotations: [
          {
            type: 'uri_citation',
            label: 'Referencia temporal',
            url: 'https://example.com',
          },
        ],

        selectedFiles: [
          new File(
            ['contenido'],
            'archivo.txt',
            {
              type: 'text/plain',
            }
          ),
        ],

        attachmentErrors: [
          'Error temporal de archivo',
        ],
      };

      const result = appReducer(state, {
        type: 'AGENT_CONSOLE_RESET',
      });

      expect(
        result.agentConsole.chatInput
      ).toBe('');

      expect(
        result.agentConsole.conversationId
      ).toBeNull();

      expect(
        result.agentConsole.hasPreparedPrompt
      ).toBe(false);

      expect(
        result.agentConsole.form.offering
      ).toBe('');

      expect(
        result.agentConsole.form.competitors
      ).toBe('');

      expect(
        result.agentConsole.formErrors
      ).toEqual({});

      expect(
        result.agentConsole.annotations
      ).toEqual([]);

      expect(
        result.agentConsole.selectedFiles
      ).toEqual([]);

      expect(
        result.agentConsole.attachmentErrors
      ).toEqual([]);

      expect(
        result.agentConsole.messages
      ).toHaveLength(1);

      expect(
        result.agentConsole.messages[0].role
      ).toBe('agent');
    });

    it('creates new nested references when resetting', () => {
      const state = createInitialState();

      const previousAgentConsole =
        state.agentConsole;

      const previousForm =
        state.agentConsole.form;

      const previousMessages =
        state.agentConsole.messages;

      const result = appReducer(state, {
        type: 'AGENT_CONSOLE_RESET',
      });

      expect(
        result.agentConsole
      ).not.toBe(previousAgentConsole);

      expect(
        result.agentConsole.form
      ).not.toBe(previousForm);

      expect(
        result.agentConsole.messages
      ).not.toBe(previousMessages);
    });
  });

  it('returns the same state for unknown actions', () => {
    const state = createInitialState();
    // @ts-expect-error unknown action type on purpose
    expect(appReducer(state, { type: 'UNKNOWN' })).toBe(state);
  });
});
