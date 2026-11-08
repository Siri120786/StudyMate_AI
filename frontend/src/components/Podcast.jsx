import { useCallback, useEffect, useRef, useState } from "react";
import { api, blobUrl } from "../lib/api";
import { Button, Icon, Skeleton } from "./ui";
import { tr } from "../lib/i18n";

const SPEEDS = [1, 1.25, 1.5, 0.75];
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** Two-host audio overview for the lesson or one topic. Generated once, then saved. */
export default function Podcast({ docId, topic, level }) {
  const query = `topic=${encodeURIComponent(topic)}&level=${level}`;
  const base = `/documents/${docId}/podcast?${query}`;
  const [info, setInfo] = useState(null); // {status, id, title, script, seconds, error}
  const [error, setError] = useState("");
  const [src, setSrc] = useState("");
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [length, setLength] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [showScript, setShowScript] = useState(false);
  const audioRef = useRef();

  const refresh = useCallback(() => api(base, { fresh: true }).then(setInfo).catch((e) => setError(e.message)), [base]);

  useEffect(() => {
    setInfo(null);
    setError("");
    setSrc("");
    setPlaying(false);
    setTime(0);
    refresh();
  }, [refresh]);

  // Poll while the server is still writing and recording.
  useEffect(() => {
    if (info?.status !== "generating") return;
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [info?.status, refresh]);

  // Fetch the audio once it is ready.
  useEffect(() => {
    if (info?.status !== "ready" || src) return;
    let url = "";
    let dead = false;
    blobUrl(`/podcasts/${info.id}/audio`)
      .then((u) => { url = u; dead ? URL.revokeObjectURL(u) : setSrc(u); })
      .catch((e) => setError(e.message));
    return () => { dead = true; };
  }, [info?.status, info?.id, src]);

  useEffect(() => () => src && URL.revokeObjectURL(src), [src]);
  useEffect(() => { if (audioRef.current) audioRef.current.playbackRate = speed; }, [speed, src]);

  const start = async (regenerate = false) => {
    setError("");
    setSrc("");
    setPlaying(false);
    try {
      setInfo(await api(`${base}${regenerate ? "&regenerate=true" : ""}`, { method: "POST" }));
    } catch (e) {
      setError(e.message);
    }
  };

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    a.paused ? a.play() : a.pause();
  };
  const seek = (v) => { if (audioRef.current) audioRef.current.currentTime = v; setTime(v); };
  const nextSpeed = () => setSpeed((s) => SPEEDS[(SPEEDS.indexOf(s) + 1) % SPEEDS.length]);

  const what = topic ? "this topic" : "the whole lesson";
  const shell = "rounded-2xl border border-line/40 bg-low p-4";

  if (!info && !error) return <Skeleton className="h-20" />;

  if (info?.status === "generating") {
    return (
      <div className={shell} role="status">
        <p className="flex items-center gap-2 text-sm font-semibold"><Icon name="graphic_eq" size={18} className="animate-pulse text-cyan" /> {tr("Recording your audio overview…")}</p>
        <p className="mt-1 text-xs text-faint">Two hosts are writing and recording a conversation about {what}. This takes about a minute. You can keep reading.</p>
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-high"><div className="h-full w-1/3 animate-[slide_1.4s_ease-in-out_infinite] rounded-full bg-brand" /></div>
      </div>
    );
  }

  if (!info || info.status === "none" || info.status === "failed") {
    return (
      <div className={`${shell} flex flex-col gap-3 sm:flex-row sm:items-center`}>
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-high text-cyan"><Icon name="podcasts" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{tr("Audio overview")}</p>
          <p className="text-xs text-faint">A relaxed two-host conversation that walks through {what}, so you can listen instead of read.</p>
          {(error || info?.error) && <p className="mt-1 text-xs text-coral" role="alert">{error || info.error}</p>}
        </div>
        <Button size="sm" icon="play_arrow" onClick={() => start(false)}>{info?.status === "failed" ? tr("Try again") : tr("Generate podcast")}</Button>
      </div>
    );
  }

  return (
    <div className={shell}>
      <audio
        ref={audioRef}
        src={src || undefined}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setLength(e.currentTarget.duration)}
      />
      <div className="flex items-center gap-4">
        <button onClick={toggle} disabled={!src} aria-label={playing ? tr("Pause audio overview") : tr("Play audio overview")} className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-brand text-white transition hover:scale-105 disabled:opacity-50">
          <Icon name={!src ? "hourglass_top" : playing ? "pause" : "play_arrow"} fill />
        </button>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 truncate text-sm font-semibold">
            <Icon name="podcasts" size={16} className="text-cyan" /> <span className="truncate">{info.title || tr("Audio overview")}</span>
          </p>
          <div className="mt-2 flex items-center gap-3">
            <span className="w-10 text-right font-mono text-xs text-mute">{clock(time)}</span>
            <input
              type="range"
              min={0}
              max={length || info.seconds || 1}
              step={0.5}
              value={time}
              onChange={(e) => seek(Number(e.target.value))}
              aria-label={tr("Seek")}
              className="h-1 flex-1 cursor-pointer accent-[#6c5ce7]"
            />
            <span className="w-10 font-mono text-xs text-mute">{clock(length || info.seconds)}</span>
          </div>
        </div>
        <button onClick={nextSpeed} aria-label={tr("Playback speed {speed}x", { speed })} className="rounded-full bg-high px-3 py-1.5 font-mono text-xs font-semibold text-mute hover:text-ink">{speed}x</button>
      </div>
      <div className="mt-3 flex items-center justify-between text-xs">
        <button onClick={() => setShowScript((o) => !o)} aria-expanded={showScript} className="flex items-center gap-1 font-semibold text-primary hover:underline">
          <Icon name="subject" size={16} /> {showScript ? tr("Hide") : tr("Show")} transcript
        </button>
        <button onClick={() => start(true)} className="text-faint hover:text-ink">{tr("Record a new version")}</button>
      </div>
      {error && <p className="mt-2 text-xs text-coral" role="alert">{error}</p>}
      {showScript && (
        <ol className="pop mt-3 max-h-72 space-y-3 overflow-y-auto border-t border-line/30 pt-3 text-sm">
          {info.script.map((t, i) => (
            <li key={i} className="flex gap-3">
              <span className={`label w-10 shrink-0 pt-0.5 ${t.speaker === "Alex" ? "text-cyan" : "text-primary"}`}>{t.speaker}</span>
              <span className="text-mute">{t.text}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
