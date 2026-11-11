# Leitner IA | Inteligencia competitiva para Battlecards accionables

> **Leitner IA convierte contexto comercial y competitivo en Battlecards estructuradas para ventas, preventa y marketing.**

Leitner IA es una aplicación web de inteligencia competitiva desarrollada para CONSEIN. Compara a CONSEIN con empresas que participan en mercados, servicios o ecosistemas tecnológicos similares (consultoras, partners de Microsoft, proveedores de nube) y genera una Battlecard con hallazgos, ventajas, riesgos y recomendaciones comerciales, organizada en tres capas: empresa, servicio y producto.

La URL del entorno desplegado se obtiene con `azd env get-value WEB_ENDPOINT`.

## Contenido

- [Descripción](#descripción)
- [Manual de usuario](#manual-de-usuario)
- [Metodología de análisis](#metodología-de-análisis)
- [Arquitectura](#arquitectura)
- [Tecnologías](#tecnologías)
- [Seguridad y uso responsable](#seguridad-y-uso-responsable)
- [Desarrollo local](#desarrollo-local)
- [Despliegue](#despliegue)
- [Pruebas y calidad](#pruebas-y-calidad)
- [Estructura del repositorio](#estructura-del-repositorio)
- [Alcance y limitaciones conocidas](#alcance-y-limitaciones-conocidas)
- [Documentación relacionada](#documentación-relacionada)

## Descripción

### Problema que resuelve

Elaborar Battlecards a mano exige reunir información dispersa, comparar empresas con criterios inconsistentes y convertir hallazgos técnicos en argumentos de venta. El resultado suele ser lento, desigual entre vendedores y difícil de reutilizar. Leitner IA impone una estructura común y produce un documento listo para revisión.

### ¿Qué es una Battlecard?

Un documento breve y accionable para posicionar una propuesta frente a una alternativa competitiva: resumen ejecutivo, contexto de la oportunidad, perfil de las empresas, diferenciadores, fortalezas y riesgos, comparación de servicios y productos, objeciones previsibles, mensajes recomendados y fuentes consultadas.

> La Battlecard apoya la preparación de la conversación. No sustituye la validación del especialista, del responsable comercial ni de las fuentes originales.

### Usuarios

| Perfil | Uso principal |
|---|---|
| Ventas | Argumentos, preguntas de descubrimiento y recomendaciones de posicionamiento |
| Preventa | Relación entre necesidades del cliente, capacidades técnicas, integraciones y riesgos |
| Marketing | Diferenciadores, mensajes y segmentos |
| Gerencia | Metodología común y reutilización del conocimiento comercial |

## Manual de usuario

### Acceso

1. Abra la URL de la aplicación. Se le redirigirá al inicio de sesión corporativo de Microsoft (Entra ID).
2. Puede entrar cualquier usuario de la organización (tenant de CONSEIN). Si el entorno tiene configurada la restricción opcional por grupo (`ENTRA_ALLOWED_GROUP_ID`), solo sus miembros podrán usar el agente; los demás verán "Acceso denegado" al enviar un mensaje y deben pedir al administrador que los incluya en el grupo.
3. La sesión se guarda solo en la pestaña actual; al abrir otra pestaña el inicio de sesión es automático.

### Páginas

- **Inicio (`/`)**: propuesta de valor, método y tecnologías.
- **Probar agente (`/agente`)**: consola de generación, con un formulario guiado a la izquierda y el chat con el agente a la derecha.

### Generar una Battlecard con el formulario guiado

1. Responda las **cinco preguntas obligatorias**: oferta, cliente ideal, competidores, resultado esperado y enfoque del análisis (*Estratégico basado en evidencia* o *Estrictamente verificado*).
2. Opcionalmente indique sector, contexto adicional y **archivos de referencia** (arrastre o seleccione):
   - Imágenes PNG, JPEG, GIF o WebP: hasta 5 imágenes, 5 MB cada una.
   - Documentos PDF, TXT, MD, CSV, JSON, HTML o XML: hasta 10 documentos, 20 MB cada uno.
   - **Máximo 20 MB en total por mensaje.** Word, Excel y PowerPoint no se admiten: expórtelos a PDF.
3. Pulse **Preparar solicitud**. El texto aparece en el cuadro del chat para que lo revise y edite. **Nada se envía hasta pulsar Enviar.**
4. Pulse **Enviar**. La respuesta llega en tiempo real; el indicador muestra cuándo el agente usa herramientas (búsqueda web, herramientas MCP).
5. Si el flujo genera el documento, aparece el botón **Abrir archivo generado**, que enlaza al archivo en el SharePoint de CONSEIN.

### Chat libre

Escriba directamente en el chat (Enter envía, Shift + Enter crea una nueva línea) o use una de las sugerencias rápidas. La conversación mantiene el contexto entre mensajes.

### Otras acciones

- **Cancelar** detiene la generación en curso; el texto recibido hasta ese momento se conserva.
- **Reiniciar** comienza una conversación nueva y limpia el formulario.
- Puede navegar entre *Inicio* y *Probar agente* sin perder la conversación, incluso mientras se genera una respuesta.

### Mensajes frecuentes

| Mensaje | Qué hacer |
|---|---|
| "Demasiadas solicitudes" | Hay un límite de 20 mensajes por minuto por usuario. Espere un momento. |
| "El total de adjuntos no puede superar 20 MB" | Quite archivos o envíelos en mensajes distintos. |
| "La conversación no existe o no pertenece al usuario actual" | Pulse **Reiniciar**. Cada usuario solo puede acceder a sus propias conversaciones. |
| "[Imagen omitida]" en la respuesta | Por seguridad, las imágenes externas sugeridas por el agente no se cargan. |

## Metodología de análisis

Cada Battlecard se organiza en tres niveles, para no mezclar reputación corporativa, capacidad de entrega y características técnicas:

1. **Empresa**: posicionamiento, capacidades, alianzas, diferenciadores y riesgos competitivos.
2. **Servicio**: alcance, especialización, modelo de acompañamiento, implementación, soporte y continuidad.
3. **Producto o solución**: capacidades técnicas, integraciones, alineación con Microsoft, casos de uso, restricciones y riesgos de adopción.

## Arquitectura

Monolito modular en un único Azure Container App: el backend ASP.NET Core sirve la SPA de React y expone la API.

```text
Usuario del tenant (Entra ID single-tenant; grupo opcional)
   │ HTTPS (TLS en el ingress de Container Apps)
   ▼
Container App "ca-web-<token>"  (escala a cero en dev)
 ├─ SPA React (wwwroot)            ← CSP, HSTS, nosniff, frame-ancestors 'none'
 └─ API ASP.NET Core 10
     Endpoints (/api, política por defecto con scope Chat.ReadWrite, rate limiting por usuario)
       → Application: ChatService, ConversationService (dueño = oid), validación de adjuntos
       → Infrastructure: FoundryAgentGateway, FoundryConversationStore (adaptadores)
                         cliente Foundry singleton con managed identity
   │ Managed identity ("Foundry User" en el proyecto)
   ▼
Azure AI Foundry (agente LeitnerIA)
 ├─ Búsqueda web
 └─ Servidor MCP de Battlecards (Azure Functions) → Power Automate → Word → SharePoint
Observabilidad: Application Insights (backend y frontend) → Log Analytics
```

Decisiones principales:

- **Un solo contenedor**: menor costo (escala a cero), un artefacto de despliegue y mismo origen para la SPA y la API (no hace falta CORS en Azure).
- **Puertos y adaptadores**: el SDK de Foundry queda aislado detrás de `IAgentGateway` e `IConversationStore`, lo que permite pruebas sin Azure.
- **Aislamiento por usuario**: cada conversación guarda el `oid` de su dueño en la metadata de Foundry; toda lectura o escritura lo verifica.
- **Sin secretos**: la API se autentica ante Foundry con managed identity (u On-Behalf-Of del usuario, opcional, sin secretos gracias a una credencial federada).

El detalle técnico está en [ARCHITECTURE-FLOW.md](ARCHITECTURE-FLOW.md).

### Alternativas evaluadas

| Alternativa | Cuándo conviene |
|---|---|
| SPA en Static Web Apps + API separada en Container Apps | El frontend crece mucho o lo mantiene otro equipo; requiere CORS y dos pipelines. |
| BFF + API Management | Varios agentes de CONSEIN detrás de un gateway común, con cuotas por usuario y tokens fuera del navegador; mayor costo. |
| Historial propio en Cosmos DB (serverless) | Historial de Battlecards con búsqueda y aislamiento fuerte por partición `oid`; añade un recurso. |

## Tecnologías

| Capa | Tecnología |
|---|---|
| Frontend | React 19, TypeScript, Vite, Fluent UI, react-markdown + rehype-sanitize, MSAL.js |
| Backend | ASP.NET Core 10 (minimal APIs), Microsoft.Identity.Web, Azure.AI.Projects 2.0 (GA), OpenTelemetry |
| IA | Azure AI Foundry Agent Service (agente `LeitnerIA`), búsqueda web, MCP |
| Automatización documental | Power Automate, plantillas Word, SharePoint (fuera de este repositorio) |
| Identidad | Microsoft Entra ID (SPA + API, scope `Chat.ReadWrite`), managed identity |
| Plataforma | Azure Container Apps, Azure Container Registry, Application Insights, Log Analytics |
| IaC y despliegue | Bicep, Azure Developer CLI (`azd`) con hooks de PowerShell |

## Seguridad y uso responsable

Controles implementados:

- Single-tenant: solo se aceptan tokens del tenant configurado. Se validan estrictamente el issuer y el `tid`, la audiencia, la firma y la expiración.
- Acceso para todos los usuarios autenticados del tenant, con restricción opcional por grupo (`ENTRA_ALLOWED_GROUP_ID`). Las decisiones de acceso están centralizadas en `backend/WebApp.Api/Security`. Ver [modelo de acceso](docs/decisiones-arquitectura.md#6-modelo-de-acceso-entra-id).
- Política de autorización por defecto: cualquier endpoint nuevo exige autenticación.
- Aislamiento de conversaciones por usuario; un ID ajeno devuelve 404.
- Validación de entrada antes de llamar a Azure: tamaño del mensaje, formato de IDs, tipo real de los adjuntos (firma binaria y UTF-8) y límite del cuerpo de la petición.
- Límite de solicitudes por usuario.
- Salida del agente tratada como no confiable: HTML saneado, imágenes externas bloqueadas y CSP restrictiva.
- Tokens MSAL guardados en `sessionStorage`; sin secretos en el código ni en la configuración.
- Telemetría sin contenido de usuario (sin prompts, respuestas ni nombres de archivo).

Uso responsable:

- Use solo fuentes públicas o conocimiento interno autorizado; no incluya credenciales ni datos confidenciales de clientes en los prompts.
- Distinga hechos verificables de inferencias. Trate precios, certificaciones y alianzas como información que cambia con el tiempo.
- Evite afirmaciones especulativas o difamatorias sobre competidores.
- Haga una **revisión humana** antes de usar una Battlecard con un cliente.

Las recomendaciones pendientes (red privada, endurecimiento del servidor MCP y de Foundry) están en [infra/README.md](infra/README.md#postura-de-seguridad).

## Desarrollo local

Requisitos: Git, Node.js 22, .NET SDK 10, PowerShell 7, Azure CLI y Azure Developer CLI; acceso al proyecto de Foundry (rol *Foundry User*) y un entorno `azd` ya aprovisionado.

```powershell
git clone https://github.com/AngeloooG/foundry-agent-LeitnerIA.git
cd foundry-agent-LeitnerIA
az login
azd env select <entorno>            # o: azd env new <entorno>; azd provision
azd env set ENTRA_ALLOW_LOCALHOST_REDIRECTS true
azd hooks run postprovision         # genera frontend/.env.local y backend/WebApp.Api/.env (solo identificadores)
./deployment/scripts/start-local-dev.ps1
```

- Frontend: <http://localhost:5173> (Vite, con proxy de `/api` al backend).
- Backend: <http://localhost:8080>. En Development usa su sesión de `az login` (no hay claves).

Comandos útiles:

```powershell
cd backend;  dotnet build; dotnet test        # pruebas del backend
cd frontend; npm ci; npm run lint; npm test; npm run build
```

> En equipos donde una política bloquea ejecutables en Documentos, ejecute las pruebas del backend con
> `dotnet backend/WebApp.Api.Tests/bin/Debug/net10.0/WebApp.Api.Tests.dll`.

## Despliegue

Despliegue con Azure Developer CLI (detalle en [deployment/README.md](deployment/README.md) e [infra/README.md](infra/README.md)):

```powershell
azd auth login
azd env new <entorno>
./deployment/scripts/set-environment-profile.ps1 -Profile prod   # o dev
azd env set AI_FOUNDRY_RESOURCE_NAME <cuenta-foundry>
azd env set AI_FOUNDRY_PROJECT_NAME <proyecto>
azd env set AI_AGENT_ID LeitnerIA
# Opcional: restringir el acceso a un grupo (vacío = todos los usuarios del tenant)
# azd env set ENTRA_ALLOWED_GROUP_ID <object-id-del-grupo>
azd provision --preview    # revise los cambios
azd up                     # aprovisiona, construye la imagen y la publica
```

Antes de producción:

1. Los cambios de RBAC, Entra ID y red requieren **revisión senior**.
2. Compruebe con `azd env get-values` que no hay secretos en el entorno.
3. Después de verificar la app, retire los roles heredados de la identidad: `azd env set REMOVE_LEGACY_FOUNDRY_ROLES true; azd hooks run postprovision`.
4. Revise el endurecimiento de los recursos externos con `deployment/scripts/harden-external-resources.ps1` (por defecto solo muestra los comandos).

## Pruebas y calidad

| Proyecto | Herramienta | Cubre |
|---|---|---|
| Backend | MSTest + WebApplicationFactory | Autenticación (401/403), aislamiento por usuario, validación y adjuntos, límite de solicitudes, cabeceras de seguridad, contrato SSE, configuración |
| Frontend | Vitest | Parser SSE, reducer de la consola, formulario, adjuntos, Markdown seguro y política de enlaces |

Dependabot propone actualizaciones semanales de npm, NuGet e imágenes Docker.

## Estructura del repositorio

```text
backend/        API ASP.NET Core (Application / Infrastructure / Endpoints / Security) y pruebas
frontend/       SPA React (features/battlecard, features/landing)
infra/          Bicep (Container Apps, ACR, monitorización, Entra ID)
deployment/     Dockerfile, hooks de azd y scripts operativos
VENTAS.md       Documentación comercial
```

## Alcance y limitaciones conocidas

- El **historial de Battlecards** está disponible en la API (`GET /api/conversations`, filtrado por usuario), pero la interfaz todavía no lo muestra.
- La generación del documento (Power Automate, Word y SharePoint) y el servidor MCP se configuran fuera de este repositorio.
- El listado de conversaciones revisa como máximo las 500 más recientes del agente, porque Foundry no filtra por metadata.
- Las imágenes adjuntas se eliminan del almacenamiento de Foundry después de 7 días (`Uploads:RetentionHours`).
- Los indicadores de demostración de la página de inicio son datos de muestra hasta que haya telemetría real.

## Documentación relacionada

- [ARCHITECTURE-FLOW.md](ARCHITECTURE-FLOW.md): flujo técnico de punta a punta.
- [docs/decisiones-arquitectura.md](docs/decisiones-arquitectura.md): patrones aplicados y descartados, con su justificación.
- [backend/README.md](backend/README.md) y [frontend/README.md](frontend/README.md).
- [infra/README.md](infra/README.md): recursos, parámetros, costos y postura de seguridad.
- [deployment/README.md](deployment/README.md): hooks y scripts.
- [VENTAS.md](VENTAS.md): propuesta comercial.

---

**CONSEIN**: inteligencia competitiva, automatización y soluciones empresariales sobre el ecosistema Microsoft.
