# Matriz de pruebas · pre-develop

## 1. Pruebas automatizadas

**Backend: 166 pruebas** (antes 140; +26 legítimas en esta rama). Ejecutadas con `dotnet test WebApp.sln -c Release --no-build`: "Correcto: 166, Total: 166". Contraste con la DLL: `--list-tests` encontró 166; el TRX registra `executed=166 passed=166 failed=0`.

| Área | Casos | Archivo |
|---|---|---|
| Audiencia del backend | `{backend}` y `api://{backend}` → 200; Client ID del frontend (ambas formas) → 401; `api://arbitrary-app`, Graph y su appId → 401 | `Integration/EntraAuditTests.cs` |
| Configuración ambigua | Backend = frontend, backend vacío o no GUID, `ENTRA_SPA_CLIENT_ID` presente, frontend vacío, tenant placeholder, grupo mal formado → la app no arranca | `Integration/EntraAccessTests.cs`, `EntraAuditTests.cs`, `EntraAuthorizationTests.cs` |
| Token | Otro tenant, issuer del tenant con `tid` ajeno, expirado, firma falsa → 401 | `Integration/EntraAccessTests.cs` |
| Scope (token independiente) | `Chat.ReadWrite` y lista con varios → 200; `Chat.ReadWrite.All`, `Chat.ReadWriteX`, `XChat.ReadWrite`, `Chat.Read`, `chat.readwrite` → 403 | `EntraAuditTests.Scope_IsMatchedAsAWholeToken` |
| Grupo opcional | Sin grupo: no se exige `groups`, el overage no bloquea; con grupo: coincidencia exacta del GUID, claim ausente u overage → 403; el log no incluye grupos | `EntraAccessTests`, `EntraAuditTests`, `AllowedGroupLoggingTests` |
| 401/403 | Antes del agente (0 llamadas, 0 conversaciones), `application/problem+json`, sin IDs, issuer ni claims, sin `error_description` | `EntraAuditTests.Rejections_*` |
| Políticas | Recorrido de todos los endpoints: anónimos solo `/api/health`, `/health`, `/alive` y el fallback del SPA; el resto de `/api` usa una única política | `EntraAuditTests.EveryApiEndpoint_*` |
| OBO | Un backend separado no activa OBO; `ENABLE_OBO` solo admite `true`/`false`/vacío | `ConfigurationTests.EnableOboTests` |
| Coherencia del bundle | Bundle correcto → OK; otro backend u otro frontend, sin metadatos o JSON inválido → error; la API no arranca ante una discrepancia | `ConfigurationTests.SpaBundleConsistencyTests` |
| **Aislamiento A/B** | Ver tabla 2 | `Integration/ConversationIsolationTests.cs` |

**Frontend: 80 pruebas** (antes 79; `authConfig` pasa de 2 a 3 casos).

| Caso | Archivo |
|---|---|
| Se pide exactamente `api://<backend>/Chat.ReadWrite` en el login y en los tokens; MSAL usa el client id del frontend | `config/__tests__/authConfig.test.ts` |
| Sin backend → error (sin fallback); backend = frontend → error | ídem |
| Parser SSE, 401/403 ProblemDetails, adjuntos, Markdown seguro, reducer | pruebas existentes |

## 2. Aislamiento entre usuarios (automatizado)

Los usuarios A y B comparten nombre y `preferred_username`; solo cambia el `oid`. La decisión documentada es **404**: no revela si el recurso existe.

| Paso | Esperado | Prueba |
|---|---|---|
| A crea una conversación | 200, `owner_oid` = oid de A | `NewConversation_IsOwnedByTheCaller_AndStreamsTheFullSequence` |
| A la lee y la continúa | 200, misma conversación, no se crea otra | `OtherUser_CannotReadMessages` (rama A), `Owner_CanContinueTheConversation` |
| B la lee | 404 | `OtherUser_CannotReadMessages` |
| B la lista como propia | No aparece | `List_ReturnsOnlyTheCallersConversations` |
| B la continúa | 404, el agente no se invoca | `OtherUser_CannotContinueTheConversation` |
| B aprueba una herramienta MCP en ella | 404 | `OtherUser_CannotApproveMcpToolsInTheConversation` |
| B la elimina | 404 (no existe endpoint de borrado); la conversación sigue intacta | `OtherUser_CannotDeleteTheConversation` |
| Ajena frente a inexistente | Mismo estado y mismo cuerpo; no se repite el id | `ForeignAndMissingConversations_AreIndistinguishable` |
| Identidad | Basada en `oid`, no en nombre ni correo | `Ownership_UsesOid_NotNameOrEmail` |
| Conversación sin dueño (anterior) | 404 | `LegacyConversationWithoutOwner_IsNotAccessible` |

## 3. Smoke tests manuales con dos usuarios reales

Requieren Entra real y un navegador. Ejecutar tras `azd up` con dos cuentas del tenant (A y B), cada una en un navegador o perfil distinto.

| # | Paso | Esperado | OK |
|---|---|---|---|
| 1 | `curl -sI https://<app>/api/health` | 200 con `Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options: nosniff` | ☐ |
| 2 | `curl -s -o /dev/null -w "%{http_code}" https://<app>/api/conversations` | 401 | ☐ |
| 3 | A inicia sesión | Login correcto; si aparece consentimiento "Use LeitnerIA", se acepta una vez | ☐ |
| 4 | DevTools → Network → petición a `/api/chat/stream`: decodificar el token en jwt.ms (sin compartirlo) | `aud` = Client ID del backend, `scp` contiene `Chat.ReadWrite`, `tid` de CONSEIN | ☐ |
| 5 | A genera una Battlecard con el formulario | Streaming correcto, enlace "Abrir archivo generado" a SharePoint | ☐ |
| 6 | A navega a Inicio y vuelve durante la generación | La respuesta continúa | ☐ |
| 7 | A copia el `conversationId` (Network, primer evento SSE) | — | ☐ |
| 8 | B, en DevTools, ejecuta `fetch('/api/conversations/<id-de-A>/messages', {headers:{Authorization:'Bearer '+<token de B>}})` | 404 | ☐ |
| 9 | B envía un mensaje con `conversationId` de A | 404 y ningún contenido de A | ☐ |
| 10 | B: `GET /api/conversations` | No incluye la conversación de A | ☐ |
| 11 | A recarga la página | Sigue autenticado | ☐ |
| 12 | A abre una pestaña nueva | Autenticación silenciosa o redirección (`sessionStorage`); sin error | ☐ |
| 13 | `GET /api/agent` | Solo `id`, `name`, `description`, `starterPrompts`; sin instrucciones | ☐ |
| 14 | Cancelar una generación | Se conserva el texto parcial; sin error | ☐ |
| 15 | Application Insights (últimos 30 min): sin excepciones de `SpaBundleConsistencyCheck`, sin 5xx | — | ☐ |

Registrar fecha, cuentas usadas (sin datos personales) y resultado en el PR.
