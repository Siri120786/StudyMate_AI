import { useEffect, useRef, useState } from "react";
import { getLang, tr } from "../lib/i18n";
import { stripMarkdown } from "../lib/util";
import { Icon } from "./ui";

const SPEECH_LANG = { en: "en-US", hi: "hi-IN", te: "te-IN", ta: "ta-IN", kn: "kn-IN", ml: "ml-IN" };

/** Splits text into short sentences, because some browsers stop a long utterance after about 15 seconds. */
function chunks(text) {
  const out = [];
  for (const sentence of text.replace(/\s+/g, " ").match(/[^.!?।]+[.!?।]?/g) || []) {
    let s = sentence.trim();
    while (s.length > 220) {
      const cut = s.lastIndexOf(" ", 200);
      out.push(s.slice(0, cut > 0 ? cut : 200));
      s = s.slice(cut > 0 ? cut : 200).trim();
    }
    if (s) out.push(s);
  }
  return out;
}

/** Reads the summary aloud with the browser's own voice. Separate from the two-host audio overview. */
export default function ReadAloud({ text }) {
  const synth = typeof window !== "undefined" ? window.speechSynthesis : null;
  const [state, setState] = useState("idle"); // idle | playing | paused
  const [rate, setRate] = useState(1);
  const [hasVoice, setHasVoice] = useState(true);
  const queue = useRef([]);
  const token = useRef(0);
  const lang = SPEECH_LANG[getLang()] || "en-US";

  useEffect(() => {
    if (!synth) return;
    const check = () => setHasVoice(synth.getVoices().length === 0 || synth.getVoices().some((v) => v.lang.toLowerCase().startsWith(lang.slice(0, 2))));
    check();
    synth.addEventListener?.("voiceschanged", check);
    return () => synth.removeEventListener?.("voiceschanged", check);
  }, [synth, lang]);

  const stop = () => {
    token.current += 1;
    queue.current = [];
    synth?.cancel();
    setState("idle");
  };
  useEffect(() => stop, [text]); // eslint-disable-line react-hooks/exhaustive-deps

  const speakNext = (mine) => {
    if (mine !== token.current) return;
    const next = queue.current.shift();
    if (!next) return setState("idle");
    const u = new SpeechSynthesisUtterance(next);
    u.lang = lang;
    u.rate = rate;
    const voice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith(lang.slice(0, 2)));
    if (voice) u.voice = voice;
    u.onend = () => speakNext(mine);
    u.onerror = () => speakNext(mine);
    synth.speak(u);
  };

  const play = () => {
    if (state === "paused") {
      synth.resume();
      return setState("playing");
    }
    stop();
    const mine = token.current;
    queue.current = chunks(stripMarkdown(text));
    setState("playing");
    speakNext(mine);
  };

  if (!synth) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line/40 bg-low px-4 py-3 text-sm">
      <button onClick={state === "playing" ? () => { synth.pause(); setState("paused"); } : play} aria-label={state === "playing" ? tr("Pause reading") : tr("Read this aloud")} className="flex items-center gap-2 font-semibold text-primary hover:underline">
        <Icon name={state === "playing" ? "pause_circle" : "volume_up"} size={20} /> {state === "playing" ? tr("Pause") : state === "paused" ? tr("Resume") : tr("Read aloud")}
      </button>
      {state !== "idle" && <button onClick={stop} className="flex items-center gap-1 text-mute hover:text-ink"><Icon name="stop" size={18} /> {tr("Stop")}</button>}
      <label className="ml-auto flex items-center gap-2 text-mute">
        <span className="sr-only">{tr("Reading speed")}</span>
        <select value={rate} onChange={(e) => setRate(Number(e.target.value))} className="rounded-lg border border-line bg-bg px-2 py-1">
          {[0.8, 1, 1.2, 1.5].map((r) => <option key={r} value={r}>{r}x</option>)}
        </select>
      </label>
      {!hasVoice && <p className="w-full text-xs text-faint">{tr("This device has no voice for this language, so the default voice will read it.")}</p>}
    </div>
  );
}
