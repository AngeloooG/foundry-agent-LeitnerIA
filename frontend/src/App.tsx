import { useEffect } from "react";

import { InteractionType } from "@azure/msal-browser";
import {
  AuthenticatedTemplate,
  UnauthenticatedTemplate,
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
import { useAppState } from "./hooks/useAppState";
import AgentConsole from "./pages/AgentConsole";
import Home from "./pages/Home";

export default function App() {
  useMsalAuthentication(
    InteractionType.Redirect,
    loginRequest
  );

  const { auth } = useAppState();
  const location = useLocation();

  useEffect(() => {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }, [location.pathname]);

  if (auth.status === "initializing") {
    return (
      <ErrorBoundary>
        <div className="loading-screen">
          <Spinner size="large" />
          <p>Preparando sesión...</p>
        </div>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <AuthenticatedTemplate>
        <div className="leitner-app">
          <Header />

          <Routes>
            <Route path="/" element={<Home />} />
            <Route
              path="/agente"
              element={<AgentConsole />}
            />
            <Route
              path="*"
              element={<Navigate to="/" replace />}
            />
          </Routes>
        </div>
      </AuthenticatedTemplate>

      <UnauthenticatedTemplate>
        <div className="loading-screen">
          <Spinner size="large" />
          <p>Iniciando sesión...</p>
        </div>
      </UnauthenticatedTemplate>
    </ErrorBoundary>
  );
}
