import { describe, expect, it } from "vitest";
import {
  buildBattlecardPrompt,
  initialBattlecardForm,
  isBattlecardFormValid,
  updateFormField,
  validateBattlecardForm,
  type BattlecardForm,
} from "../agentConsoleForm";

describe("agentConsoleForm", () => {
  const validForm: BattlecardForm = {
    company: "CONSEIN",
    offering:
      "Implementación de Microsoft Copilot Studio integrada con Power Automate y Azure AI Search.",
    targetCustomer:
      "Banco mediano. El decisor principal es el Director de Operaciones, acompañado por Tecnología y Cumplimiento.",
    competitors:
      "IBM, Accenture, UiPath, desarrollo interno y proceso manual actual.",
    desiredOutcome:
      "Reducir el tiempo de atención, mantener trazabilidad y desplegar la solución en menos de tres meses.",
    analysisApproach: "verified",
    sector: "Banca y finanzas",
    additionalContext:
      "El cliente ya utiliza Microsoft 365 y requiere trazabilidad de las aprobaciones.",
  };

  it("initializes the form with verified analysis by default", () => {
    expect(initialBattlecardForm.company).toBe("CONSEIN");
    expect(initialBattlecardForm.analysisApproach).toBe("verified");
    expect(initialBattlecardForm.offering).toBe("");
    expect(initialBattlecardForm.competitors).toBe("");
  });

  it("updates the selected form field without mutating the original object", () => {
    const originalForm = {
      ...initialBattlecardForm,
    };

    const updatedForm = updateFormField(
      originalForm,
      "competitors",
      "IBM y Accenture"
    );

    expect(updatedForm.competitors).toBe("IBM y Accenture");
    expect(originalForm.competitors).toBe("");
    expect(updatedForm).not.toBe(originalForm);
  });

  it("updates the analysis approach", () => {
    const updatedForm = updateFormField(
      initialBattlecardForm,
      "analysisApproach",
      "strategic"
    );

    expect(updatedForm.analysisApproach).toBe("strategic");
  });

  it("returns validation errors when required fields are empty", () => {
    const errors = validateBattlecardForm(
      initialBattlecardForm
    );

    expect(errors.offering).toBeDefined();
    expect(errors.targetCustomer).toBeDefined();
    expect(errors.competitors).toBeDefined();
    expect(errors.desiredOutcome).toBeDefined();
  });

  it("accepts a complete form as valid", () => {
    const errors = validateBattlecardForm(validForm);

    expect(errors).toEqual({});
    expect(isBattlecardFormValid(validForm)).toBe(true);
  });

  it("rejects an incomplete form", () => {
    const incompleteForm: BattlecardForm = {
      ...validForm,
      competitors: "",
    };

    expect(isBattlecardFormValid(incompleteForm)).toBe(false);
    expect(
      validateBattlecardForm(incompleteForm).competitors
    ).toBeDefined();
  });

  it("builds a verified Battlecard prompt", () => {
    const prompt = buildBattlecardPrompt(validForm);

    expect(prompt).toContain("CONSEIN");
    expect(prompt).toContain(validForm.offering);
    expect(prompt).toContain(validForm.targetCustomer);
    expect(prompt).toContain(validForm.competitors);
    expect(prompt).toContain(validForm.desiredOutcome);
    expect(prompt).toContain("Estrictamente verificado");
    expect(prompt).toContain(
      "Una Battlecard accionable, verificable y lista para revisión comercial"
    );
  });

  it("builds a strategic prompt with explicit inference controls", () => {
    const strategicForm: BattlecardForm = {
      ...validForm,
      analysisApproach: "strategic",
    };

    const prompt = buildBattlecardPrompt(strategicForm);

    expect(prompt).toContain(
      "Estratégico basado en evidencia"
    );
    expect(prompt).toContain("inferencias");
    expect(prompt).toContain(
      "No inventes cifras, clientes, certificaciones, capacidades ni casos de éxito"
    );
  });

  it("includes attachment names in the generated prompt", () => {
    const prompt = buildBattlecardPrompt(validForm, [
      "requerimientos-cliente.pdf",
      "comparativa-competidores.csv",
    ]);

    expect(prompt).toContain("requerimientos-cliente.pdf");
    expect(prompt).toContain(
      "comparativa-competidores.csv"
    );
    expect(prompt).toContain(
      "Utiliza estos archivos como contexto prioritario"
    );
  });

  it("states when no reference files are attached", () => {
    const prompt = buildBattlecardPrompt(validForm);

    expect(prompt).toContain(
      "No se adjuntaron archivos de referencia"
    );
  });
});