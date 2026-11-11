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
