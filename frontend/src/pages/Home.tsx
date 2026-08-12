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

import type { Page } from "../App";

interface HomeProps {
  onNavigate: (page: Page, id?: number) => void;
}

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
      "Enlace de descarga y registro automático en Battlecards recientes.",
    Icon: Download,
    variant: "green",
  },
];

export default function Home({ onNavigate }: HomeProps) {
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
              <button
                type="button"
                className="primary-btn hero-primary-action"
                onClick={() => onNavigate("agent")}
              >
                <span aria-hidden="true">→</span>
                Probar agente
              </button>
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
                    } as React.CSSProperties
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
            <button
              type="button"
              className="dark-btn process-button"
              onClick={() => onNavigate("agent")}
            >
              Probar Leitner IA
              <span aria-hidden="true">→</span>
            </button>
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

      <style>{`
        .hero {
          min-height: 720px;
          background-color: #081527;
          color: #fff;
          display: flex;
          align-items: center;
        }
        .hero-primary-action {
          min-width: 164px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 9px;
        }

        .hero-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 70px;
          align-items: center;
        }

        .hero h1 {
        font-size: clamp(40px, 5vw, 58px);
        line-height: 1.08;
        letter-spacing: -0.035em;
        margin: 28px 0 22px;
        max-width: 640px;
        text-wrap: balance;
        }

        .hero h1 .shimmer-text {
        display: block;
        }

        .hero p {
          color: rgba(255,255,255,.64);
          font-size: 17px;
          line-height: 1.75;
          max-width: 560px;
        }

        .hero-actions {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
          margin-top: 34px;
        }

        .tech-row {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 42px;
        }

        .tech-row span {
          color: rgba(255,255,255,.62);
          border: 1px solid rgba(124,188,227,.25);
          border-radius: 999px;
          padding: 5px 12px;
          font: 12px "JetBrains Mono";
          background: rgba(255,255,255,.05);
        }

        .hero-preview {
          width: 100%;
          max-width: 540px;
          justify-self: end;
        }
              
        .preview-card {
          border-radius: 16px;
          padding: 26px;
          box-shadow: 0 24px 70px rgba(0, 0, 0, 0.18);
        }
              
        .preview-line:last-child {
          border-bottom: 0;
          padding-bottom: 0;
        }

        .preview-head {
          display: flex;
          justify-content: space-between;
          gap: 18px;
          margin-bottom: 22px;
        }

        .preview-head strong {
          display: block;
        }

        .preview-head small {
          display: block;
          color: rgba(255,255,255,.38);
          margin-top: 4px;
        }

        .preview-head span {
          align-self: start;
          border: 1px solid rgba(34,197,94,.4);
          color: #22c55e;
          border-radius: 999px;
          padding: 4px 12px;
          font-size: 11px;
          font-weight: 800;
        }

        .preview-line {
          display: flex;
          justify-content: space-between;
          gap: 20px;
          padding: 13px 0;
          border-bottom: 1px solid rgba(255,255,255,.07);
        }

        .preview-line small {
          color: rgba(255,255,255,.42);
        }

        .preview-line strong {
          color: #7cbce3;
          text-align: right;
          font-size: 13px;
        }
  
        .demo-note {
          margin-top: 14px;
          border: 1px solid rgba(255,255,255,.08);
          border-radius: 8px;
          padding: 9px 12px;
          font-size: 12px;
        }
        
        .section {
          padding: 88px 0;
        }

        .section.white {
          background: #fff;
        }

        .section.soft {
          background: #f5f8fb;
        }

        .section.dark {
          background-color: #081527;
          color: #fff;
        }

        .section-copy {
          max-width: 650px;
          margin-bottom: 54px;
        }

        .section-copy.center {
          text-align: center;
          margin-left: auto;
          margin-right: auto;
        }

        .section-copy h2 {
        font-size: clamp(30px, 4vw, 42px);
        margin: 20px 0 14px;
        line-height: 1.12;
        letter-spacing: -0.025em;
        text-wrap: balance;
        }

        .section-copy p {
          color: #53637a;
          line-height: 1.75;
          font-size: 16px;
        }

        .dark .section-copy p {
          color: rgba(255,255,255,.58);
        }

        .dark .section-copy span {
            display: inline;
            color: #7cbce3;
        }

        .benefits-grid {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 18px;
        }

        .benefit-card {
          padding: 22px 20px;
        }

        .benefit-card div {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #e9f2fb;
          color: #005b96;
          margin-bottom: 18px;
        }

        .benefit-card h3 {
          font-size: 15px;
          margin: 0 0 10px;
        }

        .benefit-card p {
          color: #53637a;
          font-size: 13px;
          line-height: 1.65;
          margin: 0;
        }
        .benefit-icon {
          width: 44px;
          height: 44px;
          border-radius: 11px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 18px;
          color: var(--benefit-icon-color);
          background: color-mix(
            in srgb,
            var(--benefit-icon-color) 10%,
            #ffffff
          );
          border: 1px solid color-mix(
            in srgb,
            var(--benefit-icon-color) 18%,
            transparent
          );
          transition:
            transform 180ms ease,
            background-color 180ms ease,
            border-color 180ms ease;
        }

        .benefit-card:hover .benefit-icon {
          transform: translateY(-2px) scale(1.04);
        }

        .benefit-icon svg {
          width: 22px;
          height: 22px;
          display: block;
          flex: 0 0 auto;
        }

        .layers-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 22px;
        }

        .layer-card {
          position: relative;
          border-radius: 16px;
          padding: 30px 26px;
          color: #fff;
          overflow: hidden;
          min-height: 300px;
        }

        .layer-1 { background: #005b96; }
        .layer-2 { background: #123263; }
        .layer-3 { background: #081527; }

        .layer-card > span {
          border: 1px solid rgba(255,255,255,.18);
          background: rgba(255,255,255,.08);
          border-radius: 999px;
          padding: 4px 12px;
          font-size: 11px;
          text-transform: uppercase;
          color: #7cbce3;
          font-weight: 800;
        }

        .layer-card b {
          position: absolute;
          top: 18px;
          right: 24px;
          font-size: 58px;
          opacity: .08;
        }

        .layer-card h3 {
          font-size: 25px;
          margin: 22px 0 12px;
        }

        .layer-card p,
        .layer-card li {
          color: rgba(255,255,255,.72);
          line-height: 1.65;
          font-size: 14px;
        }

        .layer-card ul {
          padding-left: 18px;
        }

        .process-section {
  overflow: hidden;
}

.process-heading {
  max-width: 720px;
  margin-bottom: 62px;
}

        .steps-grid {
          position: relative;
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          column-gap: clamp(24px, 3.5vw, 54px);
          align-items: start;
          width: 100%;
        }

        /* Línea visual que conecta los pasos */
        .steps-grid::before {
          content: "";
          position: absolute;
          top: 32px;
          left: 8%;
          right: 8%;
          height: 1px;
          background: linear-gradient(
            90deg,
            rgba(0, 91, 150, 0.16),
            rgba(140, 198, 63, 0.38),
            rgba(0, 91, 150, 0.38),
            rgba(140, 198, 63, 0.16)
          );
          z-index: 0;
        }

        .step-card {
          position: relative;
          z-index: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          padding: 0 6px;
        }

        .step-icon {
          width: 64px;
          height: 64px;
          flex: 0 0 64px;
          border-radius: 50%;
          color: #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 24px;
          border: 5px solid #ffffff;
          box-shadow:
            0 12px 30px rgba(0, 0, 0, 0.14),
            0 0 0 1px rgba(221, 230, 239, 0.8);
        }

        .step-icon svg {
          width: 25px;
          height: 25px;
          display: block;
        }

        .step-icon.blue {
          background: linear-gradient(135deg, #005b96, #123263);
        }

        .step-icon.green {
          background: linear-gradient(135deg, #8cc63f, #6ba32e);
        }

        .step-card small {
          display: block;
          color: #79b72f;
          font-size: 11px;
          font-weight: 900;
          line-height: 1.3;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          margin-bottom: 10px;
        }

        .step-card h3 {
          min-height: 44px;
          margin: 0 0 10px;
          color: #061226;
          font-size: 17px;
          line-height: 1.3;
          letter-spacing: -0.02em;
        }

        .step-card p {
          max-width: 250px;
          margin: 0;
          color: #53637a;
          font-size: 14px;
          line-height: 1.7;
        }

        .process-action {
          width: 100%;
          display: flex;
          justify-content: center;
          margin-top: 58px;
        }

        .process-button {
          min-width: 260px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: 14px 26px;
        }

        .process-button span {
          transition: transform 160ms ease;
        }

        .process-button:hover span {
          transform: translateX(4px);
        }

        .metrics-head {
          display: flex;
          justify-content: space-between;
          gap: 20px;
          align-items: start;
          margin-bottom: 42px;
        }

        .metrics-head h2 {
          margin: 0 0 8px;
        }

        .metrics-head p {
          color: #53637a;
          margin: 0;
        }

        .metrics-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 18px;
        }

        .emoji {
          font-size: 26px;
          margin-bottom: 16px;
        }

        .kpi-card strong {
          font-size: 40px;
          font-family: "DM Sans";
        }

        .kpi-card p {
          color: #53637a;
          margin: 8px 0 0;
        }

        .tech-cards {
          display: grid;
          grid-template-columns: repeat(6, 1fr);
          gap: 16px;
        }

        .tech-card {
          border-radius: 14px;
          padding: 24px 18px;
          text-align: center;
        }

        .tech-card div {
          width: 44px;
          height: 44px;
          border-radius: 10px;
          margin: 0 auto 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0,91,150,.3);
          color: #7cbce3;
        }
        
        .technology-icon {
          width: 52px;
          height: 52px;
          border-radius: 12px;
          margin: 0 auto 17px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: #7cbce3;
          background: rgba(0, 91, 150, 0.32);
          border: 1px solid rgba(124, 188, 227, 0.18);
        }

        .technology-icon img {
          width: 30px;
          height: 30px;
          display: block;
          object-fit: contain;
        }

        .technology-icon svg {
          width: 28px;
          height: 28px;
          display: block;
        }

        .tech-card {
          min-height: 150px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          transition:
            transform 180ms ease,
            border-color 180ms ease,
            background-color 180ms ease;
        }

        .tech-card:hover {
          transform: translateY(-3px);
          border-color: rgba(124, 188, 227, 0.32);
          background: rgba(255, 255, 255, 0.085);
        }

        .tech-card strong {
          line-height: 1.35;
          text-align: center;
        }

        @media (max-width: 980px) {
          .hero-grid,
          .layers-grid,
          .metrics-grid {
            grid-template-columns: 1fr;
          }

          .benefits-grid {
            grid-template-columns: repeat(2, 1fr);
          }

          .steps-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 46px 34px;
          }

          .steps-grid::before {
            display: none;
          }

          .step-card {
            align-items: center;
            text-align: center;
            padding: 0 18px;
          }

          .step-card h3 {
            min-height: auto;
          }

          .step-card p {
            max-width: 330px;
          }

          .process-action {
            margin-top: 48px;
          }

          .tech-cards {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (max-width: 560px) {
          .hero {
            min-height: auto;
            padding: 90px 0 54px;
          }

          .benefits-grid,
          .steps-grid,
          .tech-cards,
          .hero-kpis {
            grid-template-columns: 1fr;
          }

          .metrics-head {
            flex-direction: column;
          }
        }
      `}</style>
    </main>
  );
}