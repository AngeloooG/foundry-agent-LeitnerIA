import { useState } from "react";
import type { Page } from "../App";

interface HeaderProps {
  currentPage: Page;
  onNavigate: (page: Page, id?: number) => void;
}

const navItems: Array<{ id: Page; label: string }> = [
  { id: "home", label: "Inicio" },
  { id: "agent", label: "Probar agente" },
  { id: "battlecards", label: "Battlecards recientes" },
];

export default function Header({ currentPage, onNavigate }: HeaderProps) {
  const [open, setOpen] = useState(false);

  const go = (page: Page) => {
    onNavigate(page);
    setOpen(false);
  };

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <button className="brand" onClick={() => go("home")} aria-label="Ir al inicio">
          <span className="brand-mark">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M5 15L12 7L19 15" stroke="#8CC63F" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M8 16H16" stroke="#7CBCE3" strokeWidth="2.4" strokeLinecap="round" />
            </svg>
          </span>
          <span>
            <strong>CONSEIN</strong>
            <small>Leitner IA</small>
          </span>
        </button>

        <nav className="desktop-nav">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={currentPage === item.id ? "nav-link active" : "nav-link"}
              onClick={() => go(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <button className="header-cta" onClick={() => go("agent")}>
          Crear Battlecard
        </button>

        <button className="mobile-menu" onClick={() => setOpen((value) => !value)} aria-label="Abrir menú">
          ☰
        </button>
      </div>

      {open && (
        <div className="mobile-panel">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={currentPage === item.id ? "mobile-nav-link active" : "mobile-nav-link"}
              onClick={() => go(item.id)}
            >
              {item.label}
            </button>
          ))}
          <button className="primary-btn" onClick={() => go("agent")}>
            Crear Battlecard
          </button>
        </div>
      )}

      <style>{`
        .site-header {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          z-index: 50;
          height: 58px;
          background: #17263a;
          border-bottom: 1px solid rgba(124, 188, 227, 0.12);
        }

        .site-header-inner {
          max-width: 1180px;
          height: 58px;
          margin: 0 auto;
          padding: 0 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 22px;
        }

        .brand {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          background: transparent;
          border: 0;
          padding: 0;
          color: #fff;
        }

        .brand-mark {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          background: #005b96;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }

        .brand strong {
          display: block;
          font-size: 13px;
          letter-spacing: 0.04em;
        }

        .brand small {
          display: block;
          font-size: 11px;
          color: #7cbce3;
          margin-top: 1px;
        }

        .desktop-nav {
          display: flex;
          align-items: center;
          gap: 8px;
          flex: 1;
          justify-content: center;
        }

        .nav-link {
          border: 0;
          border-radius: 8px;
          padding: 8px 16px;
          background: transparent;
          color: rgba(255, 255, 255, 0.72);
          font-size: 14px;
          font-weight: 600;
        }

        .nav-link:hover,
        .nav-link.active {
          background: rgba(124, 188, 227, 0.14);
          color: #7cbce3;
        }

        .header-cta {
          border: 0;
          border-radius: 8px;
          background: linear-gradient(135deg, #8cc63f, #6ba32e);
          color: #fff;
          padding: 9px 18px;
          font-size: 13px;
          font-weight: 800;
        }

        .mobile-menu {
          display: none;
          border: 0;
          background: transparent;
          color: #fff;
          font-size: 22px;
        }

        .mobile-panel {
          display: none;
        }

        @media (max-width: 760px) {
          .desktop-nav,
          .header-cta {
            display: none;
          }

          .mobile-menu {
            display: block;
          }

          .mobile-panel {
            display: flex;
            flex-direction: column;
            gap: 8px;
            padding: 16px 24px;
            background: #17263a;
            border-bottom: 1px solid rgba(255,255,255,.1);
          }

          .mobile-nav-link {
            border: 0;
            background: transparent;
            color: rgba(255,255,255,.75);
            text-align: left;
            padding: 10px 0;
            font-weight: 700;
          }

          .mobile-nav-link.active {
            color: #7cbce3;
          }
        }
      `}</style>
    </header>
  );
}