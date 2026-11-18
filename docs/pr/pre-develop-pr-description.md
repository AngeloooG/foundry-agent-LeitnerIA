# rama pre develop

**Origen:** `pre-develop` · **Destino propuesto:** `Develop-LeitnerIA` (flujo habitual: rama de trabajo → `Develop-LeitnerIA` → `main`; ambas apuntan hoy a `6896bb1`) · **Revisor:** propietario del trabajo · **Requiere revisión senior:** sí (Entra ID, RBAC, autorización).

## 1. Resumen ejecutivo

Prepara Leitner IA para un despliegue controlado en `env-LeitnerIA`. Incluye el refactor y el endurecimiento de seguridad ya revisados (fases 1 a 7, modelo de acceso tenant-wide y su auditoría), y añade:

- **Dos registros de Entra ID:** frontend SPA (inicio de sesión) y backend API (única audiencia aceptada, scope `Chat.ReadWrite`).
- **OBO desacoplado:** sigue desactivado por defecto (`ENABLE_OBO=false`); el backend llama a Foundry con su managed identity.
- **Protección contra imágenes incoherentes:** la API no arranca si el bundle del SPA se construyó para otro backend, y `predeploy` se niega a desplegarlo.
- **CI en GitHub Actions** sin credenciales, con escaneo del bundle (secretos, source maps y system prompt).
- **Correcciones encontradas en la validación:**
  - El provision borraba las tags de gobierno del resource group.
  - El Dockerfile no compilaba en ACR.

No se ha hecho push, provision ni deploy, y no se ha modificado Entra ID ni RBAC.

## 2. Motivación

- Con un único registro, el SPA y la API comparten audiencia: un token emitido "para el SPA" es válido para la API. Separarlos limita el token de la API a su propósito y prepara OBO sin mezclar responsabilidades.
- Los IDs de Entra van incrustados en el bundle. Si cambian sin reconstruir la imagen, todos los usuarios reciben 401. Hacía falta una verificación automática.
- No existía CI: las validaciones dependían de ejecuciones manuales.

## 3. Cambios arquitectónicos

| Área | Antes | Después |
|---|---|---|
| Registros Entra | 1 (SPA + API, `491ceed0…`) | 2: SPA (`491ceed0…`, mismo registro) + API nueva `ai-foundry-agent-backend-env-LeitnerIA` |
| Audiencia aceptada | `491ceed0…` / `api://491ceed0…` | Solo el backend: `{backend}` / `api://{backend}`. El Client ID del SPA da 401 |
| Scope que pide el SPA | `api://491ceed0…/Chat.ReadWrite` | `api://{backend}/Chat.ReadWrite`, sin fallback |
| OBO | Se activaba al existir `ENTRA_BACKEND_CLIENT_ID` | Solo con `ENABLE_OBO=true` (booleano estricto) |
| Credencial hacia Foundry | Managed identity | Igual (sin cambios) |
| Coherencia imagen ↔ configuración | Ninguna | `leitneria-build.json` en el bundle + `SpaBundleConsistencyCheck` + verificación en `predeploy` |

Detalle técnico y diagrama: [pre-develop-security-review.md](pre-develop-security-review.md).

## 4. Cambios de Entra ID (se aplicarán en `azd provision`, no aplicados)

| Objeto | Cambio previsto |
|---|---|
| App `ai-foundry-agent-backend-env-LeitnerIA` | **Nueva.** Single-tenant, scope `Chat.ReadWrite` (id determinista `933c02ba-3caa-530d-a38f-49853203a2da`), tokens v2, `identifierUris = api://{appId}` (postprovision) |
| Service principal del backend | **Nuevo.** `appRoleAssignmentRequired: false` |
| App `ai-foundry-agent-env-LeitnerIA` (SPA, `491ceed0…`) | Se actualiza en el sitio (mismo `uniqueName`): `requiredResourceAccess` hacia el backend; redirect URIs de producción y localhost (dev); **se conserva el scope heredado** (ventana de rollback); `identifierUris` sin cambios |
| Service principal del SPA | Sin cambios (`appRoleAssignmentRequired: false`) |
| Consentimientos | Ninguno por defecto. El consentimiento de administrador SPA → backend es opcional (`ENTRA_GRANT_SPA_ADMIN_CONSENT=true`) |
| App roles, grupos, asignaciones | Ninguno |

## 5. Cambios de RBAC

Ninguno ejecutado. `postprovision` **añade** "Foundry User" (`53ca6127-…`) a la managed identity sobre el proyecto `aguerrero-3446`. Los 3 roles anteriores **se mantienen** y su retirada es una propuesta con rollback: [pre-develop-rbac-plan.md](pre-develop-rbac-plan.md).

## 6. Cambios de Bicep

- `entra-app.bicep`: dos registros, permiso delegado del SPA al backend, OBO y consentimientos condicionados.
- `main.bicep` / `main-app.bicep`:
  - Nuevas salidas `ENTRA_FRONTEND_CLIENT_ID`, `ENTRA_BACKEND_CLIENT_ID` y `ENTRA_BACKEND_SCOPE`.
  - Variables `ENTRA_FRONTEND_CLIENT_ID`, `ENTRA_BACKEND_CLIENT_ID` y `ENABLE_OBO` en el Container App.
  - Parámetros nuevos `entraAllowLocalhostRedirects` y `entraGrantSpaAdminConsent`.
- `main.parameters.json`: tags de gobierno (`TAG_AGENTE`, `TAG_ENTORNO`, `TAG_PLATAFORMA`).

Preview: [pre-develop-infrastructure-preview.md](pre-develop-infrastructure-preview.md).

## 7. Matriz de pruebas

[pre-develop-test-matrix.md](pre-develop-test-matrix.md). Backend: 166/166 (antes 140). Frontend: 80/80 (antes 79).

## 8. Evidencia de builds

| Validación | Resultado |
|---|---|
| `dotnet restore` / `build -c Release` / `test -c Release` | OK / 0 errores / 166 correctas de 166 |
| `npm ci` / `npm run build` / `npm run test:run` | 446 paquetes / OK / 80 de 80 |
| `az bicep build` / `az bicep lint` | OK / sin avisos |
| `azd provision --preview` | **BLOQUEADO**: los permisos de la sesión deniegan los comandos `azd` y no hay entorno azd local |
| Alternativa: `az deployment sub what-if` | Succeeded: 8 Modify, 0 Create, 0 Delete en ARM; los recursos de Graph no los soporta el what-if |
| ACR preflight | Run `cj7` fallido (NETSDK1064, corregido en `ac7b6fc`); run `cj8` OK, `web:preflight-ac7b6fc`, `sha256:dc7a7f534a734f08a9bce430dcdd7ca02b5bef5e3769f385d07ca821452fefcf`, 2 min 57 s |
| Escaneo del bundle | 13 archivos, 12 canarios del system prompt, 0 hallazgos, 0 source maps |

## 9. Riesgos pendientes

1. **No verificado en Entra** (lecturas de Graph denegadas en la sesión): que el scope heredado tenga el id `b4b16681-2bbd-5e03-bb0f-928bad2a38ff` y que no exista ya el registro de backend. Si el id difiere, el provision falla en Entra.
2. **Consentimiento:** si el tenant no permite el consentimiento de usuario, nadie podrá iniciar sesión hasta que un administrador lo conceda.
3. **Ventana de corte** entre `provision` y `deploy`: la imagen actual no lee las variables nuevas.
4. Usuarios Guest con acceso, el recurso `prueba7-resource` y el servidor MCP `leitnermcp3` sin endurecer (ver revisión de seguridad).
5. CI: `dependency-review` requiere el dependency graph (en repos privados, GitHub Advanced Security).

## 10. Plan de despliegue

1. Revisión senior y merge a `Develop-LeitnerIA`.
2. **Puertas previas**, con un administrador de Entra (solo lectura):

   ```powershell
   az ad app show --id 491ceed0-443d-4414-b16f-91ecdcafafeb --query "api.oauth2PermissionScopes[].{id:id,value:value}"
   #   esperado: id b4b16681-2bbd-5e03-bb0f-928bad2a38ff, value Chat.ReadWrite
   az ad app list --filter "displayName eq 'ai-foundry-agent-backend-env-LeitnerIA'" --query "[].appId"
   #   esperado: [] (o un registro que se reutilizará)
   az rest --method get --url "https://graph.microsoft.com/v1.0/policies/authorizationPolicy" --query "defaultUserRolePermissions.permissionGrantPoliciesAssigned"
   #   ¿permite el consentimiento de usuario? Si no, planificar ENTRA_GRANT_SPA_ADMIN_CONSENT=true con un administrador
   ```

3. Desde el equipo que tiene el entorno azd `env-LeitnerIA` (no existe en este equipo):

   ```powershell
   git switch pre-develop
   ./deployment/scripts/set-environment-profile.ps1 -Profile dev
   azd env set AI_FOUNDRY_RESOURCE_NAME prueba7-resource
   azd env set AI_FOUNDRY_PROJECT_NAME aguerrero-3446
   azd env set ENABLE_OBO false
   azd env set TAG_AGENTE LeitnerIA; azd env set TAG_ENTORNO dev; azd env set TAG_PLATAFORMA Foundry
   azd provision --preview
   ```

4. Ventana de mantenimiento (aviso a usuarios): `azd up`, que ejecuta provision y luego deploy, para minimizar el corte.
5. Smoke tests con dos usuarios reales ([matriz](pre-develop-test-matrix.md#3-smoke-tests-manuales-con-dos-usuarios-reales)).
6. Borrar el tag de preflight: `az acr repository delete --name crms4xecmmlqzua --image web:preflight-ac7b6fc --yes`.

## 11. Plan de rollback

[pre-develop-rollback-plan.md](pre-develop-rollback-plan.md): imagen y variables anteriores en el Container App (el scope heredado sigue válido), sin tocar Entra.

## 12. Smoke tests

[pre-develop-test-matrix.md](pre-develop-test-matrix.md#3-smoke-tests-manuales-con-dos-usuarios-reales).

## 13. Impacto en usuarios

- Un corte breve durante `azd up`.
- Primer inicio de sesión: posible pantalla de consentimiento "Use LeitnerIA" (salvo consentimiento de administrador).
- **Las conversaciones anteriores al aislamiento por usuario dejan de verse** (no tienen dueño). Hay que avisar antes del despliegue.
- Cambios visibles para el usuario: ninguno más.

## 14. Cambios de configuración

| Variable | Estado |
|---|---|
| `ENTRA_SPA_CLIENT_ID` | **Eliminada.** Si está definida, la API no arranca |
| `ENTRA_FRONTEND_CLIENT_ID` | **Nueva**, obligatoria (salida de Bicep) |
| `ENTRA_BACKEND_CLIENT_ID` | **Ahora obligatoria**, distinta del frontend |
| `ENABLE_OBO` | Ahora la lee también la API; booleano estricto |
| `ENTRA_ALLOW_LOCALHOST_REDIRECTS`, `ENTRA_GRANT_SPA_ADMIN_CONSENT` | Nuevas, booleanos estrictos |
| `TAG_AGENTE`, `TAG_ENTORNO`, `TAG_PLATAFORMA` | Nuevas (con los valores actuales por defecto) |
| `VITE_ENTRA_SPA_CLIENT_ID` | Sustituida por `VITE_ENTRA_FRONTEND_CLIENT_ID` + `VITE_ENTRA_BACKEND_CLIENT_ID` |
| `ENTRA_ALLOWED_GROUP_ID` | Sin cambios: opcional y vacío en dev |

Desarrollo local en `pre-develop`: requiere el registro de backend, por lo que solo funciona después del provision. Hay que regenerar los `.env` con `azd hooks run postprovision`.

## 15. Permisos necesarios

| Acción | Permiso |
|---|---|
| Crear y actualizar los registros de aplicación (provision) | Application Developer (si el tenant permite registrar apps), Application Administrator o Cloud Application Administrator |
| `identifierUris` y redirect URIs (postprovision) | Propietario de la app o los roles anteriores |
| Consentimiento de administrador SPA → backend (opcional) | Cloud Application Administrator / Application Administrator / Privileged Role Administrator |
| Asignar "Foundry User" en el proyecto | Owner o User Access Administrator (o Role Based Access Control Administrator) sobre el proyecto `aguerrero-3446` |
| Desplegar en el resource group | Contributor sobre `rg-env-LeitnerIA`; AcrPush sobre el ACR |
| Lecturas de las puertas previas | Directory Readers (o superior) en Entra |

---
🤖 Generated with [Claude Code](https://claude.com/claude-code)
