import { createContext, useContext, useEffect, useRef, useState } from "react";
import { stream } from "../lib/api";
import { Icon } from "./ui";
import { tr } from "../lib/i18n";

/** Chat with the Study Sidekick, grounded in one document when docId is given. */
export function ChatPanel({ docId, title, className = "", intro }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scroller = useRef();

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = async (text) => {
    text = (text ?? input).trim();
    if (!text || busy) return;
    const history = [...messages, { role: "user", content: text }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);
    const patchLast = (fn) => setMessages((m) => m.map((x, i) => (i === m.length - 1 ? fn(x) : x)));
    try {
      await stream("/chat", { document_id: docId ?? null, messages: history }, (t) => patchLast((x) => ({ ...x, content: x.content + t })));
    } catch (err) {
      patchLast(() => ({ role: "assistant", content: err.message, error: true }));
    }
    setBusy(false);
  };

  const suggestions = docId ? [tr("Explain this like I'm new to it"), tr("What are the most testable ideas?"), tr("Quiz me on one concept")] : [tr("How should I plan a revision week?"), tr("Explain spaced repetition"), tr("Tips for staying focused")];

  return (
    <div className={`flex min-h-0 flex-col ${className}`}>
      <div ref={scroller} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        <Bubble ai>{intro ?? (title ? tr("Hi! I'm reading \"{title}\" with you. What should I clarify?", { title }) : tr("Hi! Ask me anything about your studies."))}</Bubble>
        {messages.length === 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {suggestions.map((s) => (
              <button key={s} onClick={() => send(s)} className="rounded-full border border-line px-3 py-1.5 text-left text-xs text-mute transition hover:border-brand hover:text-ink">
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <Bubble key={i} ai={m.role === "assistant"} error={m.error} typing={busy && i === messages.length - 1 && m.role === "assistant"}>
            {m.content}
          </Bubble>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="border-t border-line/40 p-3"
      >
        <div className="flex items-center gap-2 rounded-full border border-line bg-bg px-4 focus-within:border-brand">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={tr("Ask a question…")}
            aria-label={tr("Ask the Study Sidekick")}
            className="min-w-0 flex-1 bg-transparent py-2.5 text-sm text-ink outline-none placeholder:text-faint"
          />
          <button disabled={busy || !input.trim()} aria-label={tr("Send")} className="text-primary transition hover:scale-110 disabled:opacity-40">
            <Icon name="send" size={20} />
          </button>
        </div>
      </form>
    </div>
  );
}

function Bubble({ ai, error, typing, children }) {
  return (
    <div className={`pop flex ${ai ? "" : "justify-end"}`}>
      <div
        className={`max-w-[88%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          error ? "border border-coral/40 bg-coral/10 text-coral" : ai ? "bg-brand/20 text-ink" : "bg-high text-ink"
        } ${typing ? "cursor" : ""}`}
      >
        {children || (typing ? <span className="text-faint">{tr("Thinking…")}</span> : null)}
      </div>
    </div>
  );
}

export function SidekickHeader({ onClose }) {
  return (
    <div className="flex items-center gap-3 border-b border-line/40 px-4 py-3">
      <span className="grid h-9 w-9 place-items-center rounded-full bg-primary/25 text-primary"><Icon name="smart_toy" size={20} /></span>
      <span className="flex-1 text-sm font-semibold">{tr("Study Sidekick")}</span>
      <span className="h-2 w-2 rounded-full bg-teal" title={tr("Online")} />
      {onClose && <button onClick={onClose} aria-label={tr("Close Sidekick")} className="rounded-full p-1 text-mute hover:bg-high hover:text-ink"><Icon name="close" size={20} /></button>}
    </div>
  );
}

const SidekickContext = createContext({ open() {}, setDoc() {} });
export const useSidekick = () => useContext(SidekickContext);

/** Global drawer. Pages that have a document call setDoc so answers are grounded in it. */
export function SidekickProvider({ children }) {
  const [open, setOpen] = useState(false);
  const [doc, setDoc] = useState(null);
  return (
    <SidekickContext.Provider value={{ open: () => setOpen(true), setDoc }}>
      {children}
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-label={tr("Study Sidekick")}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <aside className="pop relative flex h-full w-full max-w-md flex-col border-l border-line/50 bg-card shadow-2xl">
            <SidekickHeader onClose={() => setOpen(false)} />
            <ChatPanel key={doc?.id ?? "general"} docId={doc?.id} title={doc?.title} className="flex-1" />
          </aside>
        </div>
      )}
    </SidekickContext.Provider>
  );
}
