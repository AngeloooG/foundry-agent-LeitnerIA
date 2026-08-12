import React from "react";
import ReactDOM from "react-dom/client";

import {
  EventType,
  PublicClientApplication,
  type AuthenticationResult,
} from "@azure/msal-browser";

import { MsalProvider } from "@azure/msal-react";
import { BrowserRouter } from "react-router";

import App from "./App";
import { ThemeProvider } from "./components/ThemeProvider";
import { msalConfig } from "./config/authConfig";
import { AppProvider } from "./contexts/AppContext";
import { initTelemetry } from "./services/telemetry";

import "./index.css";

initTelemetry();

const msalInstance = new PublicClientApplication(
  msalConfig
);

msalInstance.initialize().then(() => {
  const accounts = msalInstance.getAllAccounts();

  if (accounts.length > 0) {
    msalInstance.setActiveAccount(accounts[0]);
  }

  msalInstance.addEventCallback((event) => {
    if (
      event.eventType === EventType.LOGIN_SUCCESS &&
      event.payload
    ) {
      const authenticationResult =
        event.payload as AuthenticationResult;

      msalInstance.setActiveAccount(
        authenticationResult.account
      );
    }
  });

  const rootElement =
    document.getElementById("root");

  if (!rootElement) {
    console.error(
      "Failed to find the root element"
    );

    return;
  }

  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <MsalProvider instance={msalInstance}>
        <AppProvider>
          <ThemeProvider>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </ThemeProvider>
        </AppProvider>
      </MsalProvider>
    </React.StrictMode>
  );
});