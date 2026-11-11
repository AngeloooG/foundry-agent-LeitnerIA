# Preview de infraestructura · pre-develop

## 1. `azd provision --preview`: BLOQUEADO

- **Comando:** `azd provision --preview`
- **Motivo 1:** el sistema de permisos de la sesión de Claude Code denegó los comandos `azd` (`azd env list` y `azd provision --preview`), aunque el prompt los autorizaba.
- **Motivo 2:** en este equipo no existe el entorno azd `env-LeitnerIA` (no hay carpeta `.azure`); el entorno se creó en otro equipo.
- **Para completarlo:** en el equipo que tiene el entorno, `azd env select env-LeitnerIA`, aplicar las variables del plan de despliegue y ejecutar `azd provision --preview`. Requiere Reader más `Microsoft.Resources/deployments/whatIf/action` en la suscripción.

## 2. Alternativa oficial ejecutada: `az deployment sub what-if`

```powershell
az deployment sub what-if --name leitneria-predevelop-whatif --location centralus `
  --subscription b6d04525-e7b4-4b17-8492-2471f9779962 --template-file infra/main.bicep `
  --parameters "@whatif.parameters.json" --result-format FullResourcePayloads
```

Parámetros: los **valores actuales** del entorno, para que el preview muestre solo los cambios reales.

- `environmentName`: `env-LeitnerIA`
- `location`: `centralus`
- Imagen: `web:deploy-1786615240`
- Agente: `prueba7-resource` / `aguerrero-3446` / `LeitnerIA`
- Escalado: min 0 / max 3; retención de logs 30; ACR Basic
- `enableObo`: false; `entraAllowLocalhostRedirects`: true (dev)
- Tags de gobierno actuales

**Primera ejecución:** mostró la **eliminación de las tags** `Agente`, `Entorno` y `Plataforma` del resource group. Se corrigió (commit `eb82493`: tags como parámetros) y se repitió.

**Resultado final: Succeeded.** 8 Modify, 0 Create, 0 Delete, 1 Unsupported.

| Recurso | Cambio | Valoración |
|---|---|---|
| `rg-env-LeitnerIA` | + tags `app-name=leitneria`, `azd-env-name=env-LeitnerIA` | Aditivo |
| `ca-web-ms4xecmmlqzua` | Plantilla del contenedor (variables nuevas), `secrets` nuevos (connection strings de App Insights), tag `app-name` | **Esperado.** Crea una revisión nueva con la **imagen actual** (ver riesgo 1) |
| `cae-ms4xecmmlqzua` | `customerId` mostrado como expresión; `peerAuthentication` y `peerTrafficConfiguration` (valores por defecto `false`) "Delete" | Ruido del what-if: no cambia el comportamiento |
| `crms4xecmmlqzua` | `anonymousPullEnabled`, `dataEndpointEnabled`, `encryption` y `policies.azureADAuthenticationAsArmPolicy` "Delete" | Propiedades no declaradas; el servicio conserva los valores (verificar tras el provision) |
| `appi-*` (×2) | `DisableLocalAuth: false` explícito | Sin cambio de comportamiento |
| `id-web-…`, `law-…` | Tags | Aditivo |
| Asignación AcrPull | Unsupported (nombre calculado con `guid()`) | Ya existe con el mismo nombre (`2823f9e8-…`, verificado) |

**Recursos ARM nuevos o eliminados: ninguno.**

## 3. Microsoft Graph (Entra ID): no soportado por el what-if

Diagnóstico `ExtensibleResourceNotSupported` para `app`, `sp`, `backendApp` y `backendSp`. Este es el análisis manual del Bicep:

| Recurso | Operación prevista | Riesgo |
|---|---|---|
| `backendApp` (`ai-foundry-agent-backend-env-LeitnerIA`) | **Crear** (si no existe) | Requiere permiso para crear apps |
| `backendSp` | **Crear** | Bajo |
| `app` (`491ceed0…`) | **Actualizar en el sitio** (mismo `uniqueName`): + `requiredResourceAccess`; `spa.redirectUris` = localhost (dev), y postprovision añade la URL de producción; scope heredado declarado con el id `b4b16681-2bbd-5e03-bb0f-928bad2a38ff` | **Alto si el id real del scope difiere**: Entra rechaza modificar un scope habilitado y el provision falla. Verificar antes (comando en la descripción del PR) |
| `sp` | Sin cambios (`appRoleAssignmentRequired: false`) | — |
| `spaAdminConsent`, `oboAdminConsent` | No se crean (flags `false`) | — |

- **Redirect URIs** tras `postprovision`: `https://ca-web-ms4xecmmlqzua.wittycliff-993fb65f.centralus.azurecontainerapps.io`, `http://localhost:8080` y `http://localhost:5173`, igual que hoy en dev. En prod, sin localhost.
- **Service principals afectados:** 1 nuevo (backend); el del SPA sin cambios.
- **Pasos con consentimiento de administrador:** ninguno obligatorio. Solo si el tenant bloquea el consentimiento de usuario: `ENTRA_GRANT_SPA_ADMIN_CONSENT=true`, o el portal (Enterprise apps → `ai-foundry-agent-env-LeitnerIA` → Permissions → Grant admin consent).

## 4. Variables del Container App

| Variable | Cambio |
|---|---|
| `ENTRA_SPA_CLIENT_ID` | **Eliminada** |
| `ENTRA_FRONTEND_CLIENT_ID` | Nueva (`491ceed0…`) |
| `ENTRA_BACKEND_CLIENT_ID` | Nueva (id del registro nuevo) |
| `ENABLE_OBO` | Nueva (`False`; la API acepta `true`/`false` sin distinguir mayúsculas) |
| `Telemetry__UseEntraAuthentication` | Nueva (`False`) |
| `APPLICATIONINSIGHTS_CONNECTION_STRING`, `APPLICATIONINSIGHTS_FRONTEND_CONNECTION_STRING` | Pasan a `secretRef` |

## 5. Roles y asignaciones

- **ARM:** sin cambios (AcrPull ya existe).
- **`postprovision`:** + "Foundry User" a la managed identity sobre el proyecto `aguerrero-3446`. Retirar los roles anteriores es opcional y está desactivado.

## 6. Riesgos destructivos

1. **Corte entre provision y deploy.** El provision crea una revisión con la imagen actual y sin `ENTRA_SPA_CLIENT_ID`. Esa imagen cae a valores placeholder y responde 401 hasta que `predeploy` publica la imagen nueva. Mitigación: `azd up` en ventana de mantenimiento.
2. **Scope heredado con otro id:** el provision falla en Entra (sin pérdida de datos; se reintenta tras corregir el Bicep).
3. Las propiedades de ACR marcadas "Delete" (probable ruido) deben comprobarse tras el provision.
