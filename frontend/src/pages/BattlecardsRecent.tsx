import { useMemo, useState } from "react";
import type { Page } from "../App";
import { battlecardsData, type BattlecardStatus } from "../data/battlecards";

interface Props {
  onNavigate: (page: Page, id?: number) => void;
}

const statuses: Array<BattlecardStatus | "Todos"> = ["Todos", "Generada", "En revisión", "Borrador", "Descargada"];

export default function BattlecardsRecent({ onNavigate }: Props) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<BattlecardStatus | "Todos">("Todos");

  const filtered = useMemo(() => {
    return battlecardsData.filter((card) => {
      const text = `${card.competidor} ${card.sector} ${card.servicio}`.toLowerCase();
      const matchSearch = !search || text.includes(search.toLowerCase());
      const matchStatus = status === "Todos" || card.estado === status;
      return matchSearch && matchStatus;
    });
  }, [search, status]);

  return (
    <main className="app-shell recent-page">
      <section className="recent-hero dot-bg">
        <div className="container recent-head">
          <div>
            <div className="badge badge-green">● Análisis competitivos</div>
            <h1>Battlecards recientes</h1>
            <p>Consulta los análisis competitivos generados por Leitner IA. Filtra, revisa y descarga resultados.</p>

            <div className="recent-stats">
              <span><strong>{battlecardsData.length}</strong>Total de Battlecards</span>
              <span><strong>{battlecardsData.filter((b) => b.estado === "Generada").length}</strong>Generadas</span>
              <span><strong>{battlecardsData.filter((b) => b.estado === "En revisión").length}</strong>En revisión</span>
              <span><strong>{battlecardsData.filter((b) => b.estado === "Borrador").length}</strong>Borradores</span>
            </div>
          </div>

          <button className="primary-btn" onClick={() => onNavigate("agent")}>
            + Nueva Battlecard
          </button>
        </div>
      </section>

      <section className="filters-bar">
        <div className="container filters-inner">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por empresa, sector o servicio..." />

          <div className="chips">
            {statuses.map((item) => (
              <button key={item} className={status === item ? "active" : ""} onClick={() => setStatus(item)}>
                {item}
              </button>
            ))}
            <span>{filtered.length} resultados</span>
          </div>
        </div>
      </section>

      <section className="container cards-grid">
        {filtered.map((card) => (
          <article className="battlecard card" key={card.id}>
            <div className="card-accent" />
            <div className="battlecard-head">
              <small>CONSEIN VS</small>
              <span className={`status ${card.estado.replaceAll(" ", "-").toLowerCase()}`}>{card.estado}</span>
            </div>

            <h2>{card.competidor}</h2>

            <dl>
              <div><dt>Sector</dt><dd>{card.sector}</dd></div>
              <div><dt>Servicio</dt><dd>{card.servicio}</dd></div>
              <div><dt>Nivel</dt><dd>{card.nivel}</dd></div>
            </dl>

            <p>{card.resumen}</p>

            <footer>
              <small>{card.fecha}</small>
              <div>
                <button onClick={() => onNavigate("detail", card.id)}>Ver detalle</button>
                <button className={card.estado === "Borrador" ? "orange" : ""}>
                  {card.estado === "Borrador" ? "Continuar" : "Descargar"}
                </button>
              </div>
            </footer>
          </article>
        ))}
      </section>

      <style>{`
        .recent-hero {
          background-color: #081527;
          color: #fff;
          padding: 36px 0;
        }

        .recent-head {
          display: flex;
          justify-content: space-between;
          gap: 20px;
          align-items: start;
        }

        .recent-head h1 {
          font-size: 32px;
          margin: 18px 0 10px;
        }

        .recent-head p {
          color: rgba(255,255,255,.62);
          max-width: 560px;
          line-height: 1.6;
        }

        .recent-stats {
          display: flex;
          gap: 28px;
          flex-wrap: wrap;
          margin-top: 24px;
        }

        .recent-stats span {
          color: rgba(255,255,255,.45);
          font-size: 12px;
        }

        .recent-stats strong {
          display: block;
          color: #fff;
          font-size: 24px;
        }

        .filters-bar {
          background: #fff;
          border-bottom: 1px solid #dde6ef;
          padding: 14px 0;
        }

        .filters-inner {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
          align-items: center;
        }

        .filters-inner input {
          width: 300px;
          border: 1px solid #dde6ef;
          border-radius: 8px;
          padding: 10px 12px;
          background: #f6f9fc;
        }

        .chips {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          align-items: center;
        }

        .chips button {
          border: 1px solid #dde6ef;
          border-radius: 999px;
          background: #f6f9fc;
          padding: 8px 14px;
          color: #53637a;
          font-weight: 700;
          font-size: 12px;
        }

        .chips button.active {
          background: #005b96;
          color: #fff;
          border-color: #005b96;
        }

        .chips span {
          color: #8a98a8;
          font-size: 12px;
        }

        .cards-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 18px;
          padding-top: 26px;
          padding-bottom: 40px;
        }

        .battlecard {
          position: relative;
          overflow: hidden;
          padding: 22px 18px 0;
        }

        .card-accent {
          position: absolute;
          inset: 0 0 auto 0;
          height: 4px;
          background: linear-gradient(90deg, #005b96, #7cbce3);
        }

        .battlecard-head {
          display: flex;
          justify-content: space-between;
          gap: 14px;
          align-items: center;
        }

        .battlecard-head small {
          color: #9aa6b2;
          font-weight: 900;
          letter-spacing: .08em;
        }

        .status {
          border-radius: 999px;
          padding: 5px 12px;
          font-size: 11px;
          font-weight: 900;
          background: #dcfce7;
          color: #15803d;
        }

        .status.en-revisión {
          background: #fef3c7;
          color: #92400e;
        }

        .status.borrador {
          background: #f1f5f9;
          color: #475569;
        }

        .battlecard h2 {
          margin: 12px 0 16px;
          font-size: 21px;
        }

        .battlecard dl {
          display: grid;
          gap: 9px;
          margin: 0;
        }

        .battlecard dl div {
          display: grid;
          grid-template-columns: 70px 1fr;
          gap: 10px;
          font-size: 12px;
        }

        .battlecard dt {
          color: #8a98a8;
        }

        .battlecard dd {
          margin: 0;
          color: #061226;
        }

        .battlecard p {
          color: #53637a;
          font-size: 13px;
          line-height: 1.65;
          margin: 20px 0;
        }

        .battlecard footer {
          border-top: 1px solid #dde6ef;
          margin-left: -18px;
          margin-right: -18px;
          padding: 14px 18px;
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: center;
        }

        .battlecard footer small {
          color: #8a98a8;
        }

        .battlecard footer div {
          display: flex;
          gap: 8px;
        }

        .battlecard footer button {
          border: 1px solid #dde6ef;
          border-radius: 7px;
          padding: 8px 12px;
          background: #f6f9fc;
          color: #061226;
          font-size: 12px;
          font-weight: 800;
        }

        .battlecard footer button:last-child {
          background: #005b96;
          color: #fff;
          border-color: #005b96;
        }

        .battlecard footer button.orange {
          background: #f59e0b;
          border-color: #f59e0b;
        }

        @media (max-width: 980px) {
          .cards-grid {
            grid-template-columns: 1fr;
          }

          .recent-head {
            flex-direction: column;
          }

          .filters-inner input {
            width: 100%;
          }
        }
      `}</style>
    </main>
  );
}