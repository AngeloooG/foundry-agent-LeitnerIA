# Decisiones de arquitectura y patrones de diseño

Este documento registra qué patrones se aplicaron en el refactor de LeitnerIA (rama `refactor/leitneria-seguridad`), qué problema resuelve cada uno y qué patrones se evaluaron y se descartaron, con el motivo. Complementa [ARCHITECTURE-FLOW.md](../ARCHITECTURE-FLOW.md), que describe el flujo técnico.

**Criterio general:** un patrón se aplica cuando resuelve un problema que el código tiene hoy, no por anticipado. Cada patrón descartado indica cuándo convendría incorporarlo.

## 1. Punto de partida

| Área | Antes | Después |
|---|---|---|
| Backend | `AgentFrameworkService.cs` de 1.214 líneas con 9 responsabilidades; `Program.cs` de 621 líneas con try/catch copiado 8 veces | Capas Endpoints / Application / Infrastructure / Security / Observability; ningún archivo pasa de ~280 líneas; `Program.cs` de ~70 líneas |
| Frontend | `AgentConsole.tsx` de 2.556 líneas: 14 `useState` copiados al contexto global, ~1.350 líneas de CSS inline; ~6.300 líneas de código muerto de la plantilla | Carpetas por feature, componentes pequeños, hooks, un reducer como única fuente de estado y un proveedor que orquesta el streaming |

## 2. Patrones aplicados: backend

| Patrón | Dónde | Qué resuelve |
|---|---|---|
| Puertos y adaptadores (hexagonal ligera) | `Application/Ports.cs` (`IAgentGateway`, `IConversationStore`); `Infrastructure/Foundry/FoundryAgentGateway.cs`, `FoundryConversationStore.cs` | El SDK de Foundry queda aislado. Las pruebas de integración usan fakes, no Azure. Cambiar de SDK o añadir otro almacén de conversaciones solo toca un adaptador. |
| Casos de uso (capa de aplicación) | `Application/ChatService.cs`, `ConversationService.cs` | La lógica de negocio (dueño, creación, secuencia del stream) sale de los endpoints. |
| Vertical slices + `MapGroup` | `Endpoints/ChatEndpoints.cs`, `ConversationEndpoints.cs`, `AgentEndpoints.cs` | Cada grupo de endpoints en su archivo; la autorización se aplica una sola vez en el grupo `/api`. |
| Options pattern + `ValidateOnStart` | `Infrastructure/Configuration/FoundryOptions.cs` | Una configuración inválida (placeholders, endpoint sin https) hace fallar el arranque en lugar de devolver 500 en cada petición. |
| Factory + singleton | `Infrastructure/Foundry/FoundryClientFactory.cs` (`FoundryAppClient`) | Un único cliente de Foundry con managed identity reutiliza la caché de tokens; antes se creaba credencial y cliente por petición. |
| Manejador global de excepciones | `Security/ApiExceptionHandler.cs` (`IExceptionHandler`) | Sustituye 8 bloques try/catch copiados; ProblemDetails sin detalles internos fuera de Development. |
| Eventos polimórficos | `Models/ChatStreamEvents.cs` (`[JsonPolymorphic]` / `[JsonDerivedType]`) | Contrato SSE tipado en lugar de un objeto con ~10 campos opcionales y una cadena de `if/else`. |
| Cache-aside con TTL | `Infrastructure/Foundry/FoundryAgentCatalog.cs` (`IMemoryCache`) | Sustituye estáticos que nunca se invalidaban: publicar una versión nueva del agente ya no exige reiniciar. |
| Hosted service | `Infrastructure/Foundry/UploadedFilesCleanupService.cs` (`BackgroundService`) | Sustituye un endpoint que permitía a cualquier usuario borrar archivos de todos por un proceso programado con retención. |
| Seguro por defecto | `Security/SecurityServiceCollectionExtensions.cs` (`SetFallbackPolicy`) | Cualquier endpoint nuevo exige autenticación y el scope; los públicos usan `AllowAnonymous()` de forma explícita. |
| Validación previa (Result) | `Application/Validation/ChatRequestValidator.cs`, `Application/Attachments/AttachmentValidator.cs` | La entrada se valida antes de crear conversaciones, subir archivos o consumir tokens; devuelve errores en lugar de lanzar excepciones. |

## 3. Patrones aplicados: frontend

| Patrón | Dónde | Qué resuelve |
|---|---|---|
| Carpetas por feature | `src/features/battlecard`, `src/features/landing` | Cada funcionalidad crece en su carpeta; los tipos ya no dependen de páginas ni servicios. |
| Reducer / máquina de estados (`idle → preparing → streaming → idle`) | `features/battlecard/state/consoleState.ts` | Una sola fuente de verdad, pura y probada; elimina la sincronización manual de 14 estados. |
| Provider + separación entre contenedor y presentación | `state/AgentConsoleProvider.tsx` (lógica); `components/*` (vista) | El streaming sobrevive a la navegación entre páginas; los componentes solo pintan y llaman acciones. |
| Custom hooks | `hooks/useAutoScroll.ts`, `hooks/useFilePicker.ts`, `src/hooks/useAuth.ts` | Comportamiento reutilizable fuera de los componentes. |
| Adapter de API | `api/agentStreamClient.ts` | Un único cliente HTTP + SSE (antes había tres implementaciones distintas). |
| Configuración y contenido centralizados | `src/config/appConfig.ts`, `model/consoleContent.ts` | Límites, textos y opciones fuera de los componentes; límites alineados con el backend. |
| Code splitting por ruta | `React.lazy` en `App.tsx` | Cada página carga su código y su CSS cuando se visita (bundle inicial de 930 KB a 692 KB). |
| Componente de presentación segura | `components/markdown/SafeMarkdown.tsx` + `linkPolicy.ts` | Un único punto para renderizar la salida del agente como contenido no confiable. |

## 4. Patrones evaluados y no aplicados

| Patrón | Qué se hizo en su lugar | Motivo | Cuándo convendría |
|---|---|---|---|
| Autorización por recurso de ASP.NET (`ConversationOwnerRequirement` + handler) | La regla de dueño está en `ConversationService` | Para conocer el dueño hay que leer la conversación de Foundry, y ese servicio ya la lee. Un handler implicaba una segunda lectura por petición o más complejidad sin beneficio. La regla es única y está cubierta por pruebas de integración. | Si aparecen más recursos con reglas de acceso (archivos, Battlecards guardadas, roles). |
| Decorator de telemetría sobre `IAgentGateway` | Las métricas se registran en `ChatService` | Solo hay tres métricas y un único punto de medición. | Si crece la instrumentación (latencia por herramienta, reintentos, costos por modelo). |
| `IEndpointFilter` para validación | Validación al inicio del endpoint | Solo hay un endpoint con cuerpo. | Si se añaden más endpoints que reciban datos del usuario. |
| `TypedResults.ServerSentEvents` (.NET 10) | Escritura SSE propia de 3 líneas | Mantiene exactamente el formato `data: {json}\n\n` que el frontend ya interpreta y está probado. | Si se necesitan ids de evento, reconexión o heartbeats. |
| Strategy separada para credenciales | Un `if` entre managed identity y OBO en `FoundryClientFactory` | Solo hay dos modos y no se prevén más. | Si aparece un tercer modo de identidad. |
| Strategy de políticas de adjuntos (frontend) | Límites centralizados en `appConfig.ts` | Solo hay dos tipos (imagen y documento). | Si se añaden tipos con reglas propias (audio, Office convertido). |
| CSS Modules | CSS extraído a archivos `.css` por página | Renombrar todas las clases sin poder verificar la interfaz visualmente era arriesgado. | Ahora que la interfaz está validada: es el siguiente paso de mantenibilidad del frontend. |
| Catálogo i18n | Textos centralizados en `consoleContent.ts` | La aplicación solo existe en español. | Si se necesita otro idioma. |
| MediatR / CQRS | No aplicado | Con 4 endpoints sería indirección sin beneficio. | Si el número de casos de uso crece de forma significativa. |

## 5. Pendientes de código relacionados

- Interfaz de historial de conversaciones (la API `GET /api/conversations` ya filtra por usuario).
- Migración de estilos a CSS Modules.
- Pruebas de componentes con Testing Library.
- Pipeline de CI (hoy solo hay Dependabot).

## 6. Modelo de acceso (Entra ID)

### Decisión

Leitner IA es una aplicación interna. Puede usarla **cualquier usuario autenticado del tenant de CONSEIN**; no hay roles funcionales.

| Aspecto | Decisión |
|---|---|
| Tipo de cuenta | Single-tenant (`AzureADMyOrg`): solo cuentas de este directorio |
| Enterprise Application | *Assignment required* = **No** (`appRoleAssignmentRequired: false` en `infra/entra-app.bicep`) |
| Restricción por grupo | **Opcional** con `ENTRA_ALLOWED_GROUP_ID`. Vacía o ausente: no se evalúa ningún grupo. Con un GUID: restricción adicional. Con un valor que no sea GUID: la API no arranca (`ValidateOnStart`) y `preprovision` falla |
| App roles | No se crean mientras no existan capacidades funcionales distintas |
| Azure RBAC | Solo para identidades técnicas sobre recursos de Azure (managed identity → Foundry, ACR, App Insights). Nunca para usuarios finales |
| Redirect URIs de localhost | Solo con `ENTRA_ALLOW_LOCALHOST_REDIRECTS=true` (opción explícita de desarrollo). Solo admite `true`, `false` o vacío; otro valor hace fallar `postprovision` |

### Dónde se aplica

Todo está en `backend/WebApp.Api/Security/`. Ningún endpoint repite estas comprobaciones.

| Pieza | Responsabilidad |
|---|---|
| `EntraOptions` + `EntraOptionsValidator` | `TenantId` y `ClientId` (SPA) obligatorios (GUID); `BackendClientId` opcional (GUID distinto de `ClientId`; si existe, es la única audiencia); `AllowedGroupId` vacío o GUID canónico. Validación al arrancar |
| `EntraTokenValidation` | Issuer igual al v1 o v2 **del tenant configurado** y `tid` coincidente; audiencias `{clientId}` y `api://{clientId}`; firma y expiración obligatorias; tolerancia de reloj de 2 minutos. Se aplica con `PostConfigure`, después de Microsoft.Identity.Web |
| `CorporateAccessAuthorization` | `TenantMemberRequirement` (defensa en profundidad sobre `tid`) y `AllowedGroupRequirement` (se cumple siempre si no hay grupo; si lo hay, exige el claim `groups`) |
| `SecurityServiceCollectionExtensions` | Una sola política: autenticado + scope `Chat.ReadWrite` + ambos requisitos, aplicada al grupo `/api` y como política de respaldo |

La ausencia de grupo **nunca** desactiva la validación del token: issuer, tenant, audiencia, firma y expiración se validan siempre.

### Restricción por grupo: detalles

- Cuando `ENTRA_ALLOWED_GROUP_ID` tiene valor, Bicep activa `groupMembershipClaims: SecurityGroup` en la app (y en la app de OBO, si existe) para que el access token incluya el claim `groups`.
- Si un usuario pertenece a más grupos de los que caben en el token (más de 200 en JWT), Entra ID no envía `groups` sino un indicador de *overage*. La API **deniega** el acceso (fail closed) y registra un aviso. Resolver el overage con Microsoft Graph no está implementado porque requiere permisos adicionales y añade latencia.
- Al activar o desactivar el grupo hay que reaprovisionar (`azd provision`): cambia la configuración de la app de Entra y la variable del contenedor. Los usuarios deben volver a iniciar sesión para recibir un token con el claim.

### Usuarios invitados (B2B)

"Todos los usuarios del tenant" **incluye las cuentas Guest del directorio**. Un invitado B2B inicia sesión en el tenant de CONSEIN y recibe un token emitido por ese tenant (`tid` de CONSEIN), por lo que cumple todas las validaciones. Single-tenant no excluye invitados por sí mismo. Con `ENTRA_ALLOWED_GROUP_ID` configurado, un invitado solo accede si alguien lo añade al grupo.

**Exclusión de invitados (no implementada).** El claim opcional `acct` distingue el tipo de cuenta:

| `acct` | Cuenta |
|---|---|
| `0` | Miembro del tenant |
| `1` | Invitado (Guest) |

Cambios necesarios si CONSEIN decide excluirlos:

1. **Bicep** (`infra/entra-app.bicep`): añadir el claim opcional al **access token** de la app que es audiencia de la API. Es el recurso `app` en la arquitectura de un solo registro, junto a `groupMembershipClaims` (línea ~40), y `backendApp` si OBO está activo (línea ~84):

   ```bicep
   optionalClaims: {
     accessToken: [
       { name: 'acct', essential: false }
     ]
   }
   ```

2. **Backend**: la comprobación va en `TenantMemberHandler.HandleRequirementAsync` (`backend/WebApp.Api/Security/CorporateAccessAuthorization.cs`, línea ~19). Solo debe llamar a `context.Succeed` si además `acct` es `0`, y denegar si falta (fail closed). No hace falta tocar la política: `TenantMemberRequirement` ya está registrada en `SecurityServiceCollectionExtensions.cs` (`.AddRequirements(...)`, línea ~71).
3. **Pruebas**: un miembro (`acct=0`) devuelve 200; un invitado (`acct=1`) y un token sin `acct`, 403.

Con Microsoft Entra ID P1 también puede hacerse sin código, con una directiva de **Acceso condicional** que bloquee "Guest or external users" para esta aplicación.

### Auditoría del modelo (2026-11-11)

**Registros de aplicación.** El entorno desplegado usa **un solo registro** para el SPA y la API:

| Dato | Valor |
|---|---|
| Registro | `ai-foundry-agent-env-LeitnerIA` |
| Client ID | `491ceed0-443d-4414-b16f-91ecdcafafeb` |
| Application ID URI | `api://491ceed0-443d-4414-b16f-91ecdcafafeb` |
| Scope expuesto | `Chat.ReadWrite` |
| Cuentas | `AzureADMyOrg` |
| Versión del access token | No fijada (`requestedAccessTokenVersion` null), por lo que es v1: `aud` = Application ID URI, `iss` = `https://sts.windows.net/{tid}/` |

El Container App no tiene `ENTRA_BACKEND_CLIENT_ID`, así que OBO no está activo. Si se activa (`ENABLE_OBO=true`), Bicep crea un segundo registro (`ai-foundry-agent-backend-<entorno>`) que pasa a ser la **única** audiencia aceptada.

**Audiencia aceptada** (`EntraOptions.ApiClientId`, que es `ENTRA_BACKEND_CLIENT_ID` si existe y si no `ENTRA_SPA_CLIENT_ID`): `api://{ApiClientId}` y `{ApiClientId}`. Son las dos formas (v1 y v2) del mismo registro. Con dos registros, el Client ID del SPA se rechaza con 401. `ENTRA_BACKEND_CLIENT_ID` igual a `ENTRA_SPA_CLIENT_ID` es un error de configuración y la API no arranca.

**Scope solicitado** (`frontend/src/config/authConfig.ts`, usado por `loginRequest` y `tokenRequest`, y este por `useAuth().getAccessToken`): `api://{VITE_ENTRA_BACKEND_CLIENT_ID || VITE_ENTRA_SPA_CLIENT_ID}/Chat.ReadWrite`. Hoy es `api://491ceed0-443d-4414-b16f-91ecdcafafeb/Chat.ReadWrite`.

- La API lo exige con `RequireScope("Chat.ReadWrite")` (Microsoft.Identity.Web), que separa `scp` por espacios y compara token a token, distinguiendo mayúsculas. `Chat.ReadWrite.All`, `XChat.ReadWrite` y `chat.readwrite` se rechazan (pruebas en `EntraAuditTests`).
- En modo OBO, la imagen del frontend debe construirse con `VITE_ENTRA_BACKEND_CLIENT_ID`. `predeploy.ps1` lo pasa como build arg cuando `ENTRA_BACKEND_CLIENT_ID` existe.

**Políticas.**

- `FallbackPolicy` y la política `RequireChatScope` del grupo `/api` son **la misma instancia**. Exige:
  - usuario autenticado (token válido: issuer y `tid` del tenant, audiencia, firma y expiración);
  - scope `Chat.ReadWrite`;
  - `TenantMemberRequirement`;
  - `AllowedGroupRequirement`.
- No existe una política más débil. Una prueba recorre todos los endpoints registrados y falla si alguno de `/api` usa otra política o permite acceso anónimo sin estar en la lista.

| Endpoint | Acceso |
|---|---|
| `POST /api/chat/stream` | `RequireChatScope` |
| `GET /api/agent` | `RequireChatScope` |
| `GET /api/conversations` | `RequireChatScope` |
| `GET /api/conversations/{id}/messages` | `RequireChatScope` + propietario (`ConversationService`, 404 si no lo es) |
| `/api/{**path}` (rutas desconocidas) | FallbackPolicy (401 sin token, 404 con token válido) |
| `GET /api/health`, `GET /health`, `GET /alive` | Anónimos: sondas de Container Apps; solo devuelven el estado |
| SPA (archivos estáticos y fallback `{*path:nonfile}`) | Anónimos: la página debe cargar para iniciar sesión; no contiene datos |

No hay endpoints de archivos: se eliminaron en la fase 1.

**Respuestas 401 y 403.**

- Se producen en el middleware, **antes** de llegar a los endpoints: no se invoca `IAgentGateway` ni se crean conversaciones (verificado en las pruebas).
- `Content-Type: application/problem+json; charset=utf-8`, con `title` y `detail` en español:
  - 401: "Sesión no válida / Su sesión no es válida o ha expirado…"
  - 403: "Acceso denegado / No tiene permiso para usar Leitner IA…"
- No incluyen issuer, tenant, client ID, grupo ni claims. `WWW-Authenticate` es `Bearer` sin `error_description` (`IncludeErrorDetails = false`).
- `agentStreamClient.ts` lee el `detail` (acepta cualquier content-type que contenga `json`) y lo muestra en el chat.

**Grupos.**

- Sin grupo configurado, no se exige el claim `groups` y un *overage* no bloquea.
- Con grupo configurado:
  - Se exige coincidencia exacta del GUID en formato canónico (`D`), sin distinguir mayúsculas.
  - Claim ausente: 403. *Overage*: 403.
  - El aviso de *overage* no imprime grupos, claims ni identificadores (verificado con un logger de prueba).

### Pendiente de permisos de Entra o Azure

- Aplicar el cambio con `azd provision` (revisión senior): fija `appRoleAssignmentRequired: false` (hoy ya está en `false` en el entorno desplegado) y, solo si se configura un grupo, `groupMembershipClaims`.
- Si en algún momento se activó la asignación obligatoria o se asignaron usuarios manualmente, esas asignaciones quedan sin efecto pero no se borran; pueden retirarse en *Enterprise applications > Users and groups*.
