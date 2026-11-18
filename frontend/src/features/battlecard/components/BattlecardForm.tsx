import { useId } from "react";
import type { ReactNode } from "react";

import { isBattlecardFormValid, type AnalysisApproach, type BattlecardForm as FormValues } from "../model/battlecardForm";
import { SECTOR_OPTIONS } from "../model/consoleContent";
import { useAgentConsole } from "../state/AgentConsoleProvider";
import { AttachmentPicker } from "./AttachmentPicker";
import { Field, fieldDescribedBy } from "./Field";

type TextField = Exclude<keyof FormValues, "analysisApproach" | "sector">;

interface TextQuestion {
    field: TextField;
    label: string;
    helpText: string;
    placeholder: string;
    rows?: number;
    required?: boolean;
}

const QUESTIONS: TextQuestion[] = [
    {
        field: "offering",
        label: "1. ¿Qué producto, servicio o solución estás ofreciendo?",
        helpText: "Explica la oferta con suficiente detalle. Puedes incluir tecnologías, alcance y modalidad del servicio.",
        placeholder: "Ej.: Implementación de Microsoft Copilot Studio integrada con Power Automate, Azure AI Search y los sistemas internos del cliente.",
        rows: 4,
        required: true,
    },
    {
        field: "targetCustomer",
        label: "2. ¿Quién es el cliente ideal o avatar de decisión?",
        helpText: "Describe la organización, el sector, el cargo del decisor y sus prioridades.",
        placeholder: "Ej.: Banco mediano. El decisor principal es el Director de Operaciones, acompañado por Tecnología y Cumplimiento.",
        rows: 4,
        required: true,
    },
    {
        field: "competitors",
        label: "3. ¿Contra qué empresas, soluciones o alternativas compites?",
        helpText: "Incluye proveedores, productos, desarrollo interno, procesos manuales o la opción de no hacer nada.",
        placeholder: "Ej.: IBM, Accenture, UiPath, desarrollo interno y mantener el proceso manual actual.",
        rows: 3,
        required: true,
    },
    {
        field: "desiredOutcome",
        label: "4. ¿Qué resultado desea lograr el cliente?",
        helpText: "Describe el resultado de negocio esperado, no solamente el objetivo de vender.",
        placeholder: "Ej.: Reducir el tiempo de atención, mantener trazabilidad y desplegar la solución en menos de tres meses.",
        rows: 4,
        required: true,
    },
];

const APPROACHES: { value: AnalysisApproach; title: string; description: string }[] = [
    {
        value: "strategic",
        title: "Estratégico basado en evidencia",
        description: "Construye el posicionamiento comercial más sólido, identificando claramente las inferencias.",
    },
    {
        value: "verified",
        title: "Estrictamente verificado",
        description: "Incluye únicamente afirmaciones confirmables y señala cualquier información no verificada.",
    },
];

/** Guided form (five questions + optional context + attachments) that prepares an editable prompt. */
export function BattlecardForm() {
    const { state, actions } = useAgentConsole();
    const { form, formErrors, hasPreparedPrompt } = state;
    const disabled = state.status !== "idle";
    const canPrepare = isBattlecardFormValid(form);
    const idPrefix = useId();
    const controlId = (name: string) => `${idPrefix}-${name}`;

    const renderTextArea = (question: TextQuestion): ReactNode => {
        const id = controlId(question.field);
        const error = formErrors[question.field as keyof typeof formErrors];
        return (
            <Field
                key={question.field}
                controlId={id}
                label={question.label}
                required={question.required}
                helpText={question.helpText}
                error={error}
            >
                <textarea
                    id={id}
                    value={form[question.field]}
                    onChange={(event) => actions.setField(question.field, event.target.value)}
                    disabled={disabled}
                    rows={question.rows}
                    placeholder={question.placeholder}
                    aria-required={question.required || undefined}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={fieldDescribedBy(id, true, Boolean(error))}
                />
            </Field>
        );
    };

    return (
        <aside className="card form-panel">
            <div className="form-head">
                <div>
                    <strong>Preparar una Battlecard</strong>
                    <small>Responde cinco preguntas para construir una solicitud precisa.</small>
                </div>
                <span className="form-progress">{QUESTIONS.length + 1} preguntas</span>
            </div>

            <div className="form-body">
                <div className="form-introduction">
                    <strong>Generación guiada</strong>
                    <p>
                        El formulario preparará una instrucción editable en el chat.
                        Nada se enviará hasta que presiones Enviar.
                    </p>
                </div>

                <Field controlId={controlId("company")} label="Empresa principal" helpText="Empresa cuya oferta quieres posicionar.">
                    <input
                        id={controlId("company")}
                        value={form.company}
                        onChange={(event) => actions.setField("company", event.target.value)}
                        disabled={disabled}
                        placeholder="Ej.: CONSEIN"
                        aria-describedby={fieldDescribedBy(controlId("company"), true, false)}
                    />
                </Field>

                {QUESTIONS.map(renderTextArea)}

                <fieldset className="analysis-fieldset">
                    <legend>
                        5. ¿Qué enfoque debe aplicar el análisis?
                        <span aria-hidden="true"> *</span>
                    </legend>

                    <p className="analysis-description">Selecciona el nivel de rigurosidad que debe aplicar Leitner IA.</p>

                    <div className="analysis-options">
                        {APPROACHES.map((approach) => (
                            <label
                                key={approach.value}
                                className={
                                    form.analysisApproach === approach.value
                                        ? "analysis-option analysis-option--selected"
                                        : "analysis-option"
                                }
                            >
                                <input
                                    type="radio"
                                    name={controlId("analysisApproach")}
                                    value={approach.value}
                                    checked={form.analysisApproach === approach.value}
                                    disabled={disabled}
                                    onChange={() => actions.setField("analysisApproach", approach.value)}
                                />
                                <span className="analysis-option__control" />
                                <span className="analysis-option__content">
                                    <strong>{approach.title}</strong>
                                    <small>{approach.description}</small>
                                </span>
                            </label>
                        ))}
                    </div>

                    {formErrors.analysisApproach && <span className="field-error">{formErrors.analysisApproach}</span>}
                </fieldset>

                <div className="optional-fields">
                    <div className="optional-fields__heading">
                        <strong>Contexto complementario</strong>
                        <span>Opcional</span>
                    </div>

                    <Field
                        controlId={controlId("sector")}
                        label="Sector o industria"
                        helpText="Ayuda a contextualizar regulaciones, prioridades y lenguaje comercial."
                    >
                        <select
                            id={controlId("sector")}
                            value={form.sector}
                            onChange={(event) => actions.setField("sector", event.target.value)}
                            disabled={disabled}
                            aria-describedby={fieldDescribedBy(controlId("sector"), true, false)}
                        >
                            <option value="">Seleccionar sector...</option>
                            {SECTOR_OPTIONS.map((item) => (
                                <option key={item} value={item}>
                                    {item}
                                </option>
                            ))}
                        </select>
                    </Field>

                    {renderTextArea({
                        field: "additionalContext",
                        label: "Contexto adicional de la oportunidad",
                        helpText: "Incluye restricciones, antecedentes, fechas, requisitos técnicos o información conocida del proceso de compra.",
                        placeholder: "Ej.: El cliente ya utiliza Microsoft 365, exige residencia de datos y espera una demostración funcional.",
                        rows: 4,
                    })}
                </div>

                <AttachmentPicker />

                <button
                    type="button"
                    className="dark-btn prepare-prompt-button"
                    disabled={disabled || !canPrepare}
                    onClick={actions.preparePrompt}
                >
                    Preparar solicitud
                    <span aria-hidden="true">→</span>
                </button>

                {!canPrepare && (
                    <p className="form-hint">Completa las cinco preguntas obligatorias para preparar la solicitud.</p>
                )}

                {hasPreparedPrompt && (
                    <div className="prompt-ready" role="status">
                        <strong>Solicitud preparada</strong>
                        <span>Revisa el contenido en el cuadro del chat y presiona Enviar cuando estés de acuerdo.</span>
                    </div>
                )}
            </div>
        </aside>
    );
}
