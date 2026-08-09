import { AuthenticatedTemplate, UnauthenticatedTemplate, useMsalAuthentication } from "@azure/msal-react";
import { InteractionType } from "@azure/msal-browser";
import { Spinner } from "@fluentui/react-components";
import { useState } from "react";
import { useAppState } from "./hooks/useAppState";
import { loginRequest } from "./config/authConfig";
import { ErrorBoundary } from "./components/core/ErrorBoundary";
import Header from "./components/Header";
import Home from "./pages/Home";
import AgentConsole from "./pages/AgentConsole";
import BattlecardsRecent from "./pages/BattlecardsRecent";
import BattlecardDetail from "./pages/BattlecardDetail";
import "./App.css";

export type Page = "home" | "agent" | "battlecards" | "detail";

export default function App() {
  useMsalAuthentication(InteractionType.Redirect, loginRequest);

  const { auth } = useAppState();
  const [currentPage, setCurrentPage] = useState<Page>("home");
  const [selectedBattlecardId, setSelectedBattlecardId] = useState<number>(1);

  const handleNavigate = (page: Page, id?: number) => {
    if (page === "detail" && id !== undefined) {
      setSelectedBattlecardId(id);
    }

    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

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
          <Header currentPage={currentPage} onNavigate={handleNavigate} />

          {currentPage === "home" && <Home onNavigate={handleNavigate} />}
          {currentPage === "agent" && <AgentConsole onNavigate={handleNavigate} />}
          {currentPage === "battlecards" && <BattlecardsRecent onNavigate={handleNavigate} />}
          {currentPage === "detail" && (
            <BattlecardDetail
              battlecardId={selectedBattlecardId}
              onNavigate={handleNavigate}
            />
          )}
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