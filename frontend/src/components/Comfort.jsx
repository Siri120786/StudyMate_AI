import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { loadA11y, saveA11y } from "../lib/a11y";
import { tr } from "../lib/i18n";
import { SIZE, SKINS, readCatPrefs, saveCatPrefs, sprite } from "../lib/cat";
import { Button, Icon } from "./ui";

const SIZES = [[100, "Normal"], [112, "Large"], [125, "Larger"], [140, "Largest"]];
const REMINDER = "studymate-reminder";

function Toggle({ on, onChange, title, hint }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-line p-4">
      <span>
        <span className="block font-medium">{title}</span>
        <span className="text-sm text-mute">{hint}</span>
      </span>
      <input type="checkbox" role="switch" checked={on} onChange={(e) => onChange(e.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-[#6c5ce7]" />
    </label>
  );
}

function CatSwatch({ skin, on, onPick }) {
  const ref = useRef();
  useEffect(() => {
    const g = ref.current.getContext("2d");
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, SIZE, SIZE);
    g.drawImage(sprite(skin, "sit_wave_a"), 0, 0);
  }, [skin]);
  return (
    <button onClick={onPick} aria-pressed={on} className={`flex flex-col items-center gap-1 rounded-2xl border p-3 transition ${on ? "border-brand bg-brand/20" : "border-line hover:border-brand/50"}`}>
      <canvas ref={ref} width={SIZE} height={SIZE} style={{ width: 80, height: 80, imageRendering: "pixelated" }} />
      <span className="text-sm font-semibold">{tr(skin === "orange" ? "Orange cat" : "Gray cat")}</span>
    </button>
  );
}

/** The study cat: whether it shows, whether it walks around the screen, and its colour. */
export function CatSettings() {
  const [p, setP] = useState(readCatPrefs);
  useEffect(() => {
    const sync = () => setP(readCatPrefs());
    window.addEventListener("studycat-prefs", sync);
    return () => window.removeEventListener("studycat-prefs", sync);
  }, []);
  const set = (patch) => setP(saveCatPrefs(patch));
  return (
    <div className="space-y-4">
      <Toggle on={p.shown} onChange={(v) => set({ shown: v })} title={tr("Show the study cat")} hint={tr("A small pixel cat that keeps you company while you study. It hides itself during quizzes.")} />
      <Toggle on={p.roam} onChange={(v) => set({ roam: v })} title={tr("Let the cat walk around")} hint={tr("It strolls along the bottom of the screen and climbs the sides. Turn this off to keep it in one place.")} />
      <div>
        <p className="label mb-2 text-mute">{tr("Colour")}</p>
        <div className="flex flex-wrap gap-3" role="group" aria-label={tr("Cat colour")}>
          {SKINS.map((skin) => <CatSwatch key={skin} skin={skin} on={p.skin === skin} onPick={() => set({ skin })} />)}
        </div>
      </div>
    </div>
  );
}

/** Settings for text size, an easier-to-read font, looser spacing and fewer animations. */
export function ReadingComfort() {
  const [s, setS] = useState(loadA11y);
  // functional update, so two quick changes in a row cannot overwrite each other
  const set = (patch) => setS((cur) => { const next = { ...cur, ...patch }; saveA11y(next); return next; });
  return (
    <div className="space-y-4">
      <div>
        <p className="label mb-2 text-mute">{tr("Text size")}</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label={tr("Text size")}>
          {SIZES.map(([v, label]) => (
            <button key={v} onClick={() => set({ size: v })} aria-pressed={s.size === v} className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition ${s.size === v ? "border-brand bg-brand/20 text-primary" : "border-line text-mute hover:text-ink"}`}>{tr(label)}</button>
          ))}
        </div>
      </div>
      <Toggle on={s.readable} onChange={(v) => set({ readable: v })} title={tr("Easier-to-read font")} hint={tr("Uses Atkinson Hyperlegible, designed so similar letters look different. Helpful for dyslexia and low vision.")} />
      <Toggle on={s.spacing} onChange={(v) => set({ spacing: v })} title={tr("More space between lines and letters")} hint={tr("Makes long summaries easier to follow.")} />
      <Toggle on={s.calm} onChange={(v) => set({ calm: v })} title={tr("Fewer animations")} hint={tr("Turns off movement, including the study cat's animations.")} />
    </div>
  );
}

/** A daily nudge. It runs while StudyMate is open in a tab or installed as an app, not when everything is closed. */
export function ReminderSetting() {
  const supported = typeof Notification !== "undefined";
  const [cfg, setCfg] = useState(() => { try { return JSON.parse(localStorage.getItem(REMINDER)) || { on: false, time: "18:00" }; } catch { return { on: false, time: "18:00" }; } });
  const [denied, setDenied] = useState(supported && Notification.permission === "denied");
  useEffect(() => { try { localStorage.setItem(REMINDER, JSON.stringify(cfg)); } catch {} }, [cfg]);

  const toggle = async (on) => {
    if (on && Notification.permission !== "granted") {
      const p = await Notification.requestPermission();
      if (p !== "granted") { setDenied(true); return; }
    }
    setDenied(false);
    setCfg((c) => ({ ...c, on }));
  };

  if (!supported) return <p className="text-mute">{tr("This browser does not support notifications.")}</p>;
  return (
    <div className="space-y-4">
      <Toggle on={cfg.on} onChange={toggle} title={tr("Daily study reminder")} hint={tr("A notification at your chosen time if you have not studied yet. It works while StudyMate is open in a tab or installed as an app.")} />
      {cfg.on && (
        <label className="flex items-center gap-3 text-sm">
          <span className="text-mute">{tr("Remind me at")}</span>
          <input type="time" value={cfg.time} onChange={(e) => setCfg((c) => ({ ...c, time: e.target.value }))} className="rounded-xl border border-line bg-low px-3 py-2 outline-none focus:border-brand" />
          <Button size="sm" variant="ghost" icon="notifications" onClick={() => new Notification("StudyMate AI", { body: tr("This is how your reminder will look."), icon: "/icon-192.png" })}>{tr("Try it")}</Button>
        </label>
      )}
      {denied && <p className="flex items-center gap-2 text-sm text-coral" role="alert"><Icon name="block" size={18} /> {tr("Notifications are blocked. Allow them for this site in your browser settings.")}</p>}
    </div>
  );
}

/** Checks once a minute whether it is time for the reminder, and sends it at most once a day. */
export function ReminderWatcher() {
  useEffect(() => {
    const tick = async () => {
      let cfg;
      try { cfg = JSON.parse(localStorage.getItem(REMINDER)); } catch { return; }
      if (!cfg?.on || typeof Notification === "undefined" || Notification.permission !== "granted") return;
      const now = new Date();
      const day = now.toISOString().slice(0, 10);
      const [h, m] = cfg.time.split(":").map(Number);
      if (localStorage.getItem(`${REMINDER}-sent`) === day || now.getHours() * 60 + now.getMinutes() < h * 60 + m) return;
      try {
        const d = await api("/dashboard");
        localStorage.setItem(`${REMINDER}-sent`, day);
        if (d.xp_today > 0) return; // already studied today
        const body = d.due_cards ? tr("{n} flashcards are waiting for you.", { n: d.due_cards }) : tr("A few minutes today keeps your streak alive.");
        new Notification(tr("Time to study"), { body, icon: "/icon-192.png", tag: "studymate-reminder" });
      } catch {}
    };
    tick();
    const t = setInterval(tick, 60000);
    return () => clearInterval(t);
  }, []);
  return null;
}
