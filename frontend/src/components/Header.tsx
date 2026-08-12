import { useState } from "react";
import type { Page } from "../App";

interface HeaderProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
}

const navItems: Array<{ id: Page; label: string }> = [
  {
    id: "home",
    label: "Inicio",
  },
  {
    id: "agent",
    label: "Probar agente",
  },
];

export default function Header({
  currentPage,
  onNavigate,
}: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const handleNavigate = (page: Page) => {
    onNavigate(page);
    setMenuOpen(false);
  };

  return (
    <header className="site-header">
      <div className="site-header__container">
        <button
          type="button"
          className="site-brand"
          onClick={() => handleNavigate("home")}
          aria-label="Ir al inicio"
        >
          <span className="site-brand__mark" aria-hidden="true">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
            >
              <path
                d="M5 15L12 7L19 15"
                stroke="#8CC63F"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M8 16H16"
                stroke="#7CBCE3"
                strokeWidth="2.4"
                strokeLinecap="round"
              />
            </svg>
          </span>

          <span className="site-brand__text">
            <strong>CONSEIN</strong>
            <small>Leitner IA</small>
          </span>
        </button>

        <nav className="desktop-navigation" aria-label="Navegación principal">
          {navItems.map((item) => (
            <button
              type="button"
              key={item.id}
              className={
                currentPage === item.id
                  ? "navigation-link navigation-link--active"
                  : "navigation-link"
              }
              onClick={() => handleNavigate(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <button
          type="button"
          className="mobile-menu-button"
          onClick={() => setMenuOpen((previous) => !previous)}
          aria-expanded={menuOpen}
          aria-controls="mobile-navigation"
          aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
        >
          {menuOpen ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path
                d="M6 6L18 18M18 6L6 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path
                d="M4 7H20M4 12H20M4 17H20"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          )}
        </button>
      </div>

      {menuOpen && (
        <nav
          id="mobile-navigation"
          className="mobile-navigation"
          aria-label="Navegación móvil"
        >
          {navItems.map((item) => (
            <button
              type="button"
              key={item.id}
              className={
                currentPage === item.id
                  ? "mobile-navigation__link mobile-navigation__link--active"
                  : "mobile-navigation__link"
              }
              onClick={() => handleNavigate(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      )}

      <style>{`
        .site-header {
          position: fixed;
          inset: 0 0 auto;
          z-index: 50;
          height: 58px;
          background: #17263a;
          border-bottom: 1px solid rgba(124, 188, 227, 0.12);
          box-shadow: 0 2px 12px rgba(3, 14, 29, 0.12);
        }

        .site-header__container {
          max-width: 1180px;
          height: 58px;
          margin: 0 auto;
          padding: 0 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
        }

        .site-brand {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          flex: 0 0 auto;
          padding: 0;
          border: 0;
          background: transparent;
          color: #ffffff;
        }

        .site-brand__mark {
          width: 34px;
          height: 34px;
          border-radius: 9px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex: 0 0 34px;
          background: #005b96;
        }

        .site-brand__text {
          display: block;
          text-align: left;
        }

        .site-brand__text strong {
          display: block;
          color: #ffffff;
          font-size: 13px;
          line-height: 1.2;
          letter-spacing: 0.04em;
        }

        .site-brand__text small {
          display: block;
          margin-top: 2px;
          color: #7cbce3;
          font-size: 10px;
          line-height: 1.2;
        }

        .desktop-navigation {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }

        .navigation-link {
          border: 0;
          border-radius: 8px;
          padding: 8px 16px;
          background: transparent;
          color: rgba(255, 255, 255, 0.72);
          font-size: 13px;
          font-weight: 650;
          transition:
            color 160ms ease,
            background-color 160ms ease;
        }

        .navigation-link:hover {
          color: #ffffff;
          background: rgba(255, 255, 255, 0.06);
        }

        .navigation-link--active {
          color: #7cbce3;
          background: rgba(124, 188, 227, 0.14);
        }

        .mobile-menu-button {
          display: none;
          width: 40px;
          height: 40px;
          border: 0;
          border-radius: 8px;
          align-items: center;
          justify-content: center;
          background: transparent;
          color: #ffffff;
        }

        .mobile-navigation {
          display: none;
        }

        @media (max-width: 720px) {
          .site-header__container {
            padding: 0 18px;
          }

          .desktop-navigation {
            display: none;
          }

          .mobile-menu-button {
            display: inline-flex;
          }

          .mobile-navigation {
            display: flex;
            position: absolute;
            top: 58px;
            left: 0;
            right: 0;
            flex-direction: column;
            gap: 4px;
            padding: 14px 18px 18px;
            background: #17263a;
            border-top: 1px solid rgba(255, 255, 255, 0.06);
            border-bottom: 1px solid rgba(124, 188, 227, 0.12);
            box-shadow: 0 12px 24px rgba(3, 14, 29, 0.18);
          }

          .mobile-navigation__link {
            width: 100%;
            border: 0;
            border-radius: 8px;
            padding: 12px 14px;
            background: transparent;
            color: rgba(255, 255, 255, 0.78);
            text-align: left;
            font-size: 14px;
            font-weight: 650;
          }

          .mobile-navigation__link--active {
            color: #7cbce3;
            background: rgba(124, 188, 227, 0.12);
          }
        }
      `}</style>
    </header>
  );
}