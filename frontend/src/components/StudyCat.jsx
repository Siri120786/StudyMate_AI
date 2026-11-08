import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Icon } from "./ui";
import { SIZE, readCatPrefs, saveCatPrefs, sprite } from "../lib/cat";
import { GROUND, WATCH_RANGE, createCat, enter as brainEnter, stepCat } from "../lib/catBrain";
import { L, tr } from "../lib/i18n";

const TIPS = [
  L("Meow! Quiz yourself, don't just reread."),
  L("Purr... 25 minutes of focus, then a short break."),
  L("Teach it to me out loud. I'm a great listener."),
  L("Try the flashcards while the summary is fresh."),
  L("Weak topic? Read it, then quiz it again."),
  L("Sleep is a study technique. I'm an expert."),
];
const HELLO = "studymate-cat-hello";
const PET_TO_SCRATCH_MS = 2200; // keep moving the cursor over the cat this long and it starts scratching
const CAT_SIZE_PX = (vw) => (vw < 640 ? 96 : 128);

/**
 * The study cat. It walks along the bottom of the screen, and at each edge it climbs up the side, peeks over,
 * drops back down and walks the other way. It stops to wave when the cursor comes near, purrs when petted,
 * scratches if petted too long, gives a study tip when clicked, and naps when nothing has moved for a while.
 * All movement lives in refs and is applied straight to the DOM, so React does not re-render 60 times a second.
 */
export default function StudyCat() {
  const { pathname } = useLocation();
  const [prefs, setPrefs] = useState(readCatPrefs);
  const [bubble, setBubble] = useState("");
  const wrapRef = useRef();
  const canvasRef = useRef();
  const bubbleRef = useRef();
  const prefsRef = useRef(prefs);
  const timers = useRef({});
  const pet = useRef({ start: 0, last: 0 });
  const cursor = useRef({ x: -999, y: -999, at: 0 });
  const sim = useRef(null);
  if (!sim.current) sim.current = createCat(performance.now());

  prefsRef.current = prefs;
  const hiddenHere = pathname === "/" || pathname.startsWith("/quiz/"); // not over the landing video, and no distractions mid-quiz
  const active = prefs.shown && !hiddenHere;

  useEffect(() => {
    const sync = () => setPrefs(readCatPrefs());
    window.addEventListener("studycat-prefs", sync);
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener("studycat-prefs", sync); window.removeEventListener("storage", sync); };
  }, []);

  const say = useCallback((text, ms = 2800) => {
    setBubble(text);
    clearTimeout(timers.current.bubble);
    timers.current.bubble = setTimeout(() => setBubble(""), ms);
  }, []);

  const enter = useCallback((mode, extra = {}) => brainEnter(sim.current, mode, performance.now(), extra), []);
  const hop = () => { sim.current.hopAt = performance.now(); };

  // The rest of the app tells the cat when something happened: "cheer", "comfort", "focus", "rest" or "badge".
  useEffect(() => {
    const onEvent = (e) => {
      const { kind, message } = e.detail || {};
      const s = sim.current;
      const celebrate = (text) => { hop(); if (GROUND.has(s.mode)) enter("happy", { until: performance.now() + 2500 }); say(text, 3500); };
      if (kind === "focus") { s.quiet = true; enter("sit", { waving: false, until: Infinity }); say(tr("Focus time. I'll sit quietly and read."), 4000); }
      else if (kind === "rest") s.quiet = false;
      else if (kind === "cheer") celebrate(message || tr("Great job!"));
      else if (kind === "badge") celebrate(tr("A new badge! Look at you."));
      else if (kind === "comfort") say(tr("Tough one. Review it and try again, you've got this."), 4000);
    };
    window.addEventListener("studycat", onEvent);
    return () => window.removeEventListener("studycat", onEvent);
  }, [enter, say]);

  // Where the cursor is, so the cat can watch it, and a nudge to wake up.
  useEffect(() => {
    if (!active) return;
    const onMove = (e) => {
      cursor.current = { x: e.clientX, y: e.clientY, at: Date.now() };
      const s = sim.current;
      if (s.mode === "sleep") { enter("sit", { waving: false, until: performance.now() + 1500 }); say(tr("Mrrp! I was awake the whole time.")); }
    };
    const onTouch = () => { cursor.current.at = Date.now(); };
    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("pointerdown", onTouch, { passive: true });
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("pointerdown", onTouch); };
  }, [active, enter, say]);

  useEffect(() => {
    if (!active) return;
    let seen = false;
    try { seen = sessionStorage.getItem(HELLO) === "1"; sessionStorage.setItem(HELLO, "1"); } catch {}
    if (!seen) timers.current.hello = setTimeout(() => say(tr("Hi! I'll keep you company while you study."), 3800), 1200);
    const t = timers.current;
    return () => Object.values(t).forEach(clearTimeout);
  }, [active, say]);

  // The animation loop.
  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    const s = sim.current;
    const start = performance.now();
    if (!cursor.current.at) cursor.current.at = Date.now(); // 'idle' counts from now, so it does not nap on arrival
    let last = start;
    let raf = 0;
    let lastInteractive = null;

    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (document.hidden) return;

      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const size = CAT_SIZE_PX(vw);
      const calm = document.documentElement.dataset.calm === "1" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (canvas.dataset.size !== String(size)) {
        canvas.style.width = canvas.style.height = `${size}px`;
        canvas.dataset.size = String(size);
      }
      const dist = Math.hypot(cursor.current.x - (s.x + size / 2), cursor.current.y - (s.y + size / 2));
      const name = stepCat(
        s,
        {
          vw, vh, size,
          floor: vh - size - (vw < 768 ? 76 : 6), // above the phone's bottom bar
          maxX: vw - size,
          roaming: prefsRef.current.roam && !calm && !s.quiet,
          cursorNear: dist < WATCH_RANGE && Date.now() - cursor.current.at < 4000,
          cursorX: cursor.current.x,
          idleFor: Date.now() - cursor.current.at,
        },
        now,
        dt
      );

      if (name !== s.frame || prefsRef.current.skin !== s.skin) {
        s.frame = name;
        s.skin = prefsRef.current.skin;
        ctx.clearRect(0, 0, SIZE, SIZE);
        ctx.drawImage(sprite(s.skin, name), 0, 0);
      }
      const hopT = (now - s.hopAt) / 450;
      const lift = hopT >= 0 && hopT < 1 ? Math.sin(Math.PI * hopT) * 22 : 0;
      wrap.style.transform = `translate3d(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px, 0)`;
      canvas.style.transform = `translateY(${-lift}px) scale(${s.dir}, ${s.squash})`;

      const touchable = GROUND.has(s.mode);
      if (touchable !== lastInteractive) {
        lastInteractive = touchable;
        wrap.style.pointerEvents = touchable ? "auto" : "none"; // never blocks a button while it is passing by
      }
      const bubbleEl = bubbleRef.current;
      if (bubbleEl) {
        const right = s.x > vw / 2;
        bubbleEl.style.left = right ? "auto" : "0";
        bubbleEl.style.right = right ? "0" : "auto";
        const below = s.y < 150; // up at the top of the screen, speak downward
        bubbleEl.style.bottom = below ? "auto" : "100%";
        bubbleEl.style.top = below ? "100%" : "auto";
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, enter]);

  const onPet = () => {
    const s = sim.current;
    if (!GROUND.has(s.mode) || s.mode === "scratch" || s.mode === "meow" || s.mode === "sleep") return;
    const now = performance.now();
    if (now - pet.current.last > 400) pet.current.start = now; // a pause starts a fresh petting session
    pet.current.last = now;
    if (now - pet.current.start > PET_TO_SCRATCH_MS) {
      pet.current = { start: 0, last: 0 };
      setBubble("");
      enter("scratch", { until: now + 2800 });
      return;
    }
    if (s.mode === "happy") s.until = now + 900;
    else enter("happy", { until: now + 900 });
  };

  const onClick = () => {
    const s = sim.current;
    if (!GROUND.has(s.mode) || s.mode === "scratch") return;
    hop();
    enter("meow", { until: performance.now() + 2600 });
    say(tr(TIPS[Math.floor(Math.random() * TIPS.length)]));
  };

  if (hiddenHere) return null;
  if (!prefs.shown) {
    return (
      <button onClick={() => saveCatPrefs({ shown: true })} aria-label={tr("Bring back the study cat")} title={tr("Bring back the study cat")} className="fixed bottom-20 left-3 z-20 grid h-10 w-10 place-items-center rounded-full bg-high text-mute shadow-lg transition hover:text-ink md:bottom-4 md:left-4">
        <Icon name="pets" size={20} />
      </button>
    );
  }

  return (
    <div ref={wrapRef} className="studycat group fixed left-0 top-0 z-20 select-none" style={{ pointerEvents: "none", willChange: "transform" }}>
      {bubble && (
        <div ref={bubbleRef} role="status" className="pop absolute mb-1 mt-1 w-max max-w-[210px] rounded-2xl border border-line/50 bg-card px-3 py-2 text-xs font-medium text-ink shadow-xl">
          {bubble}
        </div>
      )}
      <button
        onClick={() => saveCatPrefs({ shown: false })}
        aria-label={tr("Hide the study cat")}
        title={tr("Hide the study cat")}
        className="absolute -right-1 -top-1 z-10 hidden h-6 w-6 place-items-center rounded-full bg-high text-faint opacity-0 transition hover:text-ink group-hover:grid group-hover:opacity-100 focus-visible:grid focus-visible:opacity-100"
      >
        <Icon name="close" size={14} />
      </button>
      <canvas
        ref={canvasRef}
        width={SIZE}
        height={SIZE}
        onPointerMove={onPet}
        onClick={onClick}
        role="img"
        aria-label={tr("A pixel-art cat. Move the cursor near it and it waves. Pet it, or click it for a study tip.")}
        style={{ imageRendering: "pixelated", cursor: "pointer", transformOrigin: "50% 100%", touchAction: "manipulation", display: "block" }}
      />
    </div>
  );
}
