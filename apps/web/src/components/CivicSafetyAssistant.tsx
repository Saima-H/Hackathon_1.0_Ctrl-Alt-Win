"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const suggestions = [
  { label: "Report a pothole near me", reply: "I can take you to the report studio. Add the location and a photo, and your report will enter the civic queue.", href: "/report" },
  { label: "Find the safest route", reply: "I have opened the route planner, where you can compare safer paths around reported hazards.", href: "/safe-route" },
  { label: "Show my ticket status", reply: "Your ticket workspace is ready. You can check each report, its progress, and the latest updates there.", href: "/tickets" },
];

export default function CivicSafetyAssistant() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [response, setResponse] = useState("How may I help you?");
  const [destination, setDestination] = useState<string | null>(null);
  const router = useRouter();

  function chooseSuggestion(item: (typeof suggestions)[number]) {
    setMessage(item.label);
    setResponse(item.reply);
    setDestination(item.href);
  }

  function sendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!message.trim()) return;
    setResponse("I understand. I can help you report an issue, plan a safer route, or find your ticket updates. Choose a route below and I will take you there.");
    setDestination(null);
  }

  return (
    <aside className={`assistant ${open ? "assistant-open" : ""}`} aria-live="polite">
      {open && (
        <div className="assistant-panel">
          <div className="assistant-head">
            <div>
              <span>CivicSafety AI</span>
              <b>How may I help you?</b>
            </div>
            <button aria-label="Close CivicSafety assistant" onClick={() => setOpen(false)} type="button">
              x
            </button>
          </div>
          <div className="assistant-body">
            <div className="assistant-bubble">{response}</div>
            {destination && <button className="assistant-go" onClick={() => router.push(destination)} type="button">Take me there <span>-&gt;</span></button>}
            <div className="assistant-actions">
              {suggestions.map((item) => (
                <button key={item.label} onClick={() => chooseSuggestion(item)} type="button">
                  {item.label}
                </button>
              ))}
            </div>
            <form onSubmit={sendMessage}>
              <input
                aria-label="Ask CivicSafety assistant"
                placeholder="Ask about roads, tickets, routes..."
                value={message}
                onChange={(event) => setMessage(event.target.value)}
              />
              <button type="submit">Send</button>
            </form>
          </div>
        </div>
      )}
      <button
        className="assistant-launcher"
        aria-label="Open CivicSafety assistant"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <span className="assistant-core" />
        <span className="assistant-label">AI help</span>
      </button>
    </aside>
  );
}
