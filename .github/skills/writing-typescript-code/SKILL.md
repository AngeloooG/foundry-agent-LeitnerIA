---
name: writing-typescript-code
description: Provides TypeScript and React coding standards for this repository. Use when writing or modifying TypeScript code, creating React components, implementing MSAL authentication, or working with the frontend.
---

# TypeScript Coding Standards

**Goal**: Write type-safe React components with proper MSAL integration

## Hot Module Replacement (HMR) Workflow

**The frontend runs with Vite HMR**. When you edit TypeScript/React code:

1. **Save the file** - Vite instantly updates the browser (no refresh needed)
2. **Check the terminal** - Look for HMR updates in the "Frontend: React Vite" terminal
3. **State is preserved** - React state persists through most edits

**VS Code Tasks** (use `Run Task` command or check terminal panel):
- `Frontend: React Vite` - Runs `npm run dev` with HMR enabled
- Logs are visible directly in VS Code terminal

**No restart needed** - Just edit, save, and see changes instantly in the browser.

**Testing changes**: Use Playwright browser tools to:
- Navigate to http://localhost:5173
- Check browser console logs for state transitions and errors
- Inspect network requests for API validation

## TypeScript Config

Enable strict mode + explicit types (avoid `any`):

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true
  }
}
```

## React Components

Use functional components + hooks + typed props:

```typescript
interface MessageProps {
  message: string;
  sender: 'user' | 'agent';
}

function Message({ message, sender }: MessageProps) {
  return <div className={`msg-${sender}`}>{message}</div>;
}
```

## MSAL Pattern

**Always**: Try silent first, fallback to popup:

```typescript
try {
  const { accessToken } = await instance.acquireTokenSilent({
    ...tokenRequest,
    account: accounts[0]
  });
  return accessToken;
} catch {
  const { accessToken } = await instance.acquireTokenPopup(tokenRequest);
  return accessToken;
}
```

## Environment Variables

**CRITICAL**: Access at module level only (build-time replacement):

```typescript
// ✅ Correct - module level
const clientId = import.meta.env.VITE_ENTRA_FRONTEND_CLIENT_ID;

// ❌ Wrong - inside function (won't work after build)
function getClientId() {
  return import.meta.env.VITE_ENTRA_FRONTEND_CLIENT_ID;
}
```

**Available variables**:
- `VITE_ENTRA_FRONTEND_CLIENT_ID` - Entra app client ID
- `VITE_ENTRA_TENANT_ID` - Azure tenant ID

## State Management

Use `useState` (local) or Context API (shared):

```typescript
const [messages, setMessages] = useState<Message[]>([]);
const [loading, setLoading] = useState(false);
const [error, setError] = useState<Error | null>(null);
```

## Memoization Patterns

Use `useMemo` and `useCallback` for expensive computations and stable references:

```typescript
// Memoize computed values
const isAuthenticated = useMemo(
  () => accounts.length > 0,
  [accounts.length]
);

// Memoize callbacks to prevent child re-renders
const getAccessToken = useCallback(async () => {
  // ... token acquisition logic
}, [instance, accounts]);

// Return memoized object for stable reference
return useMemo(
  () => ({ getAccessToken, isAuthenticated, user }),
  [getAccessToken, isAuthenticated, user]
);
```

## API Calls

Include `Authorization` header + use `async/await`:

```typescript
const response = await fetch('/api/endpoint', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(data)
});

if (!response.ok) throw new Error(`API error: ${response.status}`);
```

## npm Dependencies

No `.npmrc` flags are needed (peer dependencies resolve cleanly). Before committing package changes run `npm ci` (fails if the lock file is out of sync) and `npm audit --omit=dev`.

## Common Mistakes

- ❌ Accessing `import.meta.env.*` in functions
- ❌ Calling hooks conditionally or in loops
- ❌ Using `any` type
- ❌ Storing tokens in component state
- ❌ Rendering agent output with anything other than `SafeMarkdown`
- ❌ Missing memoization in custom hooks (causes infinite re-renders)
- ❌ Returning new objects from hooks without `useMemo`

---

## Project-Specific: Architecture

| Concern | Implementation |
|---------|----------------|
| **Structure** | Feature folders: `src/features/battlecard` (console) and `src/features/landing` (home) |
| **State** | `AgentConsoleProvider` (mounted above the routes) + pure `consoleReducer` (`state/consoleState.ts`) — single source of truth |
| **Authentication** | MSAL redirect flow, `sessionStorage` cache; `useAuth().getAccessToken()` (silent → redirect) |
| **Streaming** | `api/agentStreamClient.ts` (fetch + SSE parser); the provider owns the `AbortController` and a ref guard against double submits |
| **Rendering agent output** | `components/markdown/SafeMarkdown.tsx` (rehype-sanitize, images blocked, link policy) |
| **Accessibility** | `Field` links label/help/error to the control; `aria-live` chat body |

## Project-Specific: Key Modules

| Module | Purpose |
|--------|---------|
| `features/battlecard/AgentConsolePage.tsx` | Page composition |
| `components/BattlecardForm.tsx` | Five guided questions + optional context; prepares an editable prompt |
| `components/AttachmentPicker.tsx` | Drop zone, validation messages, selected files |
| `components/ChatPanel.tsx` | Messages, progress, references, quick prompts, composer |
| `model/battlecardForm.ts` | Pure validation and prompt builder |
| `api/agentAttachments.ts` | Attachment limits (mirror the backend) and data URI conversion |

## Project-Specific: Adding Features

1. **Add an action** to `ConsoleAction` and handle it in `consoleReducer` (pure, tested in `state/__tests__`).
2. **Side effects** (network, timers) go in `AgentConsoleProvider` actions, never in the reducer.
3. **UI** reads `useAgentConsole()` and calls `actions.*`.
4. **Copy** goes to `model/consoleContent.ts`; limits to `config/appConfig.ts` (keep aligned with the backend).

## Related Skills

- **implementing-chat-streaming** - SSE streaming patterns and frontend state flow
- **troubleshooting-authentication** - MSAL popup issues and token debugging
- **testing-with-playwright** - Browser testing and accessibility validation
