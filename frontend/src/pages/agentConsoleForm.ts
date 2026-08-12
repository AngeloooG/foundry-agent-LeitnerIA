export type AnalysisApproach = "strategic" | "verified";

export interface BattlecardForm {
  company: string;
  offering: string;
  targetCustomer: string;
  competitors: string;
  desiredOutcome: string;
  analysisApproach: AnalysisApproach;
  sector: string;
  additionalContext: string;
}

export type BattlecardFormField = keyof BattlecardForm;

export interface BattlecardFormErrors {
  offering?: string;
  targetCustomer?: string;
  competitors?: string;
  desiredOutcome?: string;
  analysisApproach?: string;
}

export const initialBattlecardForm: BattlecardForm = {
  company: "CONSEIN",
  offering: "",
  targetCustomer: "",
  competitors: "",
  desiredOutcome: "",
  analysisApproach: "verified",
  sector: "",
  additionalContext: "",
};

export function updateFormField<Field extends BattlecardFormField>(
  currentForm: BattlecardForm,
  field: Field,
  value: BattlecardForm[Field]
): BattlecardForm {
  return {
    ...currentForm,
    [field]: value,
  };
}

export function validateBattlecardForm(
  form: BattlecardForm
): BattlecardFormErrors {
  const errors: BattlecardFormErrors = {};

  if (!form.offering.trim()) {
    errors.offering =
      "Describe el producto, servicio o solución que estás ofreciendo.";
  }

  if (!form.targetCustomer.trim()) {
    errors.targetCustomer =
      "Describe el cliente objetivo y el decisor principal.";
  }

  if (!form.competitors.trim()) {
    errors.competitors =
      "Indica al menos un competidor, solución alternativa o situación actual.";
  }

  if (!form.desiredOutcome.trim()) {
    errors.desiredOutcome =
      "Describe el resultado que desea alcanzar el cliente.";
  }

  if (!form.analysisApproach) {
    errors.analysisApproach =
      "Selecciona el enfoque que debe aplicar el análisis.";
  }

  return errors;
}

export function isBattlecardFormValid(
  form: BattlecardForm
): boolean {
  return Object.keys(validateBattlecardForm(form)).length === 0;
}

export function buildBattlecardPrompt(
  form: BattlecardForm,
  attachmentNames: string[] = []
): string {
  const approachInstructions =
    form.analysisApproach === "strategic"
      ? [
        "Construye el posicionamiento comercial más sólido posible usando la evidencia disponible.",
        "Puedes formular inferencias estratégicas cuando sean razonables, pero debes identificarlas expresamente como inferencias.",
        "No inventes cifras, clientes, certificaciones, capacidades ni casos de éxito.",
      ]
      : [
        "Utiliza únicamente hechos verificables mediante las fuentes, documentos y herramientas disponibles.",
        "No presentes como hecho ninguna afirmación que no pueda confirmarse.",
        "Identifica claramente la información que no haya podido ser verificada.",
      ];

  const attachmentsSection =
    attachmentNames.length > 0
      ? `
## Archivos de referencia

Se han adjuntado los siguientes archivos:

${attachmentNames.map((name) => `- ${name}`).join("\n")}

Utiliza estos archivos como contexto prioritario cuando sean relevantes.
No atribuyas afirmaciones a los documentos si el contenido no las respalda.
No expongas información sensible innecesariamente.
`
      : `
## Archivos de referencia

No se adjuntaron archivos de referencia.
`;

  return `
Actúa como Leitner IA, agente de inteligencia competitiva de ${form.company.trim() || "CONSEIN"
    }.

Necesito preparar una Battlecard para una oportunidad comercial.

## Empresa principal

${form.company.trim() || "CONSEIN"}

## Producto, servicio o solución ofrecida

${form.offering.trim()}

## Cliente objetivo y decisor principal

${form.targetCustomer.trim()}

## Competidores y alternativas

${form.competitors.trim()}

Considera que este apartado puede incluir empresas, productos, desarrollo interno, procesos manuales, mantener la situación actual o no realizar la inversión.

## Resultado esperado por el cliente

${form.desiredOutcome.trim()}

## Sector o industria

${form.sector.trim() || "No especificado"}

## Contexto adicional de la oportunidad

${form.additionalContext.trim() || "No especificado"}

## Enfoque del análisis

${form.analysisApproach === "strategic"
      ? "Estratégico basado en evidencia"
      : "Estrictamente verificado"
    }

${approachInstructions
      .map((instruction, index) => `${index + 1}. ${instruction}`)
      .join("\n")}
${attachmentsSection}
## Instrucciones obligatorias

1. Analiza la oferta de ${form.company.trim() || "CONSEIN"
    } frente a cada competidor o alternativa indicada.
2. Investiga únicamente cuando sea necesario y utiliza las herramientas disponibles.
3. Separa claramente:
   - Hechos verificados.
   - Inferencias comerciales.
   - Información no confirmada.
4. Relaciona los diferenciadores con el resultado que desea lograr el cliente.
5. Evita comparaciones genéricas que no sean relevantes para esta oportunidad.
6. Incluye como mínimo:
   - Resumen ejecutivo.
   - Contexto competitivo.
   - Perfil del cliente y prioridades del decisor.
   - Posicionamiento recomendado para ${form.company.trim() || "CONSEIN"
    }.
   - Ventajas competitivas.
   - Debilidades y riesgos.
   - Objeciones probables.
   - Respuestas comerciales recomendadas.
   - Preguntas de descubrimiento para la siguiente conversación.
   - Recomendaciones finales para el equipo comercial.
7. No inventes datos, cifras, capacidades, certificaciones, clientes ni casos de éxito.
8. Si falta información crítica para realizar una comparación responsable, indícala antes de generar el documento final.
9. Si la información es suficiente y existe una herramienta de generación documental, crea la Battlecard.
10. Si se genera un documento, devuelve claramente:
    - Nombre del archivo.
    - Estado de generación.
    - Enlace de descarga.
11. Redacta el resultado en español profesional, preciso y orientado a venta consultiva.

## Resultado esperado

Una Battlecard accionable, verificable y lista para revisión comercial.
`.trim();
} 