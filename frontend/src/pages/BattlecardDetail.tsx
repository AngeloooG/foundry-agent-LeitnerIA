import type { Page } from "../App";
import { battlecardsData } from "../data/battlecards";

interface Props {
  battlecardId: number;
  onNavigate: (page: Page, id?: number) => void;
}

export default function BattlecardDetail({ battlecardId, onNavigate }: Props) {
  const card = battlecardsData.find((item) => item.id === battlecardId) || battlecardsData[0];

  return (
    <main className="app-shell detail-page">
      <section className="detail-hero grid-bg">
        <div className="container">
          <button className="back-link" onClick={() => onNavigate("battlecards")}>
            ← Battlecards recientes
          </button>

          <div className="detail-title">
            <div>
              <span>{card.estado}</span>
              <small>{card.fecha}</small>
              <h1>{card.empresa} vs {card.competidor}</h1>
            </div>

            <div className="detail-actions">
              <button className="primary-btn">Descargar Battlecard</button>
              <button className="secondary-btn" onClick={() => onNavigate("battlecards")}>Volver</button>
            </div>
          </div>
        </div>
      </section>

      <section className="container detail-layout">
        <div className="detail-main">
          <ContentBlock title="Resumen ejecutivo" color="#005b96">
            <p>{card.resumen}</p>
          </ContentBlock>

          <ContentBlock title="Ventajas competitivas" color="#8cc63f">
            <ul>{card.ventajas.map((item) => <li key={item}>{item}</li>)}</ul>
          </ContentBlock>

          <ContentBlock title="Riesgos identificados" color="#f59e0b">
            <ul>{card.riesgos.map((item) => <li key={item}>{item}</li>)}</ul>
          </ContentBlock>

          <ContentBlock title="Recomendaciones comerciales" color="#7cbce3">
            <ol>{card.recomendaciones.map((item) => <li key={item}>{item}</li>)}</ol>
          </ContentBlock>
        </div>

        <aside className="card detail-side">
          <h2>Ficha de la Battlecard</h2>

          {[
            ["Empresa principal", card.empresa],
            ["Competidor", card.competidor],
            ["Sector", card.sector],
            ["Servicio", card.servicio],
            ["Producto/Solución", card.producto],
            ["Nivel", card.nivel],
            ["Fecha", card.fecha],
            ["Estado", card.estado],
          ].map(([label, value]) => (
            <div className="meta-row" key={label}>
              <small>{label}</small>
              <strong>{value}</strong>
            </div>
          ))}

          <div className="side-actions">
            <button className="primary-btn">Descargar Battlecard</button>
            <button className="dark-btn" onClick={() => onNavigate("agent")}>Nueva Battlecard</button>
          </div>
        </aside>
      </section>

      <style>{`
        .detail-hero {
          background-color: #081527;
          color: #fff;
          padding: 34px 0 48px;
        }

        .back-link {
          background: transparent;
          border: 0;
          color: rgba(255,255,255,.55);
          font-weight: 700;
          padding: 0;
        }

        .detail-title {
          margin-top: 28px;
          display: flex;
          justify-content: space-between;
          gap: 28px;
          align-items: end;
        }

        .detail-title span {
          display: inline-block;
          background: #dcfce7;
          color: #15803d;
          border-radius: 999px;
          padding: 5px 12px;
          font-size: 12px;
          font-weight: 900;
          margin-right: 10px;
        }

        .detail-title small {
          color: rgba(255,255,255,.55);
        }

        .detail-title h1 {
          font-size: clamp(34px, 5vw, 52px);
          margin: 16px 0 0;
        }

        .detail-actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }

        .detail-layout {
          display: grid;
          grid-template-columns: 1fr 320px;
          gap: 22px;
          padding-top: 26px;
          padding-bottom: 46px;
          align-items: start;
        }

        .detail-main {
          display: grid;
          gap: 18px;
        }

        .content-block {
          background: #fff;
          border: 1px solid #dde6ef;
          border-radius: 16px;
          padding: 24px;
        }

        .content-block h2 {
          margin: 0 0 16px;
          font-size: 22px;
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .content-dot {
          width: 10px;
          height: 10px;
          border-radius: 99px;
        }

        .content-block p,
        .content-block li {
          color: #53637a;
          line-height: 1.75;
        }

        .detail-side {
          padding: 22px;
          position: sticky;
          top: 78px;
        }

        .detail-side h2 {
          margin: 0 0 18px;
          font-size: 20px;
        }

        .meta-row {
          border-bottom: 1px solid #dde6ef;
          padding: 12px 0;
        }

        .meta-row small {
          display: block;
          color: #8a98a8;
          font-weight: 800;
          text-transform: uppercase;
          font-size: 11px;
          margin-bottom: 4px;
        }

        .meta-row strong {
          font-size: 14px;
        }

        .side-actions {
          display: grid;
          gap: 10px;
          margin-top: 20px;
        }

        @media (max-width: 900px) {
          .detail-title,
          .detail-layout {
            grid-template-columns: 1fr;
            flex-direction: column;
            align-items: start;
          }

          .detail-layout {
            display: grid;
          }

          .detail-side {
            position: static;
          }
        }
      `}</style>
    </main>
  );
}

function ContentBlock({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  return (
    <article className="content-block">
      <h2>
        <span className="content-dot" style={{ background: color }} />
        {title}
      </h2>
      {children}
    </article>
  );
}