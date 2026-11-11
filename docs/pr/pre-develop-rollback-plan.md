# Plan de rollback · pre-develop

## Principio

El cambio es **reversible sin tocar Entra ID**. El registro del SPA (`491ceed0…`) conserva su scope heredado `Chat.ReadWrite` y su `identifierUri api://491ceed0…`, de modo que la imagen actual (`web:deploy-1786615240`) sigue obteniendo tokens válidos para ella. El registro nuevo del backend no afecta a la versión anterior.

## Antes del despliegue (registrar)

```powershell
az containerapp show -g rg-env-LeitnerIA -n ca-web-ms4xecmmlqzua --query "{image:properties.template.containers[0].image,revision:properties.latestRevisionName}"
#   hoy: web:deploy-1786615240, revisión ca-web-ms4xecmmlqzua--0000004
az containerapp show -g rg-env-LeitnerIA -n ca-web-ms4xecmmlqzua --query "properties.template.containers[0].env[].name"
```

## Disparadores

- El inicio de sesión falla para usuarios del tenant (AADSTS65001 de consentimiento sin resolver, 401 generalizado).
- La nueva revisión no arranca (`SpaBundleConsistencyCheck`, opciones inválidas).
- Errores 5xx sostenidos o fallo de los smoke tests 3 a 10.

## Rollback de la aplicación (≈ 5 min)

```powershell
# 1) Imagen y variables anteriores (la imagen anterior lee ENTRA_SPA_CLIENT_ID)
az containerapp update -g rg-env-LeitnerIA -n ca-web-ms4xecmmlqzua `
  --image crms4xecmmlqzua.azurecr.io/web:deploy-1786615240 `
  --set-env-vars ENTRA_SPA_CLIENT_ID=491ceed0-443d-4414-b16f-91ecdcafafeb `
  --remove-env-vars ENTRA_FRONTEND_CLIENT_ID ENTRA_BACKEND_CLIENT_ID ENABLE_OBO

# 2) Verificar
az containerapp revision list -g rg-env-LeitnerIA -n ca-web-ms4xecmmlqzua --query "[?properties.active].{name:name,health:properties.healthState}"
curl -sI https://ca-web-ms4xecmmlqzua.wittycliff-993fb65f.centralus.azurecontainerapps.io/api/health
```

- **Secretos de App Insights:** el Bicep nuevo las mueve a secretos de Container Apps. La imagen anterior las lee igual, como variables de entorno con `secretRef`, así que no hace falta revertirlas.
- **Entorno azd:** `azd env set SERVICE_WEB_IMAGE_NAME crms4xecmmlqzua.azurecr.io/web:deploy-1786615240`, para que un provision posterior no reintroduzca la imagen nueva.

## Rollback del código

Revertir el merge en `Develop-LeitnerIA` (`git revert -m 1 <merge>`), por PR. No reescribir historia.

## Entra ID (solo si se decide eliminar el registro nuevo)

No es necesario para el rollback. Si se decide, requiere un administrador:

```powershell
az ad app delete --id <ENTRA_BACKEND_CLIENT_ID>   # queda en papelera 30 días; restaurable:
az rest --method post --url "https://graph.microsoft.com/v1.0/directory/deletedItems/<objectId>/restore"
```

El `requiredResourceAccess` añadido al SPA es inocuo y puede quedarse.

## RBAC

El despliegue solo **añade** "Foundry User". Para revertirlo:

```powershell
az role assignment delete --assignee edf24679-2a56-464c-99c7-e3c577ed94d5 --role 53ca6127-db72-4b80-b1b0-d745d6d5456d `
  --scope /subscriptions/b6d04525-e7b4-4b17-8492-2471f9779962/resourceGroups/prueba7resourcefoundryproject/providers/Microsoft.CognitiveServices/accounts/prueba7-resource/projects/aguerrero-3446
```

La retirada de los roles anteriores tiene su propio rollback: [pre-develop-rbac-plan.md](pre-develop-rbac-plan.md).

## Tags

Si las tags del resource group se alteraran:

```powershell
az group update -n rg-env-LeitnerIA --set tags.Agente=LeitnerIA tags.Entorno=dev tags.Plataforma=Foundry
```

## Retirada definitiva del scope heredado (fuera de esta fase)

Tras la ventana de rollback (sugerido: 2 semanas estables), y con revisión senior:

1. Poner `isEnabled: false` en el scope heredado de `entra-app.bicep` y aprovisionar.
2. En un segundo provision, eliminarlo y borrar `identifierUris` del SPA.

Desde el paso 1, el rollback a la imagen anterior deja de funcionar.
