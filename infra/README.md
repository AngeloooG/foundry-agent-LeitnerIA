# LeitnerIA: infraestructura (Bicep + azd)

Infraestructura como código con Bicep, desplegada con Azure Developer CLI. Las plantillas compiladas (`*.json`) **no se versionan**: azd compila el Bicep en cada despliegue.

## Recursos

| Recurso | Nombre | Plantilla | Notas |
|---|---|---|---|
| Resource group | `rg-<entorno>` | `main.bicep` | Ámbito de suscripción |
| Log Analytics | `law-<token>` | `core/host/log-analytics.bicep` | Retención y tope diario parametrizables |
| Application Insights (backend) | `appi-<token>` | `core/host/application-insights.bicep` | Ingesta con Entra ID opcional |
| Application Insights (frontend) | `appi-fe-<token>` | ídem | Telemetría del navegador (clave pública por diseño) |
| Container Registry | `cr<token>` | `core/host/container-registry.bicep` | Basic, admin deshabilitado, pull con managed identity |
| Container Apps Environment | `cae-<token>` | `core/host/container-apps-environment.bicep` | Consumption, sin VNet |
| Managed identity (user-assigned) | `id-web-<token>` | `main-infrastructure.bicep` | `isolationScope: Regional` |
| Container App | `ca-web-<token>` | `core/host/container-app.bicep` | SPA + API, puerto 8080, sondas `/api/health` |
| App Entra (SPA + API) | `ai-foundry-agent-<entorno>` | `entra-app.bicep` | Single-tenant, scope `Chat.ReadWrite`, sin asignación requerida; claim `groups` solo si hay grupo configurado |
| App Entra backend (OBO) | `ai-foundry-agent-backend-<entorno>` | ídem | Solo con `ENABLE_OBO=true` |

**Fuera de este Bicep**, configurados con hooks o de forma manual:

- La cuenta y el proyecto de Azure AI Foundry, y el agente.
- El rol "Foundry User" de la identidad, asignado por `postprovision.ps1` a nivel de proyecto.
- El servidor MCP (Azure Functions), Power Automate y SharePoint.

`<token>` = `uniqueString(subscription, entorno, región)`. Los nombres de las apps de Entra conservan el prefijo de la plantilla original: renombrarlas crearía registros nuevos y rompería el inicio de sesión.

## Parámetros por entorno

Se configuran como variables de azd (`azd env set NOMBRE valor`), que `main.parameters.json` traduce a parámetros de Bicep. El script `deployment/scripts/set-environment-profile.ps1 -Profile dev|prod` aplica un perfil completo.

| Variable azd | Por defecto | dev | prod | Impacto |
|---|---|---|---|---|
| `CONTAINER_CPU` / `CONTAINER_MEMORY` | 0.5 / 1Gi | 0.5 / 1Gi | 0.5 / 1Gi | Costo por segundo activo |
| `CONTAINER_MIN_REPLICAS` | 0 | 0 | 1 | 0 = escala a cero (costo casi nulo en reposo, arranque en frío de ~10-20 s) |
| `CONTAINER_MAX_REPLICAS` | 3 | 2 | 5 | Límite de escalado (y de costo) |
| `INGRESS_ALLOWED_IP_RANGES` | `[]` | `[]` | IPs corporativas | Lista de IPs permitidas en el ingress; vacía = cualquier IP (el login sigue siendo obligatorio) |
| `LOG_RETENTION_DAYS` | 30 | 30 | 90 | Más de 30 días tiene costo adicional |
| `LOG_DAILY_QUOTA_GB` | -1 | 1 | -1 | Tope de ingesta diaria (protege el presupuesto) |
| `CONTAINER_REGISTRY_SKU` | Basic | Basic | Basic | Premium solo si se necesitan private endpoints |
| `ENABLE_ENTRA_TELEMETRY_AUTH` | false | false | true | Deshabilita la ingesta por clave en el App Insights del backend y concede Monitoring Metrics Publisher a la identidad |
| `ENTRA_ALLOW_LOCALHOST_REDIRECTS` | (vacío = no) | true | false | Redirect URIs `http://localhost` (solo para desarrollo) |
| `ENTRA_ALLOWED_GROUP_ID` | (vacío) | (vacío) | opcional | Vacío = todos los usuarios del tenant. Con un GUID de grupo, la API solo autoriza a sus miembros (claim `groups`). `preprovision` y la API rechazan un valor que no sea GUID |
| `AI_FOUNDRY_RESOURCE_NAME` / `AI_FOUNDRY_PROJECT_NAME` | (descubre) | | | Obligatorios si hay más de una cuenta o proyecto |
| `AI_AGENT_ID` / `AI_AGENT_VERSION` | | | | Agente y versión fija (opcional) |
| `REMOVE_LEGACY_FOUNDRY_ROLES` | false | | true tras verificar | Retira los 3 roles amplios anteriores |
| `ENABLE_OBO` | false | | | On-Behalf-Of (el agente actúa con la identidad del usuario) |

## Despliegue

```powershell
az login; azd auth login
azd env new <entorno>                     # o: azd env select <entorno>
./deployment/scripts/set-environment-profile.ps1 -Profile dev
azd env set AI_FOUNDRY_RESOURCE_NAME <cuenta>; azd env set AI_FOUNDRY_PROJECT_NAME <proyecto>
azd env set AI_AGENT_ID LeitnerIA
azd provision --preview                   # revise el plan antes de aplicar
azd up                                    # provision + build + rollout
```

El orden de ejecución:

1. `preprovision.ps1`: valida las herramientas, resuelve la cuenta y el proyecto de Foundry (nunca elige en silencio si hay varios) y el agente.
2. Bicep (`main.bicep`).
3. `postprovision.ps1`:
   - `identifierUri` y redirect URIs.
   - OBO (opcional).
   - Rol "Foundry User" a nivel de proyecto.
   - Asignación del usuario que despliega y del grupo a la app.
   - Archivos `.env` locales (solo identificadores).
4. `predeploy.ps1`: construye la imagen (`deployment/docker/web.Dockerfile`), la sube a ACR con Entra ID y actualiza el Container App.

`azd down` elimina el resource group. `postdown.ps1` elimina además las apps de Entra (incluida la de OBO y su consentimiento) y las asignaciones de rol en Foundry.

Validación sin desplegar:

```powershell
az bicep build --file infra/main.bicep --outdir $env:TEMP     # compila y aplica el linter
azd provision --preview                                         # what-if
```

## Postura de seguridad

**Implementado:**

- Cero secretos: pull de ACR, acceso a Foundry y OBO con managed identity y credencial federada. El usuario admin de ACR está deshabilitado.
- Ingress solo HTTPS (`allowInsecure: false`); el contenedor se ejecuta como usuario no root.
- Rol único "Foundry User" (id `53ca6127-…`, antes llamado "Azure AI User"), limitado al **proyecto**. Sustituye a Cognitive Services User, Cognitive Services OpenAI Contributor y Azure AI Developer a nivel de cuenta.
- App de Entra single-tenant sin asignación requerida: la autorización la hace la API (issuer y `tid` del tenant, audiencia, firma, expiración, scope y grupo opcional). Las redirect URIs de localhost solo existen si `ENTRA_ALLOW_LOCALHOST_REDIRECTS=true`.
- Las connection strings de App Insights son secretos de Container Apps; la ingesta del backend puede autenticarse con Entra ID.
- La lista de IPs del ingress está disponible.

**Pendiente o recomendado** (requiere revisión senior; cambios de red y permisos):

| Riesgo | Recomendación | Costo |
|---|---|---|
| ACR, Log Analytics y Foundry con acceso público | VNet en el Container Apps Environment, private endpoints para Foundry y ACR (Premium) | ACR Premium y private endpoints (alrededor de US$ 7-8 al mes cada uno, más DNS) |
| Container Apps Environment usa la clave compartida de Log Analytics | Migrar a `azure-monitor` + diagnostic settings (cambia las tablas de logs) | Sin costo adicional |
| "Foundry User" incluye `listkeys` | Rol personalizado solo con data actions de `Microsoft.CognitiveServices/accounts/AIServices/*` y `OpenAI/*` | Sin costo |
| Servidor MCP (Function `leitnermcp3`): `httpsOnly=false`, sin autenticación, sin managed identity; storage con clave compartida y TLS 1.0 | `deployment/scripts/harden-external-resources.ps1` (dry run por defecto) | Sin costo |
| Foundry con autenticación local (claves) habilitada | `disableLocalAuth=true` tras verificar que ningún consumidor usa claves | Sin costo |
| Herramienta MCP con `require_approval: never` | Requerir aprobación para las herramientas que escriben (SharePoint/Word) | Sin costo |
| Sin WAF delante del ingress | Front Door Standard/Premium + WAF si la app se abre a más usuarios | Desde ~US$ 35 al mes |
| La app apunta al Foundry de prueba `prueba7-resource` y existe otro `prj-leitner-ia-dev-resource` | Definir la cuenta oficial y fijarla con `AI_FOUNDRY_RESOURCE_NAME`/`AI_FOUNDRY_PROJECT_NAME` | Sin costo |

## Costos estimados

Son precios orientativos: confírmelos en la [calculadora de precios de Azure](https://azure.microsoft.com/pricing/calculator/) para su región.

| Componente | dev | prod |
|---|---|---|
| Container Apps (0.5 vCPU / 1 GiB) | Casi 0 en reposo (incluido en la capa gratuita mensual) | ~US$ 35-45 al mes con 1 réplica siempre activa |
| ACR Basic | ~US$ 5 al mes | ~US$ 5 al mes |
| Log Analytics / App Insights | Por GB ingerido (5 GB al mes gratis); tope de 1 GB al día | Por GB ingerido |
| Azure AI Foundry (tokens del modelo) | **Costo principal**: depende del uso | Ídem; el rate limiting por usuario lo acota |

## Solución de problemas

| Síntoma | Causa probable | Acción |
|---|---|---|
| La revisión no arranca (falla la startup probe) | Configuración inválida: la API valida al arrancar | Revise los logs del contenedor: el mensaje indica qué variable falta |
| 401 en `/api` | Token de otro tenant, audiencia incorrecta o expirado | Revise `ENTRA_TENANT_ID` / `ENTRA_SPA_CLIENT_ID` y el scope que pide la SPA |
| 403 en `/api` | Falta el scope o, con `ENTRA_ALLOWED_GROUP_ID`, el usuario no es miembro del grupo (o tiene más de 200 grupos) | Añada al usuario al grupo, o vacíe la variable para acceso de todo el tenant |
| 403 de Foundry en los logs | Rol no propagado o en otra cuenta | Verifique "Foundry User" en el proyecto de `AI_AGENT_ENDPOINT` (la propagación tarda unos minutos) |
| "Multiple AI Foundry resources" | Hay varias cuentas o proyectos | `azd env set AI_FOUNDRY_RESOURCE_NAME` / `AI_FOUNDRY_PROJECT_NAME` |
