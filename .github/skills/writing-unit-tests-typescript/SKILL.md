---
name: writing-unit-tests-typescript
description: Guidelines and patterns for writing unit tests in TypeScript using Vitest.
---
# Skill: Writing TypeScript Unit Tests

## Overview

This skill covers writing unit tests for the frontend using **Vitest**.

## Project Structure

```text
frontend/src/
├── config/__tests__/authConfig.test.ts
├── components/markdown/__tests__/SafeMarkdown.test.tsx        # XSS, images, links (security regressions)
└── features/battlecard/
    ├── api/__tests__/agentStreamClient.test.ts                # SSE framing, errors (mock fetch)
    ├── api/__tests__/agentAttachments.test.ts                 # limits, duplicates, total size
    ├── model/__tests__/battlecardForm.test.ts                 # validation, prompt builder
    ├── model/__tests__/fileAttachments.test.ts
    └── state/__tests__/consoleState.test.ts                   # pure reducer
```

## Configuration

The Vitest config lives inline in `vite.config.ts`:

```typescript
export default defineConfig({
  // ... existing config
  test: {
    globals: true,
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
```

## Test Anatomy

```typescript
import { describe, expect, it } from "vitest";
import { consoleReducer, createInitialConsoleState } from "../consoleState";

describe("consoleReducer", () => {
  it("appends streamed chunks to the agent message", () => {
    let state = consoleReducer(createInitialConsoleState(), {
      type: "runStarted",
      userMessage: { id: "u1", role: "user", text: "Hola" },
      agentMessageId: "a1",
      withAttachments: false,
    });
    state = consoleReducer(state, { type: "chunkReceived", messageId: "a1", chunk: "Bat" });

    expect(state.messages.at(-1)?.text).toBe("Bat");
  });
});
```

## Running Tests

```powershell
# Run tests in watch mode (interactive)
cd frontend
npm test

# Run tests once (CI mode)
npm run test:run

# Run with coverage
npm run test:coverage

# Run specific file
npx vitest run src/features/battlecard/state/__tests__/consoleState.test.ts

# Run tests matching pattern
npx vitest run --testNamePattern="consoleReducer"
```

## Testable Units in This Project

### Pure modules (easy to test)

| File | What to Test |
|------|--------------|
| `features/battlecard/state/consoleState.ts` | Every action, immutability, reset |
| `features/battlecard/api/agentStreamClient.ts` | SSE framing across reads, CRLF, malformed events, error events, ProblemDetails (mock `fetch`) |
| `features/battlecard/api/agentAttachments.ts` | Per-type counts, total size cap, duplicates |
| `features/battlecard/model/battlecardForm.ts` | Validation and prompt builder |
| `features/battlecard/model/fileAttachments.ts` | `validateFile`, `getEffectiveMimeType`, `convertFilesToDataUris` |
| `components/markdown/linkPolicy.ts` + `SafeMarkdown.tsx` | Security regressions (render with `react-dom/server`) |

### Components (Require React Testing Library)

For component testing, add `@testing-library/react` only when needed:

```typescript
import { render, screen } from "@testing-library/react";
import { ChatMessage } from "../ChatMessage";

it("renders message content", () => {
  render(<ChatMessage role="user" content="Hello" />);
  expect(screen.getByText("Hello")).toBeInTheDocument();
});
```

## Assertions Reference

Vitest uses Chai-style assertions via `expect`:

```typescript
// Equality
expect(actual).toBe(expected);           // strict equality (===)
expect(actual).toEqual(expected);        // deep equality

// Truthiness
expect(value).toBeTruthy();
expect(value).toBeFalsy();
expect(value).toBeNull();
expect(value).toBeUndefined();

// Numbers
expect(num).toBeGreaterThan(5);
expect(num).toBeLessThanOrEqual(10);

// Strings
expect(str).toContain("substring");
expect(str).toMatch(/regex/);

// Arrays
expect(arr).toHaveLength(3);
expect(arr).toContain(item);

// Objects
expect(obj).toHaveProperty("key");
expect(obj).toMatchObject({ partial: "match" });

// Exceptions
expect(() => throwingFn()).toThrow();
expect(() => throwingFn()).toThrowError("message");

// Async
await expect(asyncFn()).resolves.toBe(value);
await expect(asyncFn()).rejects.toThrow();
```

## Test Organization

Use `describe` blocks to group related tests:

```typescript
describe("moduleName", () => {
  describe("functionName", () => {
    it("handles normal case", () => {});
    it("handles edge case", () => {});
    it("throws on invalid input", () => {});
  });
});
```

## State Shape Snapshot Tests

Use state shape snapshots to prevent accidental state changes from going unnoticed. If a new field is added to `AppState` without updating the test, it fails:

```typescript
it('should have expected state shape (update this test when adding new state fields)', () => {
  const shape = JSON.stringify(Object.keys(initialAppState).sort());
  expect(shape).toBe('["auth","chat","conversations","ui"]');
  const convShape = JSON.stringify(Object.keys(initialAppState.conversations).sort());
  expect(convShape).toBe('["hasMore","isLoading","list","sidebarOpen"]');
});
```

This forces anyone adding state fields to also add test coverage — the test file becomes the registry of all state. Apply this pattern to any new top-level state domain.

## When Unit Tests Aren't Enough

Use the `validating-ui-features` skill and Playwright when:
- Testing requires browser interaction (clicking, navigation)
- Testing authentication flows with MSAL
- Testing SSE streaming with real backend
- Visual regression testing

## Quick Reference

| Command | Purpose |
|---------|---------|
| `npm test` | Watch mode |
| `npm run test:run` | Run once |
| `npm run test:coverage` | With coverage |
| `npx vitest --ui` | Interactive UI |
