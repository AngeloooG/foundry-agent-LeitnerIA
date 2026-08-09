export type BattlecardStatus = "Generada" | "En revisión" | "Borrador" | "Descargada";

export interface Battlecard {
  id: number;
  empresa: string;
  competidor: string;
  sector: string;
  servicio: string;
  producto: string;
  nivel: string;
  estado: BattlecardStatus;
  fecha: string;
  resumen: string;
  ventajas: string[];
  riesgos: string[];
  recomendaciones: string[];
}

export const battlecardsData: Battlecard[] = [
  {
    id: 1,
    empresa: "CONSEIN",
    competidor: "IBM",
    sector: "Servicios tecnológicos",
    servicio: "Migración a Azure",
    producto: "Azure OpenAI",
    nivel: "Empresa · Servicio · Producto",
    estado: "Generada",
    fecha: "28 Jul 2025",
    resumen:
      "CONSEIN presenta ventajas significativas en velocidad de implementación, cercanía consultiva y experiencia local en el ecosistema Microsoft.",
    ventajas: [
      "Especialización en soluciones Microsoft y Azure.",
      "Mayor cercanía comercial y técnica en el mercado local.",
      "Capacidad de construir propuestas ajustadas a procesos reales del cliente.",
    ],
    riesgos: [
      "IBM posee mayor reconocimiento global de marca.",
      "Puede competir con capacidades enterprise amplias y portafolio global.",
    ],
    recomendaciones: [
      "Posicionar a CONSEIN como socio Microsoft especializado y ágil.",
      "Usar casos de éxito locales como evidencia comercial.",
      "Enfatizar reducción de tiempo de implementación frente a competidores globales.",
    ],
  },
  {
    id: 2,
    empresa: "CONSEIN",
    competidor: "Accenture",
    sector: "Consultoría tecnológica",
    servicio: "IA y automatización",
    producto: "Microsoft Copilot",
    nivel: "Empresa · Servicio",
    estado: "En revisión",
    fecha: "25 Jul 2025",
    resumen:
      "Accenture ofrece soluciones de IA a escala global, mientras CONSEIN puede diferenciarse por especialización Microsoft y acompañamiento cercano.",
    ventajas: [
      "Mayor foco en adopción Microsoft para clientes regionales.",
      "Menor fricción operativa en ejecución de proyectos medianos.",
      "Capacidad de personalizar la entrega con equipos especializados.",
    ],
    riesgos: [
      "Accenture puede influir en decisiones corporativas globales.",
      "Percepción de mayor capacidad para proyectos multinacionales.",
    ],
    recomendaciones: [
      "Enfocar la conversación en velocidad, proximidad y especialización.",
      "Demostrar prototipos funcionales rápidamente.",
      "Evitar competir solo por tamaño de portafolio.",
    ],
  },
  {
    id: 3,
    empresa: "CONSEIN",
    competidor: "Oracle",
    sector: "Soluciones empresariales",
    servicio: "Bases de datos y nube",
    producto: "Azure SQL",
    nivel: "Producto",
    estado: "Generada",
    fecha: "20 Jul 2025",
    resumen:
      "Oracle domina en bases de datos relacionales tradicionales, pero CONSEIN puede posicionar Azure como una plataforma moderna y flexible.",
    ventajas: [
      "Integración con servicios Azure y Microsoft 365.",
      "Modelo cloud flexible para modernización progresiva.",
      "Acompañamiento consultivo durante migración.",
    ],
    riesgos: [
      "Oracle conserva fuerte presencia en cargas críticas heredadas.",
      "Algunos clientes pueden temer migraciones complejas.",
    ],
    recomendaciones: [
      "Proponer assessment técnico previo.",
      "Presentar escenarios híbridos para reducir riesgo.",
      "Cuantificar beneficios de modernización y productividad.",
    ],
  },
  {
    id: 4,
    empresa: "CONSEIN",
    competidor: "AWS Partner",
    sector: "Cloud services",
    servicio: "Infraestructura cloud",
    producto: "Microsoft Azure",
    nivel: "Empresa · Servicio · Producto",
    estado: "Generada",
    fecha: "15 Jul 2025",
    resumen:
      "Los partners de AWS compiten en infraestructura cloud con amplio portafolio, mientras CONSEIN se diferencia por integración Microsoft.",
    ventajas: [
      "Integración natural con Microsoft 365, Entra ID y Power Platform.",
      "Gobierno e identidad empresarial sobre ecosistema Microsoft.",
      "Experiencia en adopción cloud para organizaciones locales.",
    ],
    riesgos: [
      "AWS puede ser percibido como líder técnico cloud.",
      "Algunos equipos técnicos pueden preferir servicios AWS existentes.",
    ],
    recomendaciones: [
      "Enfatizar integración de identidad, productividad y datos.",
      "Mostrar escenarios Azure híbridos y de seguridad.",
      "Conectar conversación técnica con resultados de negocio.",
    ],
  },
  {
    id: 5,
    empresa: "CONSEIN",
    competidor: "SAP Partner",
    sector: "Transformación digital",
    servicio: "Soluciones empresariales",
    producto: "Power Platform",
    nivel: "Servicio",
    estado: "Borrador",
    fecha: "10 Jul 2025",
    resumen:
      "SAP domina procesos ERP enterprise, pero CONSEIN puede posicionar Power Platform y Azure como capa ágil de automatización e integración.",
    ventajas: [
      "Automatización rápida sobre procesos existentes.",
      "Menor barrera de adopción para usuarios de negocio.",
      "Integración con Microsoft 365 y flujos internos.",
    ],
    riesgos: [
      "SAP puede controlar procesos core del cliente.",
      "Puede existir dependencia operativa de consultores SAP.",
    ],
    recomendaciones: [
      "No plantear reemplazo frontal de SAP.",
      "Proponer automatización complementaria con Power Platform.",
      "Identificar procesos de alto impacto y baja complejidad inicial.",
    ],
  },
];