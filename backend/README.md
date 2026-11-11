# LeitnerIA: backend (ASP.NET Core 10)

API que autentica a los usuarios con Entra ID, aplica el aislamiento por usuario y hace de proxy en streaming (SSE) hacia el agente de Azure AI Foundry. También sirve la SPA compilada desde `wwwroot`.

La arquitectura completa está en [../ARCHITECTURE-FLOW.md](../ARCHITECTURE-FLOW.md).

## Estructura

```text
WebApp.Api/
  Program.cs                      Composición: servicios, pipeline y endpoints (~70 líneas)
  Endpoints/                      ChatEndpoints (SSE), ConversationEndpoints, AgentEndpoints, ApiResults
  Application/                    ChatService, ConversationService, puertos (Ports.cs)
    Attachments/                  AttachmentValidator (tipos, firmas, tamaños, nombres)
    Validation/                   ChatRequestValidator
  Infrastructure/
    Configuration/                FoundryOptions (validadas al arrancar), DotEnvLoader
    Foundry/                      FoundryAgentGateway, FoundryConversationStore, FoundryAgentCatalog,
                                  FoundryClientFactory (MI u OBO), UploadedFilesCleanupService
  Security/                       Autenticación, autorización, rate limiting, cabeceras, ApiExceptionHandler,
                                  ConversationOwnership, UserIdentity
  Observability/ChatMetrics.cs    Métricas OpenTelemetry (tokens, duración, resultado)
  Models/                         Contratos HTTP y SSE
WebApp.ServiceDefaults/           OpenTelemetry (Application Insights), health checks, resiliencia de HttpClient
WebApp.Api.Tests/                 Pruebas unitarias y de integración (WebApplicationFactory + fakes)
```

## Endpoints

| Método y ruta | Descripción |
|---|---|
| `POST /api/chat/stream` | Turno de chat; respuesta SSE (`conversationId`, `chunk`, `annotations`, `toolUse`, `mcpApprovalRequest`, `usage`, `done`/`error`) |
| `GET /api/agent` | Nombre, descripción y starter prompts del agente |
| `GET /api/conversations?limit=20` | Conversaciones del usuario autenticado |
| `GET /api/conversations/{id}/messages` | Mensajes de una conversación propia |
| `GET /api/health`, `/health`, `/alive` | Sondas (anónimas) |

Todos los endpoints `/api` excepto `/api/health` exigen un token del tenant configurado con el scope `Chat.ReadWrite` y, si `ENTRA_ALLOWED_GROUP_ID` tiene valor, pertenecer a ese grupo. Las reglas están en `Security/` (`EntraOptions`, `EntraTokenValidation`, `CorporateAccessAuthorization`). Los endpoints que existían en la plantilla, `/api/files/*`, `/api/agent/info` y `DELETE /api/conversations/{id}`, se eliminaron porque exponían archivos o acciones de todos los usuarios.

## Configuración

Variables de entorno, que inyecta azd o Container Apps (en local, las escribe en `.env` el hook `postprovision`):

| Variable | Obligatoria | Descripción |
|---|---|---|
| `ENTRA_SPA_CLIENT_ID` | Sí | Client ID de la app Entra (GUID); define la audiencia del token |
| `ENTRA_TENANT_ID` | Sí | Tenant (GUID) |
| `AI_AGENT_ENDPOINT` | Sí | `https://<cuenta>.services.ai.azure.com/api/projects/<proyecto>` |
| `AI_AGENT_ID` | Sí | Nombre del agente (`LeitnerIA`) |
| `AI_AGENT_VERSION` | No | Versión fija del agente (por defecto, la más reciente) |
| `MANAGED_IDENTITY_CLIENT_ID` | En Azure | Identidad user-assigned |
| `ENTRA_BACKEND_CLIENT_ID` | No | Activa On-Behalf-Of |
| `ENTRA_ALLOWED_GROUP_ID` | No | Restricción opcional por grupo (object id). Vacío = todos los usuarios del tenant. Si tiene valor, debe ser un GUID o la app no arranca |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | No | Telemetría (secreto de Container Apps) |

Configuración de `appsettings.json`, que se puede sobrescribir con variables de entorno (por ejemplo, `RateLimiting__ChatPermitsPerMinute=30`):

| Clave | Por defecto | Descripción |
|---|---|---|
| `Limits:MaxRequestBodyMegabytes` | 30 | Tamaño máximo del cuerpo (los adjuntos en base64) |
| `RateLimiting:ChatPermitsPerMinute` | 20 | Mensajes por minuto por usuario |
| `RateLimiting:ApiPermitsPerMinute` | 120 | Resto de la API |
| `Uploads:RetentionHours` | 168 | Retención de imágenes subidas a Foundry |
| `Uploads:CleanupEnabled` | true (false en Development) | Limpieza automática |
| `Foundry:AgentCacheMinutes` | 10 | Caché de la definición del agente |
| `Telemetry:UseEntraAuthentication` | false | Ingesta de App Insights con Entra ID |
| `Security:ContentSecurityPolicy` | (ver código) | Sobrescribe la CSP |

Si la configuración es inválida (placeholders, GUIDs incorrectos, endpoint sin https), **la aplicación no arranca** y el error indica qué falta.

> Nunca ponga secretos en `appsettings*.json` ni en `.env`. Este backend no necesita ninguno: usa managed identity, o su login de Azure CLI en Development.

## Ejecutar y probar

```powershell
cd backend
dotnet run --project WebApp.Api          # http://localhost:8080 (Development: usa az login)
dotnet test                              # o, si una política bloquea el .exe:
dotnet build; dotnet WebApp.Api.Tests/bin/Debug/net10.0/WebApp.Api.Tests.dll
dotnet list package --vulnerable --include-transitive
```

Qué cubren las pruebas:

- Validadores de petición y de adjuntos.
- Reglas de dueño de las conversaciones.
- Options y `DotEnvLoader`.
- Contrato SSE.
- Integración (sin Azure, con fakes de los puertos):
  - 401 y 403.
  - Aislamiento entre usuarios: continuar, aprobar, leer y listar.
  - Errores genéricos.
  - Endpoints eliminados (404).
  - Cabeceras de seguridad, CORS y rate limiting.

## Manejo de errores y logging

- Todas las excepciones no controladas se convierten en ProblemDetails (`ApiExceptionHandler`). En producción el mensaje es genérico y en español; el detalle solo va a Application Insights.
- Durante el streaming, los errores se envían como un evento `error`, porque el código 200 ya se envió.
- No se registran prompts, respuestas, tokens ni nombres de archivo. Los intentos de acceso a conversaciones ajenas se registran como `Warning`.
