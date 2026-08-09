export interface AgentConsoleForm {
  empresa: string;
  competidor: string;
  sector: string;
  servicio: string;
  producto: string;
  contexto: string;
  objetivo: string;
}

export function updateFormField<T extends AgentConsoleForm>(
  form: T,
  field: keyof T,
  value: string
): T {
  return {
    ...form,
    [field]: value,
  };
}
