# LeitnerIA: despliegue

## Estructura

```text
deployment/
├── docker/
│   └── web.Dockerfile                 Imagen única: build de Vite → dotnet publish → aspnet:10.0-alpine (no root)
├── hooks/                             Hooks de Azure Developer CLI (ver hooks/README.md)
│   ├── preprovision.ps1               Descubre la cuenta y el proyecto de Foundry y el agente (sin elegir en silencio)
│   ├── postprovision.ps1              Configura Entra (URIs), OBO, rol "Foundry User", asignación de usuarios, .env locales
│   ├── predeploy.ps1                  Construye la imagen (Docker local o ACR), la sube y actualiza el Container App
│   ├── postdown.ps1                   Elimina las apps de Entra (incluida OBO), los roles en Foundry y los .env locales
│   └── modules/                       Get-AIFoundryAgents.ps1, HookLogging.ps1
└── scripts/
    ├── start-local-dev.ps1            Backend (dotnet watch) + frontend (Vite) en local
    ├── deploy.ps1                     Solo código: ejecuta el hook predeploy
    ├── set-environment-profile.ps1    Perfil dev/prod (tamaños, retención, seguridad) en el entorno azd
    ├── harden-external-resources.ps1  Endurecimiento del servidor MCP, su storage y Foundry (dry run por defecto)
    ├── list-agents.ps1                Lista los agentes del proyecto de Foundry
    ├── validate-config.ps1            Verifica la configuración local
    └── test-cli-compatibility.ps1     Prueba de las instrucciones del repositorio para GitHub Copilot CLI
```

## Comandos

| Comando | Uso |
|---|---|
| `./deployment/scripts/set-environment-profile.ps1 -Profile dev\|prod` | Configura el entorno antes de aprovisionar |
| `azd provision --preview` | Revisa los cambios de infraestructura sin aplicarlos |
| `azd up` | Aprovisiona y despliega (primera vez o cambios de infraestructura) |
| `./deployment/scripts/deploy.ps1` | Despliega solo los cambios de código |
| `azd down --purge` | Elimina el entorno (más la limpieza de `postdown`) |

## Construcción de la imagen

`predeploy.ps1` usa Docker local si está disponible (~2 minutos) y, si no, ACR Tasks (~4-5 minutos). La imagen se etiqueta `web:deploy-<timestamp>` y se sube autenticada con Entra ID; el usuario admin de ACR está deshabilitado.

Argumentos de build (identificadores públicos, no secretos): `ENTRA_SPA_CLIENT_ID`, `ENTRA_TENANT_ID`, `ENTRA_BACKEND_CLIENT_ID` y `APPLICATIONINSIGHTS_FRONTEND_CONNECTION_STRING`. `.dockerignore` excluye `**/.env*`, `.azure` y las pruebas del contexto de build.

## Antes de producción (checklist)

1. Revisión senior de los cambios de RBAC, Entra ID y red.
2. Perfil `prod` aplicado. `ENTRA_ALLOWED_GROUP_ID` es opcional: déjelo vacío para dar acceso a todo el tenant.
3. `azd provision --preview` revisado.
4. Después del despliegue, verificar el inicio de sesión, la generación de una Battlecard y el enlace a SharePoint.
5. Retirar los roles heredados: `azd env set REMOVE_LEGACY_FOUNDRY_ROLES true; azd hooks run postprovision`.
6. Revisar `harden-external-resources.ps1` con los responsables del servidor MCP y de Foundry.
