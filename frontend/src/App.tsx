import { useEffect } from "react";

import { InteractionStatus, InteractionType } from "@azure/msal-browser";
import {
  useIsAuthenticated,
  useMsal,
  useMsalAuthentication,
} from "@azure/msal-react";
import { Spinner } from "@fluentui/react-components";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router";

import "./App.css";

import Header from "./components/Header";
import { ErrorBoundary } from "./components/core/ErrorBoundary";
import { loginRequest } from "./config/authConfig";
import AgentConsole from "./pages/AgentConsole";
import Home from "./pages/Home";

/**
 * Root component: forces sign-in (redirect) and renders the routes once the user is authenticated.
 * Authentication state comes straight from MSAL, so streaming updates in the global store do not
 * re-render the whole application.
 */
export default function App() {
  const { error } = useMsalAuthentication(
    InteractionType.Redirect,
    loginRequest
  );
  const { instance, inProgress } = useMsal();
  const isAuthenticated = useIsAuthenticated();
  const location = useLocation();

  useEffect(() => {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }, [location.pathname]);

  if (error && !isAuthenticated && inProgress === InteractionStatus.None) {
    return (
      <div className="loading-screen" role="alert">
        <p>No se pudo iniciar sesión.</p>
        <p>
          Si el problema persiste, solicite acceso a LeitnerIA a su administrador
          {error.errorCode ? ` (código: ${error.errorCode})` : ""}.
        </p>
        <button
          type="button"
          className="primary-btn"
          onClick={() => void instance.loginRedirect(loginRequest)}
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="loading-screen" aria-live="polite">
        <Spinner size="large" />
        <p>Iniciando sesión...</p>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="leitner-app">
        <Header />

        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/agente" element={<AgentConsole />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </ErrorBoundary>
  );
}
