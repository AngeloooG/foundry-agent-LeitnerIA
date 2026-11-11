# RBAC · pre-develop

Ningún cambio de RBAC se ha ejecutado. Los comandos de retirada son **propuestas**.

## 1. Inventario actual (solo lectura, 2026-11-11)

**Principal:** managed identity `id-web-ms4xecmmlqzua` (principalId `edf24679-2a56-464c-99c7-e3c577ed94d5`, clientId `5e283a81-…`).

| Rol | Scope | Origen | Necesidad funcional |
|---|---|---|---|
| AcrPull | ACR `crms4xecmmlqzua` | Bicep (`container-registry.bicep`) | Descargar la imagen. **Necesario** |
| Cognitive Services User | Proyecto `prueba7-resource/aguerrero-3446` | `postprovision` (versión anterior) | Data plane `Microsoft.CognitiveServices/*`, más `listkeys` en el plano de control. Amplio |
| Cognitive Services OpenAI Contributor | ídem | ídem | Incluye operaciones de escritura de OpenAI que la app no usa. **Excesivo** |
| Azure AI Developer | ídem | ídem | Plano de control de workspaces de ML y despliegues. **Excesivo** |

- **Key Vault, Storage y otros:** la app no usa ninguno (el RG solo contiene Container Apps, ACR, App Insights, Log Analytics y la identidad).
- **Contexto:** sobre el mismo proyecto hay **otros 2 service principals** con los mismos 3 roles y uno con "Foundry Agent Consumer": el proyecto de prueba es **compartido**. Las asignaciones son por principal, así que cambiar las de LeitnerIA no afecta a los demás.

## 2. Propuesta

| Rol | Acción |
|---|---|
| AcrPull | Mantener |
| **Foundry User** (`53ca6127-…`, data plane `Microsoft.CognitiveServices/*`) | **Añadir** (lo hace `postprovision`) y validar con la matriz |
| Los 3 roles anteriores | Retirar **tras** validar la matriz |
| Foundry Agent Consumer (`eed3b665-…`, solo `AIServices/endpoints/interact/action`) | Candidato de mínimo privilegio; probablemente **insuficiente** (no cubre conversaciones, archivos ni lectura de versiones del agente). Probar después |

Futuro: un rol personalizado sin `listkeys`, como se recomienda en `infra/README.md`.

## 3. Matriz de operaciones para validar "Foundry User"

| Operación | Cómo se ejerce | Llamada de la managed identity | Esperado con solo Foundry User |
|---|---|---|---|
| Crear conversación | Primer mensaje en el chat | `conversations` create | OK |
| Continuar conversación | Segundo mensaje | `responses` create (bound) | OK |
| Obtener mensajes | `GET /api/conversations/{id}/messages` | `conversations/items` list | OK |
| Listar conversaciones | `GET /api/conversations` | `conversations` list | OK |
| Eliminar conversación | — | No existe endpoint | N/A |
| Herramientas del agente (web search) | Pregunta que requiera la web | Se ejecuta en Foundry con la identidad del agente | OK (no depende de la managed identity) |
| Adjuntar imágenes | PNG en el chat | `files` upload (purpose assistants) | OK |
| Adjuntar documentos | PDF y TXT | En línea / `input_file` | OK |
| Generar documento | Battlecard completa | MCP → Power Automate → SharePoint (identidad del agente o conexión del proyecto) | OK |
| Integración MCP | Mismo flujo | Conexión del proyecto `leitneria-battlecard-mcp-3` | OK |
| Limpieza de imágenes | `UploadedFilesCleanupService` (cada 6 h) | `files` list y delete | OK |
| Lectura de la definición del agente | Arranque y `GET /api/agent` | `agents` versions read | OK |

## 4. Comandos de prueba (tras `azd up`, en ventana de mantenimiento)

```powershell
$mi = "edf24679-2a56-464c-99c7-e3c577ed94d5"
$project = "/subscriptions/b6d04525-e7b4-4b17-8492-2471f9779962/resourceGroups/prueba7resourcefoundryproject/providers/Microsoft.CognitiveServices/accounts/prueba7-resource/projects/aguerrero-3446"

# 0) Confirmar que Foundry User está asignado
az role assignment list --assignee $mi --scope $project --query "[].roleDefinitionName"

# 1) PROPUESTA (no ejecutada): retirar los roles anteriores
az role assignment delete --assignee $mi --role "Cognitive Services OpenAI Contributor" --scope $project
az role assignment delete --assignee $mi --role "Azure AI Developer" --scope $project
az role assignment delete --assignee $mi --role "Cognitive Services User" --scope $project
#    (equivalente con azd: azd env set REMOVE_LEGACY_FOUNDRY_ROLES true; azd hooks run postprovision)

# 2) Esperar a que se propague (hasta ~10 min) y reiniciar la revisión para descartar tokens en caché
az containerapp revision restart -g rg-env-LeitnerIA -n ca-web-ms4xecmmlqzua --revision <revisión activa>

# 3) Ejecutar la matriz de la sección 3 y los smoke tests 3 a 10; revisar Application Insights (403 de Foundry)
```

## 5. Rollback (si algo de la matriz falla)

```powershell
az role assignment create --assignee-object-id $mi --assignee-principal-type ServicePrincipal --role "a97b65f3-24c7-4388-baec-2e87135dc908" --scope $project   # Cognitive Services User
az role assignment create --assignee-object-id $mi --assignee-principal-type ServicePrincipal --role "a001fd3d-188f-4b5d-821b-7da978bf7442" --scope $project   # Cognitive Services OpenAI Contributor
az role assignment create --assignee-object-id $mi --assignee-principal-type ServicePrincipal --role "64702f94-c441-49e6-a78b-ef80e0188fee" --scope $project   # Azure AI Developer
```

Los cambios de RBAC requieren revisión senior y permisos de Owner o User Access Administrator sobre el proyecto.

## 6. Comparación de RBAC, anterior frente a propuesto

| | Anterior | Propuesto |
|---|---|---|
| Roles de la managed identity en Foundry | 3 (Cognitive Services User, OpenAI Contributor, AI Developer) | 1 (Foundry User) |
| Plano de control de ML y despliegues | Sí (AI Developer) | No |
| Escrituras de OpenAI no usadas | Sí (OpenAI Contributor) | No (solo data plane) |
| `listkeys` | Sí | Sí (pendiente: rol personalizado) |
| Usuarios finales con RBAC | No | No (OBO desactivado) |
