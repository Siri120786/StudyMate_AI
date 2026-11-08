import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { pet } from "../lib/events";
import { Button, Card, Icon, Ring, useToast } from "../components/ui";
import { tr } from "../lib/i18n";

const STORE = "studymate-focus";
const FOCUS_CHOICES = [15, 25, 45];
const BREAK_CHOICES = [5, 10];
const clock = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

function read() {
  try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; }
}

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.25].forEach((t) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.2);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.22);
    });
  } catch {}
}

/**
 * Pomodoro timer. The end time is stored, not a counter, so it stays right through
 * tab throttling and page reloads. A finished focus block earns one XP per minute.
 */
export default function Focus() {
  const toast = useToast();
  const { refreshStats } = useAuth();
  const saved = read();
  const [focusMin, setFocusMin] = useState(saved.focusMin || 25);
  const [breakMin, setBreakMin] = useState(saved.breakMin || 5);
  const [phase, setPhase] = useState(saved.phase || "focus"); // focus | break
  const [endsAt, setEndsAt] = useState(saved.endsAt || 0); // 0 = not running
  const [left, setLeft] = useState(saved.left ?? (saved.focusMin || 25) * 60000); // ms left while paused
  const [now, setNow] = useState(Date.now());
  const [docs, setDocs] = useState([]);
  const [docId, setDocId] = useState(saved.docId || "");
  const [today, setToday] = useState(0);
  const finishing = useRef(false);

  const running = endsAt > 0;
  const remaining = running ? endsAt - now : left;
  const total = (phase === "focus" ? focusMin : breakMin) * 60000;

  useEffect(() => { api("/documents").then(setDocs).catch(() => {}); }, []);
  useEffect(() => {
    try { localStorage.setItem(STORE, JSON.stringify({ focusMin, breakMin, phase, endsAt, left, docId })); } catch {}
  }, [focusMin, breakMin, phase, endsAt, left, docId]);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [running]);

  useEffect(() => {
    document.title = running ? `${clock(remaining)} · StudyMate AI` : "StudyMate AI";
    return () => { document.title = "StudyMate AI"; };
  }, [running, remaining]);

  const start = () => {
    setNow(Date.now());
    setEndsAt(Date.now() + remaining);
    if (phase === "focus") pet("focus");
  };
  const pause = () => { setLeft(Math.max(0, endsAt - Date.now())); setEndsAt(0); };
  const reset = (p = phase, f = focusMin, b = breakMin) => {
    setEndsAt(0);
    setPhase(p);
    setLeft((p === "focus" ? f : b) * 60000);
    pet("rest");
  };

  const finish = useCallback(async () => {
    if (finishing.current) return;
    finishing.current = true;
    beep();
    setEndsAt(0);
    if (phase === "focus") {
      try {
        const r = await api("/focus", { method: "POST", json: { minutes: focusMin, document_id: docId || null } });
        toast(tr("Focus block done. +{xp} XP", { xp: r.xp }));
        setToday((n) => n + 1);
        refreshStats();
      } catch (e) {
        toast(e.message, "error");
      }
      pet("cheer", tr("Nice focus! Take a short break."));
      setPhase("break");
      setLeft(breakMin * 60000);
    } else {
      pet("rest");
      toast(tr("Break over. Ready for another round?"));
      setPhase("focus");
      setLeft(focusMin * 60000);
    }
    finishing.current = false;
  }, [phase, focusMin, breakMin, docId, toast, refreshStats]);

  useEffect(() => {
    if (running && remaining <= 0) finish();
  }, [running, remaining, finish]);

  const pick = (kind, v) => {
    if (running) return;
    if (kind === "focus") { setFocusMin(v); if (phase === "focus") setLeft(v * 60000); }
    else { setBreakMin(v); if (phase === "break") setLeft(v * 60000); }
  };
  const chip = (on) => `rounded-full border px-4 py-1.5 text-sm font-semibold transition ${on ? "border-brand bg-brand/20 text-primary" : "border-line text-mute hover:text-ink"} ${running ? "opacity-50" : ""}`;

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <header className="text-center">
        <p className="label text-primary">{tr("Focus timer")}</p>
        <h1 className="mt-1 text-4xl font-bold">{phase === "focus" ? tr("Time to focus") : tr("Take a break")}</h1>
        <p className="mt-2 text-mute">{phase === "focus" ? tr("One task, no distractions. You earn 1 XP for every minute you finish.") : tr("Stand up, stretch, drink some water.")}</p>
      </header>

      <Card className="ai-border flex flex-col items-center gap-8 p-8 sm:p-10">
        <Ring value={total ? (100 * (total - remaining)) / total : 0} size={240} stroke={12} color={phase === "focus" ? "var(--brand)" : "var(--cyan)"}>
          <div>
            <p className="font-display text-6xl font-bold tabular-nums" aria-live="off">{clock(remaining)}</p>
            <p className="label mt-1 text-mute">{phase === "focus" ? tr("Focus") : tr("Break")}</p>
          </div>
        </Ring>
        <div className="flex flex-wrap justify-center gap-3">
          {running ? (
            <Button size="lg" variant="ghost" icon="pause" onClick={pause}>{tr("Pause")}</Button>
          ) : (
            <Button size="lg" icon="play_arrow" onClick={start}>{remaining < total ? tr("Resume") : tr("Start")}</Button>
          )}
          <Button size="lg" variant="plain" icon="restart_alt" onClick={() => reset()}>{tr("Reset")}</Button>
          {phase === "break" && <Button size="lg" variant="plain" icon="skip_next" onClick={() => reset("focus")}>{tr("Skip break")}</Button>}
        </div>
      </Card>

      <Card className="space-y-5 p-6">
        <div>
          <p className="label mb-2 text-mute">{tr("Focus length")}</p>
          <div className="flex flex-wrap gap-2">{FOCUS_CHOICES.map((m) => <button key={m} disabled={running} onClick={() => pick("focus", m)} aria-pressed={focusMin === m} className={chip(focusMin === m)}>{tr("{n} min", { n: m })}</button>)}</div>
        </div>
        <div>
          <p className="label mb-2 text-mute">{tr("Break length")}</p>
          <div className="flex flex-wrap gap-2">{BREAK_CHOICES.map((m) => <button key={m} disabled={running} onClick={() => pick("break", m)} aria-pressed={breakMin === m} className={chip(breakMin === m)}>{tr("{n} min", { n: m })}</button>)}</div>
        </div>
        <div>
          <label htmlFor="focus-doc" className="label mb-2 block text-mute">{tr("Studying (optional)")}</label>
          <select id="focus-doc" value={docId} onChange={(e) => setDocId(e.target.value)} disabled={running} className="w-full rounded-xl border border-line bg-low px-4 py-3 outline-none focus:border-brand">
            <option value="">{tr("Nothing in particular")}</option>
            {docs.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
          </select>
        </div>
        {today > 0 && <p className="flex items-center gap-2 text-sm text-cyan"><Icon name="check_circle" fill size={18} /> {tr(today === 1 ? "{n} focus block finished this visit" : "{n} focus blocks finished this visit", { n: today })}</p>}
      </Card>
    </div>
  );
}
