/**
 * Static content of the Battlecard console (Spanish UI copy and option lists).
 * Kept out of components so it can be reviewed and changed without touching logic.
 */

export const WELCOME_MESSAGE = `Hola. Soy LeitnerIA, tu agente para construir Battlecards ejecutivos para CONSEIN.

Para comenzar necesito:

1. ¿Qué producto o servicio estás ofreciendo?
2. ¿Quién es tu cliente ideal o avatar de decisión?
3. ¿Con qué tipo de soluciones o empresas compites normalmente?
4. ¿Qué resultado desea lograr tu cliente?
5. ¿Quieres que te muestre una versión idealizada o una construida solo con tu información actual?`;

export const RESET_MESSAGE =
    "Conversación reiniciada. Puedes escribir una solicitud libre o completar el formulario para preparar una solicitud estructurada.";

export const FORM_INCOMPLETE_NOTICE =
    "Completa los campos obligatorios del formulario antes de preparar la solicitud.";

export const AGENT_BADGES = ["Azure AI Foundry", "GPT-5", "MCP"] as const;

export const SECTOR_OPTIONS = [
    "Servicios tecnológicos",
    "Consultoría tecnológica",
    "Soluciones empresariales",
    "Cloud services",
    "Transformación digital",
    "Ciberseguridad",
    "Banca y finanzas",
    "Gobierno",
] as const;

export const QUICK_PROMPTS = [
    "Quiero comparar CONSEIN contra un competidor.",
    "Ayúdame a crear una Battlecard por servicio.",
    "Necesito analizar un producto o solución Microsoft.",
    "Genera un resumen ejecutivo competitivo.",
] as const;

export const RUN_MESSAGES = {
    noToken: "No se pudo obtener un token de autenticación. Inicia sesión de nuevo e intenta otra vez.",
    cancelled: "La generación fue cancelada por el usuario.",
    empty:
        "El agente terminó la ejecución, pero no devolvió contenido textual. Revisa si la herramienta generó un archivo o si ocurrió una respuesta vacía.",
    agentError: (detail: string) => `No se pudo completar la respuesta del agente: ${detail}`,
    connectionError: (detail: string) => `No se pudo conectar correctamente con Leitner IA: ${detail}`,
    partialSuffix: (detail: string) => `\n\n---\n_La respuesta quedó incompleta: ${detail}_`,
} as const;

/** Accept attribute for the file picker (mirrors the allow-list in model/fileAttachments.ts and the backend). */
export const FILE_INPUT_ACCEPT =
    "image/png,image/jpeg,image/gif,image/webp,application/pdf,text/plain,text/markdown,text/csv,application/json,text/html,application/xml,text/xml,.md,.markdown,.txt,.csv,.json,.html,.htm,.xml,.pdf";

export function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
