import { useState } from "react";
import { Link, NavLink, useLocation } from "react-router";
import "./Header.css";

const navItems = [
  { to: "/", label: "Inicio", end: true },
  { to: "/agente", label: "Probar agente", end: false },
] as const;

export default function Header() {
  const location = useLocation();
  // The mobile menu is open only for the route where it was opened, so navigating closes it
  // without an effect that resets state after render.
  const [menuOpenAt, setMenuOpenAt] = useState<string | null>(null);
  const menuOpen = menuOpenAt === location.pathname;

  return (
    <header className="site-header">
      <div className="site-header__container">
        <Link
          className="site-brand"
          to="/"
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
        </Link>

        <nav className="desktop-navigation" aria-label="Navegación principal">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                isActive
                  ? "navigation-link navigation-link--active"
                  : "navigation-link"
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <button
          type="button"
          className="mobile-menu-button"
          onClick={() => setMenuOpenAt(menuOpen ? null : location.pathname)}
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
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                isActive
                  ? "mobile-navigation__link mobile-navigation__link--active"
                  : "mobile-navigation__link"
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      )}

    </header>
  );
}