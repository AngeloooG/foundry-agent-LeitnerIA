import "./Home.css";

import type { CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";
import {
  BrainCircuit,
  Download,
  FileCheck2,
  FileText,
  Layers3,
  LayoutGrid,
  Network,
  Rocket,
  SearchCheck,
  WandSparkles,
} from "lucide-react";

import { Link } from "react-router";

interface Benefit {
  title: string;
  description: string;
  Icon: LucideIcon;
  color: string;
}

interface ProcessStep {
  step: string;
  title: string;
  description: string;
  Icon: LucideIcon;
  variant: "blue" | "green";
}

interface Technology {
  name: string;
  kind: "official" | "lucide";
  iconPath?: string;
  Icon?: LucideIcon;
  iconColor?: string;
}

const benefits: Benefit[] = [
  {
    title: "Acelera el análisis competitivo",
    description: "Genera Battlecards completas en minutos, no en días.",
    Icon: Rocket,
    color: "#005B96",
  },
  {
    title: "Estandariza Battlecards",
    description: "Estructura consistente para todos los análisis competitivos.",
    Icon: LayoutGrid,
    color: "#005B96",
  },
  {
    title: "Reduce trabajo manual",
    description:
      "Elimina horas de investigación y estructuración de documentos.",
    Icon: WandSparkles,
    color: "#8CC63F",
  },
  {
    title: "Organiza por empresa, servicio y solución",
    description: "Tres capas de análisis estructuradas y accionables.",
    Icon: Layers3,
    color: "#005B96",
  },
  {
    title: "Documentos accionables para ventas",
    description:
      "Resultados listos para presentar en conversaciones comerciales.",
    Icon: FileCheck2,
    color: "#8CC63F",
  },
];

const layers = [
  ["01", "Empresa", "Análisis de posicionamiento, capacidades y diferenciadores organizacionales.", ["Posicionamiento general", "Capacidades organizacionales", "Diferenciadores clave", "Riesgos competitivos"]],
  ["02", "Servicio", "Comparativa profunda de los servicios ofrecidos y su valor consultivo.", ["Comparación de servicios", "Valor consultivo", "Alcance y especialización", "Diferencias de entrega"]],
  ["03", "Producto o Solución", "Evaluación técnica de tecnologías, integraciones y propuestas de valor.", ["Fortalezas técnicas", "Integración Microsoft", "Casos de uso", "Recomendaciones comerciales"]],
];

const technologies: Technology[] = [
  {
    name: "Microsoft Foundry",
    kind: "official",
    iconPath: "/assets/technology/microsoft-foundry.svg",
  },
  {
    name: "GPT-5",
    kind: "official",
    iconPath: "/assets/technology/openai.svg",
  },
  {
    name: "Model Context Protocol",
    kind: "lucide",
    Icon: Network,
    iconColor: "#7CBCE3",
  },
  {
    name: "Power Automate",
    kind: "official",
    iconPath: "/assets/technology/power-automate.svg",
  },
  {
    name: "SharePoint",
    kind: "official",
    iconPath: "/assets/technology/sharepoint.svg",
  },
  {
    name: "CONSEIN Knowledge",
    kind: "lucide",
    Icon: BrainCircuit,
    iconColor: "#8CC63F",
  },
];

const steps: ProcessStep[] = [
  {
    step: "Paso 1",
    title: "El usuario proporciona contexto",
    description:
      "Empresa, competidor, sector, servicio, producto o solución y objetivo comercial.",
    Icon: FileText,
    variant: "blue",
  },
  {
    step: "Paso 2",
    title: "Leitner IA analiza",
    description:
      "Aplica estructura competitiva, organiza hallazgos y evalúa diferencias clave.",
    Icon: SearchCheck,
    variant: "green",
  },
  {
    step: "Paso 3",
    title: "Se genera la Battlecard",
    description:
      "Resumen ejecutivo, ventajas, riesgos y recomendaciones estructuradas.",
    Icon: FileCheck2,
    variant: "blue",
  },
  {
    step: "Paso 4",
    title: "El usuario descarga el resultado",
    description:
      "Enlace de descarga y registro automático en Sharepoint.",
    Icon: Download,
    variant: "green",
  },
];

export default function HomePage() {
  return (
    <main className="app-shell">
      <section className="hero grid-bg">
        <div className="container hero-grid">
          <div>
            <div className="badge badge-green">
              <span className="pulse-dot" style={{ width: 6, height: 6, borderRadius: 99, background: "#8cc63f" }} />
              Inteligencia competitiva · CONSEIN
            </div>

            <h1>
              Battlecards competitivas <span className="shimmer-text">impulsadas por inteligencia artificial</span>
            </h1>

            <p>
              Convierte información comercial en análisis competitivo accionable. Compara empresas,
              servicios y soluciones para destacar las ventajas de CONSEIN en cada oportunidad.
            </p>

            <div className="hero-actions">
              <Link
                className="primary-btn hero-primary-action"
                to="/agente"
              >
                <span aria-hidden="true">→</span>
                Probar agente
              </Link>
            </div>

            <div className="tech-row">
              {["Azure AI Foundry", "GPT-5", "MCP", "Power Automate", "SharePoint"].map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          </div>

          <div className="hero-preview">
            <div className="glass preview-card">
              <div className="preview-head">
                <div>
                  <strong>Battlecard Preview</strong>
                  <small>CONSEIN vs IBM · Migración Azure</small>
                </div>
                <span>Generada</span>
              </div>

              {[
                ["Ventaja principal", "Ecosistema Microsoft nativo"],
                ["Riesgo identificado", "Reconocimiento de marca"],
                ["Recomendación", "Workshop gratuito de Azure Assessment"],
              ].map(([label, value]) => (
                <div className="preview-line" key={label}>
                  <small>{label}</small>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="section white">
        <div className="container">
          <div className="section-copy left">
            <div className="badge badge-blue">¿Quién es Leitner IA?</div>
            <h2>El asistente de inteligencia competitiva de CONSEIN</h2>
            <p>
              Leitner IA ayuda a equipos comerciales, ventas y marketing a crear Battlecards entre
              compañias del mismo rubro, destacando ventajas competitivas, riesgos, oportunidades
              y argumentos de valor para CONSEIN.
            </p>
          </div>

          <div className="benefits-grid">
            {benefits.map(({ title, description, Icon, color }) => (
              <article className="card-soft benefit-card" key={title}>
                <div
                  className="benefit-icon"
                  style={
                    {
                      "--benefit-icon-color": color,
                    } as CSSProperties
                  }
                  aria-hidden="true"
                >
                  <Icon size={22} strokeWidth={1.8} />
                </div>

                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section soft">
        <div className="container">
          <div className="section-copy center">
            <div className="badge badge-green">Metodología de análisis</div>
            <h2>Las 3 capas del análisis competitivo</h2>
            <p>Cada Battlecard organiza el análisis en tres niveles complementarios para una visión completa y accionable.</p>
          </div>

          <div className="layers-grid">
            {layers.map(([num, title, desc, items], index) => (
              <article className={`layer-card layer-${index + 1}`} key={String(title)}>
                <span>Nivel {num}</span>
                <b>{num}</b>
                <h3>{title}</h3>
                <p>{desc}</p>
                <ul>
                  {(items as string[]).map((item) => <li key={item}>{item}</li>)}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section white process-section">
        <div className="container">
          <div className="section-copy center process-heading">
            <div className="badge badge-blue">Proceso</div>

            <h2>¿Cómo funciona Leitner IA?</h2>

            <p>
              Un proceso guiado en 4 pasos para generar análisis competitivo de calidad.
            </p>
          </div>

          <div className="steps-grid">
            {steps.map(({ step, title, description, Icon, variant }) => (
              <article className="step-card" key={step}>
                <div className={`step-icon ${variant}`} aria-hidden="true">
                  <Icon size={25} strokeWidth={1.8} />
                </div>

                <small>{step}</small>
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>

          <div className="process-action">
            <Link
              className="dark-btn process-button"
              to="/agente"
            >
              Probar Leitner IA
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </section>
      <section className="section dark dot-bg">
        <div className="container">
          <div className="section-copy center">
            <h2>Powered by <span>Microsoft AI Ecosystem</span></h2>
            <p>Leitner IA está construido sobre tecnologías Microsoft y automatización empresarial de nivel enterprise.</p>
          </div>

          <div className="tech-cards">
            {technologies.map((technology) => {
              const TechnologyLucideIcon = technology.Icon;

              return (
                <article className="glass tech-card" key={technology.name}>
                  <div className="technology-icon" aria-hidden="true">
                    {technology.kind === "official" && technology.iconPath ? (
                      <img
                        src={technology.iconPath}
                        alt=""
                        loading="lazy"
                      />
                    ) : TechnologyLucideIcon ? (
                      <TechnologyLucideIcon
                        size={28}
                        strokeWidth={1.7}
                        color={technology.iconColor || "#7CBCE3"}
                      />
                    ) : null}
                  </div>

                  <strong>{technology.name}</strong>
                </article>
              );
            })}
          </div>
        </div>
      </section>

    </main>
  );
}