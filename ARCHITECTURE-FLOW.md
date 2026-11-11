# LeitnerIA: flujo técnico

Este documento explica cómo una solicitud del usuario llega al agente de Azure AI Foundry y cómo vuelve la respuesta en streaming. Describe el código de este repositorio; la configuración del agente, el servidor MCP, Power Automate y SharePoint viven fuera de él.

## 1. Vista general

```text
Navegador                                   Container App (ASP.NET Core 10)                         Azure
─────────                                   ───────────────────────────────                         ─────
MSAL (redirect, sessionStorage)  ──login──►                                                         Entra ID
AgentConsoleProvider ──POST /api/chat/stream (Bearer, JSON)──► SecurityHeaders → Auth → Authorization (scope)
                                                              → RateLimiter (por oid) → ChatEndpoints
                                                                  1. ChatRequestValidator (sin Azure)
                                                                  2. ConversationService.ResolveForTurnAsync
                                                                        └─ IConversationStore ──────────────► Foundry Conversations
                                                                  3. ChatService.StreamAsync
                                                                        └─ IAgentGateway ───────────────────► Foundry Responses API
                                                                                                              (agente LeitnerIA:
◄────────────── SSE: conversationId, chunk*, annotations, toolUse, usage, done | error ─────────────────────── web search + MCP)
SafeMarkdown (sanitiza, bloquea imágenes)
```

## 2. Backend

### 2.1 Capas

| Capa | Carpeta | Responsabilidad |
|---|---|---|
| Endpoints | `backend/WebApp.Api/Endpoints` | HTTP: binding, códigos de estado y escritura SSE. Sin lógica de negocio. |
| Application | `backend/WebApp.Api/Application` | Casos de uso (`ChatService`, `ConversationService`), validación, puertos (`IAgentGateway`, `IConversationStore`). |
| Infrastructure | `backend/WebApp.Api/Infrastructure` | Adaptadores de Foundry, credenciales, Options, cargador `.env`, limpieza de archivos. |
| Security | `backend/WebApp.Api/Security` | Autenticación y autorización, rate limiting, cabeceras, manejo de excepciones, dueño de las conversaciones. |
| Observability | `backend/WebApp.Api/Observability` | Métricas propias (`LeitnerIA.Chat`). |

Patrones aplicados:

- **Puertos y adaptadores** sobre el SDK de Foundry.
- **Options con `ValidateOnStart`**.
- **Strategy de credenciales**: managed identity u On-Behalf-Of.
- **Endpoints por slice**, agrupados con `MapGroup`.
- **`IExceptionHandler` único**.
- **Eventos SSE polimórficos** (`[JsonDerivedType]`).
- **Autorización basada en recurso**: dueño = `oid`.
- **`BackgroundService`** para mantenimiento.

### 2.2 Pipeline HTTP (`Program.cs`)

1. `SecurityHeadersMiddleware`: CSP, HSTS (fuera de Development), `nosniff`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` y `Cache-Control: no-store` en `/api`.
2. `UseExceptionHandler` con `ApiExceptionHandler`, que devuelve ProblemDetails. Los detalles internos solo se muestran en Development.
3. Archivos estáticos (`wwwroot`, la SPA), atendidos antes del enrutamiento.
4. CORS, solo en Development.
5. Autenticación JWT con Microsoft.Identity.Web y audiencias `api://{clientId}` y `{clientId}`.
6. Autorización: política `RequireChatScope` y política de respaldo (fallback) equivalente.
7. Rate limiting por usuario: `chat`, 20 por minuto; `api`, 120 por minuto.
8. Endpoints:

| Método y ruta | Acceso | Descripción |
|---|---|---|
| `POST /api/chat/stream` | scope `Chat.ReadWrite` | Envía un turno y devuelve SSE |
| `GET /api/agent` | scope | Nombre, descripción y starter prompts del agente (sin system prompt) |
| `GET /api/conversations?limit=` | scope | Conversaciones **del usuario** |
| `GET /api/conversations/{id}/messages` | scope | Mensajes de una conversación propia (404 si no lo es) |
| `GET /api/health`, `/health`, `/alive` | anónimo | Sondas de Container Apps |
| `/api/*` (cualquier otra) | anónimo | 404 ProblemDetails |
| `/*` | anónimo | `index.html` (rutas de la SPA) |

### 2.3 Turno de chat

1. **Validación** (`ChatRequestValidator`, `AttachmentValidator`), antes de cualquier llamada a Azure:
   - El mensaje no está vacío salvo en una aprobación MCP, y tiene como máximo 32.000 caracteres.
   - Los IDs coinciden con `^[A-Za-z0-9_-]{1,128}$`.
   - Adjuntos:
     - Data URIs en base64.
     - Tipos permitidos verificados por firma binaria (PNG, JPEG, GIF, WebP, PDF) o como UTF-8 estricto (texto).
     - Límites por cantidad y tamaño.
     - Nombres de archivo saneados.
   - Kestrel limita el cuerpo de la petición a 30 MB.
2. **Autorización de la conversación** (`ConversationService`):
   - Sin `conversationId`, crea una conversación con metadata `owner_oid` (el `oid` del token) y un `title`.
   - Con `conversationId`, la lee y compara `owner_oid`. Si no existe o no coincide, devuelve 404, antes de abrir el stream.
3. **Streaming** (`FoundryAgentGateway`):
   - Resuelve la versión del agente (fijada con `AI_AGENT_VERSION`, o la más reciente; caché de 10 minutos).
   - Construye el mensaje:
     - Imágenes: se suben a Foundry Files con el prefijo `webapp-upload-`.
     - Texto: se incrusta en el mensaje.
     - PDF: se envía como `input_file`.
   - Recorre las actualizaciones de la Responses API y emite eventos tipados.
4. **`ChatService`** envuelve la secuencia:
   - Agrega `conversationId` al inicio y `done` al final.
   - Convierte una excepción en un evento `error` con un mensaje genérico (en producción).
   - Trata la cancelación del cliente como un fin normal.
   - Registra las métricas.

### 2.4 Contrato SSE

Cada evento es `data: {json}\n\n`, con `type` como discriminador y propiedades en camelCase (`Models/ChatStreamEvents.cs` ↔ `frontend/src/features/battlecard/api/agentStreamClient.ts`):

| `type` | Campos |
|---|---|
| `conversationId` | `conversationId` |
| `chunk` | `content` |
| `annotations` | `annotations[]`: `type`, `label`, `url`, `fileId`, `containerId`, `startIndex`, `endIndex`, `quote` |
| `toolUse` | `toolName` (`web_search`, `mcp`, `file_search`, `code_interpreter`, `function_call`) |
| `mcpApprovalRequest` | `approvalRequest`: `id`, `toolName`, `serverLabel`, `arguments`, `previousResponseId` |
| `usage` | `duration`, `promptTokens`, `completionTokens`, `totalTokens` |
| `done` | (ninguno) |
| `error` | `message` (seguro para mostrar al usuario) |

### 2.5 Identidad hacia Foundry

| Modo | Cuándo | Credencial |
|---|---|---|
| Development | `ASPNETCORE_ENVIRONMENT=Development` | `AzureCliCredential` y luego `AzureDeveloperCliCredential` (el desarrollador) |
| Managed identity (por defecto) | Azure, sin `ENTRA_BACKEND_CLIENT_ID` | `ManagedIdentityCredential` (user-assigned), cliente singleton |
| On-Behalf-Of | `ENTRA_BACKEND_CLIENT_ID` configurado | `OnBehalfOfCredential` con la aserción de la managed identity (credencial federada, sin secretos) |

`DefaultAzureCredential` no se usa a propósito: en producción nunca debe recurrir a secretos en variables de entorno ni a credenciales del desarrollador.

### 2.6 Mantenimiento y telemetría

- `UploadedFilesCleanupService` borra las imágenes `webapp-upload-*` con más de `Uploads:RetentionHours` (168 por defecto) cada 6 horas. Usa la managed identity y está desactivado en Development.
- OpenTelemetry envía datos a Application Insights:
  - Trazas de ASP.NET Core, HttpClient y Azure SDK (sin las sondas de salud).
  - Métricas `leitneria.chat.tokens`, `leitneria.chat.duration` y `leitneria.chat.streams`.
  - Nunca se registra contenido de los prompts ni de las respuestas.

## 3. Frontend

### 3.1 Estructura

```text
src/
  App.tsx, main.tsx            MSAL, router (rutas lazy), proveedores
  config/                      authConfig (MSAL), appConfig (URL de la API, host de SharePoint, límites)
  components/                  Header, ErrorBoundary, markdown/SafeMarkdown, ThemeProvider
  features/landing/            HomePage (+ Home.css)
  features/battlecard/
    AgentConsolePage.tsx       Composición de la página /agente
    components/                BattlecardForm, AttachmentPicker, ChatPanel, Field
    hooks/                     useAutoScroll, useFilePicker
    model/                     battlecardForm (validación y prompt), consoleContent (textos), fileAttachments
    api/                       agentStreamClient (fetch + parser SSE), agentAttachments
    state/                     consoleState (reducer puro), AgentConsoleProvider (orquestación del stream)
  services/telemetry.ts        Application Insights del navegador (sin contenido de usuario)
```

### 3.2 Estado y streaming

- `AgentConsoleProvider` está montado **por encima de las rutas** y contiene un `useReducer(consoleReducer)`, que es la única fuente de verdad.
- El flujo de un envío:
  1. `send()` despacha `runStarted`, que agrega el mensaje del usuario y una burbuja del agente vacía.
  2. Convierte los adjuntos a data URIs y llama a `streamAgentMessage`.
  3. Por cada evento despacha `chunkReceived`, `toolUsed`, `annotationsReceived` o `conversationIdReceived`.
  4. Termina con `runFinished`.
- Como el proveedor no se desmonta al navegar, la generación continúa y **Cancelar** sigue funcionando al volver a `/agente`.
- Un `ref` evita los envíos dobles.
- Ante un error, el texto parcial se conserva y se le agrega un aviso.
- Estados de una ejecución: `idle → preparing (adjuntos) → streaming → idle`.

### 3.3 Autenticación

- `useMsalAuthentication(Redirect)` fuerza el inicio de sesión.
- Si el login falla, se muestra un mensaje con su código de error y un botón para reintentar.
- `useAuth().getAccessToken()` obtiene el token en silencio y, si hace falta interacción, usa `acquireTokenRedirect`.
- Caché en `sessionStorage`.

### 3.4 Presentación segura de la respuesta

`SafeMarkdown` combina `react-markdown`, `remark-gfm` y `rehype-sanitize`:

- No acepta HTML crudo.
- Las imágenes se sustituyen por "[Imagen omitida]", lo que evita la exfiltración por prompt injection.
- Solo hay enlaces `http(s)` y `mailto`, que se abren con `noopener noreferrer` y muestran su dominio.
- Los enlaces a `https://conseincloud.sharepoint.com` se muestran como "Abrir archivo generado".
- La CSP del backend refuerza estos controles (`img-src 'self' data: blob:`).

## 4. Despliegue

```text
azd provision
  preprovision.ps1   descubre la cuenta y el proyecto de Foundry (nunca elige en silencio) y el agente
  Bicep (main.bicep) RG, Log Analytics, App Insights x2, ACR, Container Apps Environment, identidad, Container App, app Entra
  postprovision.ps1  identifierUri y redirect URIs, OBO (opcional), rol "Foundry User" en el proyecto,
                     asignación de usuarios a la app, .env locales
azd deploy / predeploy.ps1
  docker build (web.Dockerfile: Vite build → dotnet publish → aspnet:10.0-alpine, usuario no root)
  push a ACR (Entra ID) → az containerapp update --image
```

Parámetros, costos y postura de seguridad: [infra/README.md](infra/README.md).
