import "./AgentConsole.css";

import { BattlecardForm } from "./components/BattlecardForm";
import { ChatPanel } from "./components/ChatPanel";
import { AGENT_BADGES } from "./model/consoleContent";

/**
 * "/agente" — Battlecard console: guided form (left) and chat with the agent (right).
 * State and streaming live in AgentConsoleProvider (mounted above the routes).
 */
export default function AgentConsolePage() {
    return (
        <main className="app-shell agent-page">
            <section className="agent-top">
                <div className="container agent-top-inner">
                    <div>
                        <h1>Probar Leitner IA</h1>
                        <p>
                            Genera Battlecards competitivas mediante chat libre o formulario guiado · Impulsado por Azure AI Foundry
                        </p>
                    </div>

                    <div className="agent-badges">
                        {AGENT_BADGES.map((item) => (
                            <span key={item}>{item}</span>
                        ))}
                    </div>
                </div>
            </section>

            <section className="container agent-layout">
                <BattlecardForm />
                <ChatPanel />
            </section>
        </main>
    );
}
