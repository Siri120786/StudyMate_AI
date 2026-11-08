import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button, EmptyState, Field, Icon, ProgressBar, Skeleton, inputClass, useToast } from "./ui";
import { L, tr, trx } from "../lib/i18n";
import { exportAnki, exportCsv } from "../lib/exporters";
import { pet } from "../lib/events";

const RATINGS = [
  { id: "again", label: L("Again"), tone: "border-coral/50 text-coral hover:bg-coral/10", key: "1" },
  { id: "hard", label: L("Hard"), tone: "border-amber/50 text-amber hover:bg-amber/10", key: "2" },
  { id: "good", label: L("Good"), tone: "border-line text-ink hover:bg-high", key: "3" },
  { id: "easy", label: L("Easy"), tone: "border-teal/60 text-cyan hover:bg-teal/10", key: "4" },
];

const gap = (days) => (days === 0 ? tr("10 min") : tr("{n}d", { n: days }));

function CardForm({ initial, onSave, onCancel, busy }) {
  const [front, setFront] = useState(initial?.front ?? "");
  const [back, setBack] = useState(initial?.back ?? "");
  const [topic, setTopic] = useState(initial?.topic ?? "");
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSave({ front, back, topic }); }}
      className="space-y-3 rounded-2xl border border-line/50 bg-low p-4"
    >
      <Field label={tr("Front")}><textarea className={`${inputClass} min-h-16`} value={front} onChange={(e) => setFront(e.target.value)} maxLength={400} required autoFocus /></Field>
      <Field label={tr("Back")}><textarea className={`${inputClass} min-h-20`} value={back} onChange={(e) => setBack(e.target.value)} maxLength={800} required /></Field>
      <Field label={tr("Topic")} hint={tr("Optional")}><input className={inputClass} value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={60} /></Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="plain" size="sm" onClick={onCancel}>{tr("Cancel")}</Button>
        <Button type="submit" size="sm" disabled={busy || !front.trim() || !back.trim()}>{tr("Save card")}</Button>
      </div>
    </form>
  );
}

function ExportMenu({ title, docId, cards }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();
  useEffect(() => {
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const item = "flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-high";
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex items-center gap-1 text-mute hover:text-ink">
        <Icon name="download" size={18} /> {tr("Export")}
      </button>
      {open && (
        <div className="pop absolute right-0 top-8 z-30 w-56 overflow-hidden rounded-2xl border border-line/50 bg-card py-1 shadow-2xl">
          <button className={item} onClick={() => { exportAnki(title, cards); setOpen(false); }}><Icon name="style" size={18} /> {tr("Anki (.txt)")}</button>
          <button className={item} onClick={() => { exportCsv(title, cards); setOpen(false); }}><Icon name="table_view" size={18} /> {tr("Spreadsheet (.csv)")}</button>
          <Link className={item} to={`/doc/${docId}/print?what=cards`} target="_blank"><Icon name="print" size={18} /> {tr("Print or save as PDF")}</Link>
        </div>
      )}
    </div>
  );
}

export default function Flashcards({ docId, title = "", onChange }) {
  const toast = useToast();
  const { refreshStats } = useAuth();
  const [deck, setDeck] = useState(null);
  const [queue, setQueue] = useState([]);
  const [done, setDone] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [manage, setManage] = useState(false);
  const [editing, setEditing] = useState(null); // card id, "new" or null

  const load = useCallback(
    (data) => {
      setDeck(data);
      const now = new Date().toISOString();
      setQueue(data.cards.filter((c) => c.due_at <= now));
      setDone(0);
      setFlipped(false);
      onChange?.(data.cards.length);
    },
    [onChange]
  );

  useEffect(() => {
    api(`/documents/${docId}/flashcards`).then(load).catch((e) => setError(e.message));
  }, [docId, load]);

  const reload = () => api(`/documents/${docId}/flashcards`).then(load).catch((e) => setError(e.message));

  const generate = async (replace = false) => {
    setBusy(true);
    setError("");
    try {
      load(await api(`/documents/${docId}/flashcards`, { method: "POST", json: { count: 12, replace } }));
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  };

  const rate = useCallback(
    async (rating) => {
      const card = queue[0];
      if (!card) return;
      setFlipped(false);
      const days = card.next[rating];
      if (rating === "again") setQueue((q) => [...q.slice(1), card]); // a missed card comes back this session
      else {
        setQueue((q) => q.slice(1));
        setDone((d) => d + 1);
      }
      setDeck((d) => ({ ...d, cards: d.cards.map((c) => (c.id === card.id ? { ...c, interval_days: days } : c)) }));
      try {
        const r = await api(`/flashcards/${card.id}/review`, { method: "POST", json: { rating } });
        toast(rating === "again" ? tr("No problem. It comes back in a few minutes.") : tr(r.interval_days > 1 ? "+{xp} XP. See it again in {n} days." : "+{xp} XP. See it again in {n} day.", { xp: r.xp, n: r.interval_days }));
        refreshStats();
      } catch (e) {
        toast(e.message, "error");
      }
    },
    [queue, toast, refreshStats]
  );

  useEffect(() => {
    const onKey = (e) => {
      if (["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName) || !queue.length || manage) return;
      if (e.code === "Space") {
        e.preventDefault();
        setFlipped((f) => !f);
      }
      const r = flipped && RATINGS.find((x) => x.key === e.key);
      if (r) rate(r.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [queue, flipped, rate, manage]);

  useEffect(() => {
    if (done > 0 && queue.length === 0) pet("cheer");
  }, [done, queue.length]);

  const save = async (values) => {
    setBusy(true);
    try {
      if (editing === "new") await api(`/documents/${docId}/flashcards/manual`, { method: "POST", json: values });
      else await api(`/flashcards/${editing}`, { method: "PATCH", json: values });
      setEditing(null);
      await reload();
      toast(tr("Card saved"));
    } catch (e) {
      toast(e.message, "error");
    }
    setBusy(false);
  };

  const remove = async (c) => {
    if (!confirm(tr("Delete this card?"))) return;
    try {
      await api(`/flashcards/${c.id}`, { method: "DELETE" });
      await reload();
    } catch (e) {
      toast(e.message, "error");
    }
  };

  if (error && !deck) return <p className="text-coral" role="alert">{error}</p>;
  if (!deck) return <Skeleton className="h-72" />;

  if (deck.cards.length === 0 && editing !== "new")
    return (
      <>
        <EmptyState
          icon="style"
          title={tr("No flashcards yet")}
          body={tr("Generate a deck of term and concept cards from these notes, then review them on a spaced schedule.")}
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <Button icon="auto_awesome" onClick={() => generate()} disabled={busy}>{busy ? tr("Writing cards…") : tr("Generate flashcards")}</Button>
              <Button variant="ghost" icon="add" onClick={() => setEditing("new")}>{tr("Add a card myself")}</Button>
            </div>
          }
        />
        {error && <p className="mt-3 text-center text-sm text-coral" role="alert">{error}</p>}
      </>
    );

  const mastered = deck.cards.filter((c) => c.interval_days >= 7).length;
  const total = done + queue.length;
  const card = queue[0];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <div className="flex gap-5 text-mute">
          <span>{trx("{n} cards", { n: <b className="text-ink">{deck.cards.length}</b> })}</span>
          <span>{trx("{n} mastered", { n: <b className="text-cyan">{mastered}</b> })}</span>
          <span>{trx("{n} due", { n: <b className="text-amber">{queue.length}</b> })}</span>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => { setManage((m) => !m); setEditing(null); }} aria-pressed={manage} className={`flex items-center gap-1 hover:text-ink ${manage ? "text-primary" : "text-mute"}`}>
            <Icon name="edit_note" size={18} /> {manage ? tr("Back to review") : tr("Manage cards")}
          </button>
          <ExportMenu title={title} docId={docId} cards={deck.cards} />
          <button onClick={() => generate(true)} disabled={busy} className="text-mute hover:text-ink">{busy ? tr("Rewriting…") : tr("Regenerate deck")}</button>
        </div>
      </div>

      {manage || editing === "new" ? (
        <div className="space-y-3">
          {editing === "new" ? (
            <CardForm onSave={save} onCancel={() => setEditing(null)} busy={busy} />
          ) : (
            <Button icon="add" size="sm" onClick={() => setEditing("new")}>{tr("Add card")}</Button>
          )}
          <ul className="space-y-2">
            {deck.cards.map((c) =>
              editing === c.id ? (
                <li key={c.id}><CardForm initial={c} onSave={save} onCancel={() => setEditing(null)} busy={busy} /></li>
              ) : (
                <li key={c.id} className="flex items-start gap-3 rounded-xl border border-line/40 bg-low p-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{c.front}</p>
                    <p className="mt-1 text-sm text-mute">{c.back}</p>
                    <p className="mt-2 text-xs text-faint">{c.topic} &middot; {tr("next review {when}", { when: new Date(c.due_at) <= new Date() ? tr("now") : new Date(c.due_at).toLocaleDateString() })}</p>
                  </div>
                  <button onClick={() => setEditing(c.id)} aria-label={tr("Edit card")} className="grid h-9 w-9 place-items-center rounded-full text-faint hover:bg-high hover:text-ink"><Icon name="edit" size={18} /></button>
                  <button onClick={() => remove(c)} aria-label={tr("Delete card")} className="grid h-9 w-9 place-items-center rounded-full text-faint hover:bg-coral/10 hover:text-coral"><Icon name="delete" size={18} /></button>
                </li>
              )
            )}
          </ul>
        </div>
      ) : card ? (
        <>
          <ProgressBar value={total ? (100 * done) / total : 0} tone="primary" />
          <button
            onClick={() => setFlipped((f) => !f)}
            aria-label={flipped ? tr("Show question") : tr("Show answer")}
            className="block h-72 w-full [perspective:1200px] text-left sm:h-80"
          >
            <div className="flip relative h-full w-full" style={{ transform: flipped ? "rotateY(180deg)" : "none" }}>
              <div className="flip-face ai-border absolute inset-0 flex flex-col justify-between rounded-3xl p-8">
                <span className="label text-primary">{card.topic || tr("Concept")}</span>
                <p className="font-display text-2xl font-semibold leading-snug sm:text-3xl">{card.front}</p>
                <span className="text-sm text-faint">{tr("Click or press Space to reveal")}</span>
              </div>
              <div className="flip-face absolute inset-0 flex flex-col justify-between rounded-3xl border border-teal/40 bg-card p-8" style={{ transform: "rotateY(180deg)" }}>
                <span className="label text-cyan">{tr("Answer")}</span>
                <p className="text-lg leading-relaxed sm:text-xl">{card.back}</p>
                <span className="text-sm text-faint">{tr("How well did you know it?")}</span>
              </div>
            </div>
          </button>
          <div className={`grid grid-cols-2 gap-3 transition sm:grid-cols-4 ${flipped ? "opacity-100" : "pointer-events-none opacity-30"}`}>
            {RATINGS.map((r) => (
              <button key={r.id} onClick={() => rate(r.id)} disabled={!flipped} className={`rounded-xl border px-4 py-3 font-semibold transition active:scale-[0.97] ${r.tone}`}>
                {tr(r.label)}
                <span className="block text-xs font-medium opacity-70">{gap(card.next[r.id])}</span>
              </button>
            ))}
          </div>
          <p className="text-center text-xs text-faint">{tr("Shortcuts: Space flips, 1 to 4 rate the card.")}</p>
        </>
      ) : (
        <div className="pop rounded-3xl border border-teal/30 bg-teal/5 p-10 text-center">
          <Icon name="task_alt" size={44} className="text-cyan" />
          <h3 className="mt-3 text-2xl font-semibold">{done ? tr(done > 1 ? "Nice, {n} cards reviewed" : "Nice, {n} card reviewed", { n: done }) : tr("All caught up")}</h3>
          <p className="mx-auto mt-2 max-w-sm text-mute">{tr("Nothing else is due right now. Cards come back sooner when you find them hard and later when they feel easy.")}</p>
          <Button variant="ghost" className="mt-6" onClick={() => { setQueue(deck.cards); setDone(0); }}>{tr("Practice the whole deck anyway")}</Button>
        </div>
      )}
    </div>
  );
}
