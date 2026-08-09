import type { Page } from "../App";

interface HomeProps {
    onNavigate: (page: Page, id?: number) => void;
}

const benefits = [
    ["Acelera el análisis competitivo", "Genera Battlecards completas en minutos, no en días.", "⌾"],
    ["Estandariza Battlecards", "Estructura consistente para todos los análisis competitivos.", "▦"],
    ["Reduce trabajo manual", "Elimina horas de investigación y estructuración de documentos.", "☆"],
    ["Organiza por empresa, servicio y solución", "Tres capas de análisis estructuradas y accionables.", "◷"],
    ["Documentos accionables para ventas", "Resultados listos para presentar en conversaciones comerciales.", "⌁"],
];

const layers = [
    ["01", "Empresa", "Análisis de posicionamiento, capacidades y diferenciadores organizacionales.", ["Posicionamiento general", "Capacidades organizacionales", "Diferenciadores clave", "Riesgos competitivos"]],
    ["02", "Servicio", "Comparativa profunda de los servicios ofrecidos y su valor consultivo.", ["Comparación de servicios", "Valor consultivo", "Alcance y especialización", "Diferencias de entrega"]],
    ["03", "Producto o Solución", "Evaluación técnica de tecnologías, integraciones y propuestas de valor.", ["Fortalezas técnicas", "Integración Microsoft", "Casos de uso", "Recomendaciones comerciales"]],
];

const steps = [
    ["Paso 1", "El usuario proporciona contexto", "Empresa, competidor, sector, servicio, producto o solución y objetivo comercial.", "✎"],
    ["Paso 2", "Leitner IA analiza", "Aplica estructura competitiva, organiza hallazgos y evalúa diferencias clave.", "☼"],
    ["Paso 3", "Se genera la Battlecard", "Resumen ejecutivo, ventajas, riesgos y recomendaciones estructuradas.", "▤"],
    ["Paso 4", "El usuario descarga el resultado", "Enlace de descarga y registro automático en Battlecards recientes.", "⇩"],
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
                            <button className="primary-btn" onClick={() => onNavigate("agent")}>
                                → Probar agente
                            </button>
                            <button className="secondary-btn" onClick={() => onNavigate("battlecards")}>
                                Ver Battlecards recientes
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

                            <button onClick={() => onNavigate("detail", 1)}>Ver Battlecard completa →</button>
                        </div>

                        <div className="hero-kpis">
                            <div className="glass">
                                <strong>7 min</strong>
                                <small>Tiempo promedio de generación</small>
                            </div>
                            <div className="glass">
                                <strong>24</strong>
                                <small>Battlecards generadas</small>
                            </div>
                        </div>

                        <div className="demo-note">ⓘ Datos de demostración · No son métricas reales</div>
                    </div>
                </div>
            </section>

            <section className="section white">
                <div className="container">
                    <div className="section-copy left">
                        <div className="badge badge-blue">¿Qué es Leitner IA?</div>
                        <h2>El asistente de inteligencia competitiva de CONSEIN</h2>
                        <p>
                            Leitner IA ayuda a equipos comerciales, ventas y marketing a crear Battlecards entre
                            compañías del mismo rubro, destacando ventajas competitivas, riesgos, oportunidades
                            y argumentos de valor para CONSEIN.
                        </p>
                    </div>

                    <div className="benefits-grid">
                        {benefits.map(([title, desc, icon]) => (
                            <article className="card-soft benefit-card" key={title}>
                                <div>{icon}</div>
                                <h3>{title}</h3>
                                <p>{desc}</p>
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

            <section className="section white">
                <div className="container">
                    <div className="section-copy center">
                        <div className="badge badge-blue">Proceso</div>
                        <h2>Cómo funciona Leitner IA</h2>
                        <p>Un proceso guiado en 4 pasos para generar análisis competitivo de calidad.</p>
                    </div>

                    <div className="steps-grid">
                        {steps.map(([n, title, desc, icon], index) => (
                            <article className="step-card" key={title}>
                                <div className={index % 2 ? "step-icon green" : "step-icon blue"}>{icon}</div>
                                <small>{n}</small>
                                <h3>{title}</h3>
                                <p>{desc}</p>
                            </article>
                        ))}
                    </div>

                    <div style={{ textAlign: "center", marginTop: 44 }}>
                        <button className="dark-btn" onClick={() => onNavigate("agent")}>
                            Crear mi primera Battlecard →
                        </button>
                    </div>
                </div>
            </section>

            <section className="section soft">
                <div className="container">
                    <div className="metrics-head">
                        <div>
                            <h2>Métricas del MVP</h2>
                            <p>Resultados de la fase de demostración.</p>
                        </div>
                        <div className="badge badge-warning">☆ Métricas de demostración · No son datos de producción</div>
                    </div>

                    <div className="metrics-grid">
                        {[
                            ["📋", "24", "Battlecards creadas"],
                            ["🎯", "18", "Competidores analizados"],
                            ["⚡", "7 min", "Tiempo de generación"],
                            ["🚀", "12", "Oportunidades apoyadas"],
                        ].map(([icon, value, label], index) => (
                            <div className={index % 2 ? "kpi-card green" : "kpi-card"} key={label}>
                                <div className="emoji">{icon}</div>
                                <strong>{value}</strong>
                                <p>{label}</p>
                            </div>
                        ))}
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
                        {["Azure AI Foundry", "GPT-5", "Model Context Protocol", "Power Automate", "SharePoint", "CONSEIN Knowledge"].map((item) => (
                            <div className="glass tech-card" key={item}>
                                <div>◇</div>
                                <strong>{item}</strong>
                            </div>
                        ))}
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

        .preview-card {
          border-radius: 16px;
          padding: 24px;
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

        .preview-card button {
          width: 100%;
          margin-top: 18px;
          padding: 12px;
          border-radius: 8px;
          border: 1px solid rgba(0,91,150,.5);
          background: rgba(0,91,150,.35);
          color: #7cbce3;
          font-weight: 800;
        }

        .hero-kpis {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-top: 14px;
        }

        .hero-kpis > div {
          border-radius: 12px;
          padding: 18px;
        }

        .hero-kpis strong {
          display: block;
          color: #8cc63f;
          font-size: 28px;
          font-family: "DM Sans";
        }

        .hero-kpis small,
        .demo-note {
          color: rgba(255,255,255,.42);
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

        .steps-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 28px;
        }

        .step-icon {
          width: 64px;
          height: 64px;
          border-radius: 50%;
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 25px;
          margin-bottom: 22px;
          box-shadow: 0 12px 30px rgba(0,0,0,.16);
        }

        .step-icon.blue { background: #005b96; }
        .step-icon.green { background: #8cc63f; }

        .step-card small {
          color: #8cc63f;
          font-weight: 900;
          text-transform: uppercase;
          font-size: 12px;
        }

        .step-card h3 {
          font-size: 17px;
          margin: 10px 0;
        }

        .step-card p {
          color: #53637a;
          line-height: 1.65;
          font-size: 14px;
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

        .tech-card strong {
          font-size: 14px;
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
            grid-template-columns: repeat(2, 1fr);
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