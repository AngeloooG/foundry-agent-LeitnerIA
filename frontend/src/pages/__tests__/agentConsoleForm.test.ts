import { describe, expect, it } from "vitest";
import { updateFormField } from "../agentConsoleForm";

describe("updateFormField", () => {
  it("updates the requested field without mutating other fields", () => {
    const form = {
      empresa: "CONSEIN",
      competidor: "",
      sector: "",
      servicio: "",
      producto: "",
      contexto: "",
      objetivo: "",
    };

    const nextForm = updateFormField(form, "competidor", "Accenture");

    expect(nextForm.competidor).toBe("Accenture");
    expect(nextForm.empresa).toBe("CONSEIN");
    expect(nextForm.sector).toBe("");
  });
});
