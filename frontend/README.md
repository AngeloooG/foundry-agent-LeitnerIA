# LeitnerIA: frontend (React 19 + Vite)

SPA con dos páginas:

- **Inicio** (`/`): presentación del producto.
- **Probar agente** (`/agente`): formulario guiado y chat con streaming.

En Azure, el backend la sirve desde `wwwroot` (mismo origen). En local, Vite la sirve en el puerto 5173 y hace de proxy de `/api` hacia `localhost:8080`.

## Estructura

```text
src/
  main.tsx                     MSAL + proveedores (tema, consola) + router
  App.tsx                      Inicio de sesión obligatorio, pantalla de error de login, rutas lazy
  config/authConfig.ts         MSAL (redirect, caché en sessionStorage, scope api://<id>/Chat.ReadWrite)
  config/appConfig.ts          URL de la API, host de SharePoint, límites de adjuntos (alineados con el backend)
  components/                  Header, ErrorBoundary, ThemeProvider, markdown/SafeMarkdown + linkPolicy
  features/landing/            HomePage.tsx + Home.css
  features/battlecard/
    AgentConsolePage.tsx       Página /agente
    components/                BattlecardForm, AttachmentPicker, ChatPanel, Field (accesible)
    hooks/                     useAutoScroll (no roba el scroll), useFilePicker
    model/                     battlecardForm (validación y prompt), consoleContent (textos), fileAttachments
    api/                       agentStreamClient (fetch + parser SSE), agentAttachments (límites, conversión)
    state/                     consoleState (reducer puro) + AgentConsoleProvider (stream, cancelación)
  services/telemetry.ts        Application Insights (sin contenido de usuario)
```

Decisiones de diseño:

- **Carpetas por feature**: todo lo de la consola vive junto en `features/battlecard`.
- **Una sola fuente de verdad**: un reducer puro con acciones explícitas. `AgentConsoleProvider` está montado por encima de las rutas, así que la generación sobrevive a la navegación.
- **Markdown seguro**: la salida del agente se trata como no confiable (`SafeMarkdown`: sin HTML, sin imágenes, enlaces controlados).
- **Estilos**: CSS por página (`AgentConsole.css`, `Home.css`, `Header.css`) y tokens en `index.css`. Fluent UI se usa solo en componentes base.

## Configuración

Variables de build (públicas; quedan dentro del bundle, nunca ponga secretos aquí):

| Variable | Descripción |
|---|---|
| `VITE_ENTRA_SPA_CLIENT_ID` | Client ID de la app Entra |
| `VITE_ENTRA_TENANT_ID` | Tenant |
| `VITE_ENTRA_BACKEND_CLIENT_ID` | Opcional, solo con OBO |
| `VITE_APPLICATIONINSIGHTS_CONNECTION_STRING` | Opcional; clave de ingesta del navegador (pública por diseño) |
| `VITE_SHAREPOINT_HOST` | Opcional; por defecto `conseincloud.sharepoint.com` |

En local las genera `azd hooks run postprovision` en `frontend/.env.local`, que está ignorado por git.

## Comandos

```powershell
npm ci
npm run dev        # http://localhost:5173 (requiere el backend en :8080)
npm run lint       # ESLint + reglas recomendadas de react-hooks
npm test           # Vitest (modo watch); npm run test:run para una sola pasada
npm run build      # tsc -b + vite build (chunks por ruta)
```

Pruebas:

- Parser SSE: fragmentación entre lecturas, CRLF, eventos inválidos, errores ProblemDetails.
- Reducer de la consola.
- Formulario y generación del prompt.
- Selección de adjuntos y tope total.
- `SafeMarkdown`: XSS, imágenes, `javascript:`, dominios de SharePoint parecidos al real.

## Límites de adjuntos

Están definidos en `config/appConfig.ts` y reflejan el backend (`AttachmentValidator` y `Limits:MaxRequestBodyMegabytes`):

- Hasta 5 imágenes de 5 MB cada una.
- Hasta 10 documentos de 20 MB cada uno.
- 20 MB en total por mensaje.

Si cambia un valor, cámbielo en ambos lados.
