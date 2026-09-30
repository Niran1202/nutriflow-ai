"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";

export type ChatItem = {
  id: string;
  role: "patient" | "assistant" | "dietitian";
  content: string;
  trace?: { agent: string; summary: string }[];
  usedLLM?: boolean;
};

const SUGGESTIONS = [
  "What should I do about my protein today?",
  "I haven't been able to follow my plan this week.",
  "How much water do I have left?",
];

export function Chat({ initial }: { initial: ChatItem[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest" });
  }, [items, busy]);

  async function send(message: string) {
    if (!message.trim() || busy) return;
    setBusy(true);
    setText("");
    setItems((xs) => [...xs, { id: `tmp-${Date.now()}`, role: "patient", content: message }]);
    try {
      const r = await api<{ id: string; reply: string; trace: ChatItem["trace"]; usedLLM: boolean; flagged: boolean }>("/api/chat", "POST", { message });
      setItems((xs) => [...xs, { id: r.id, role: "assistant", content: r.reply, trace: r.trace, usedLLM: r.usedLLM }]);
      if (r.flagged) router.refresh();
    } catch (err) {
      setItems((xs) => [...xs, { id: `err-${Date.now()}`, role: "assistant", content: `⚠ ${(err as Error).message}` }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 flex flex-col">
      <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1" aria-live="polite">
        {items.length === 0 && <p className="text-sm text-muted">Ask about your protein, calories, water, meal ideas, or how your week is going.</p>}
        {items.map((m) => (
          <div key={m.id} className={m.role === "patient" ? "flex justify-end" : ""}>
            <div
              className={`max-w-[90%] rounded-xl px-3 py-2 text-sm ${
                m.role === "patient"
                  ? "bg-brand text-white"
                  : m.role === "dietitian"
                    ? "border border-warn/30 bg-warn-soft"
                    : "bg-canvas"
              }`}
            >
              {m.role === "dietitian" && <div className="eyebrow mb-1 text-warn">From your dietitian</div>}
              <p className="whitespace-pre-wrap">{m.content}</p>
              {m.trace && m.trace.length > 0 && (
                <details className="mt-2 text-xs text-muted">
                  <summary className="cursor-pointer select-none">How this answer was made{m.usedLLM === false ? " · template mode" : ""}</summary>
                  <ol className="mt-1 space-y-0.5">
                    {m.trace.map((s, i) => (
                      <li key={i}><span className="font-medium text-ink">{s.agent}:</span> {s.summary}</li>
                    ))}
                  </ol>
                </details>
              )}
            </div>
          </div>
        ))}
        {busy && <div className="w-fit rounded-xl bg-canvas px-3 py-2 text-sm text-muted">Agents are thinking…</div>}
        <div ref={bottom} />
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {SUGGESTIONS.map((s) => (
          <button key={s} className="rounded-full border border-line px-2.5 py-1 text-xs text-muted hover:border-brand hover:text-ink" disabled={busy} onClick={() => send(s)}>
            {s}
          </button>
        ))}
      </div>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <input aria-label="Ask the AI assistant" className="input" placeholder="Ask AI…" value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} />
        <button className="btn-primary shrink-0" disabled={busy || !text.trim()}>Ask</button>
      </form>
      <p className="mt-2 text-[11px] text-muted">General guidance within your dietitian&apos;s plan — not medical advice.</p>
    </div>
  );
}
