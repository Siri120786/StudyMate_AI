import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { getLang, tr } from "../lib/i18n";
import { pet } from "../lib/events";
import Markdown from "./Markdown";
import { Button, Card, EmptyState, Icon, Modal, ProgressBar, Ring, Skeleton, inputClass, useToast } from "./ui";

const SPEECH_LANG = { en: "en-US", hi: "hi-IN", te: "te-IN", ta: "ta-IN", kn: "kn-IN", ml: "ml-IN" };

// ---------- Explain it back ----------

/** The student explains a topic in their own words (typed or spoken) and the AI marks it against their notes. */
export function Explain({ docId, topics }) {
  const toast = useToast();
  const { refreshStats } = useAuth();
  const [topic, setTopic] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [listening, setListening] = useState(false);
  const recog = useRef(null);
  const Speech = typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

  useEffect(() => () => recog.current?.stop(), []);

  const toggleMic = () => {
    if (listening) return recog.current?.stop();
    const r = new Speech();
    r.lang = SPEECH_LANG[getLang()] || "en-US";
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      const said = [...e.results].slice(e.resultIndex).map((x) => x[0].transcript).join(" ");
      setText((t) => `${t}${t && !t.endsWith(" ") ? " " : ""}${said.trim()}`);
    };
    r.onerror = () => { setListening(false); toast(tr("The microphone is not available. Check the browser permission."), "error"); };
    r.onend = () => setListening(false);
    recog.current = r;
    r.start();
    setListening(true);
  };

  const submit = async () => {
    recog.current?.stop();
    setBusy(true);
    setError("");
    try {
      const r = await api(`/documents/${docId}/explain`, { method: "POST", json: { topic, explanation: text } });
      setResult(r);
      refreshStats();
      pet(r.score >= 70 ? "cheer" : "comfort");
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  };

  if (result)
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <Card className="ai-border flex flex-col items-center gap-5 p-8 text-center sm:flex-row sm:text-left">
          <Ring value={result.score} size={120} stroke={9} color={result.score >= 70 ? "var(--cyan)" : "var(--amber)"}>
            <p className="font-display text-3xl font-bold">{result.score}</p>
          </Ring>
          <div>
            <h2 className="text-2xl font-semibold">{result.score >= 80 ? tr("You really know this") : result.score >= 50 ? tr("Good start") : tr("Not there yet")}</h2>
            <p className="mt-1 text-mute">{result.tip}</p>
            {result.xp > 0 && <p className="mt-2 text-sm font-semibold text-amber">+{result.xp} XP</p>}
          </div>
        </Card>
        {result.strengths.length > 0 && (
          <section>
            <h3 className="label mb-2 text-cyan">{tr("What you got right")}</h3>
            <ul className="space-y-2">{result.strengths.map((s, i) => <li key={i} className="flex gap-3 rounded-xl bg-teal/10 px-4 py-3"><Icon name="check_circle" fill size={20} className="shrink-0 text-cyan" />{s}</li>)}</ul>
          </section>
        )}
        {result.gaps.length > 0 && (
          <section>
            <h3 className="label mb-2 text-coral">{tr("What to add")}</h3>
            <ul className="space-y-2">{result.gaps.map((s, i) => <li key={i} className="flex gap-3 rounded-xl bg-coral/10 px-4 py-3"><Icon name="lightbulb" size={20} className="shrink-0 text-coral" />{s}</li>)}</ul>
          </section>
        )}
        <div className="flex gap-3">
          <Button onClick={() => { setResult(null); setText(""); }} icon="replay">{tr("Explain it again")}</Button>
        </div>
      </div>
    );

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h2 className="text-2xl font-semibold">{tr("Explain it back")}</h2>
        <p className="mt-1 text-mute">{tr("Teach the topic in your own words, as if to a friend. It is the fastest way to find what you only half understand.")}</p>
      </div>
      <div>
        <label htmlFor="explain-topic" className="label mb-2 block text-mute">{tr("Topic")}</label>
        <select id="explain-topic" value={topic} onChange={(e) => setTopic(e.target.value)} className={inputClass}>
          <option value="">{tr("The whole lesson")}</option>
          {topics.map((t) => <option key={t.title} value={t.title}>{t.title}</option>)}
        </select>
      </div>
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label htmlFor="explain-text" className="label text-mute">{tr("Your explanation")}</label>
          {Speech && (
            <button onClick={toggleMic} aria-pressed={listening} className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold transition ${listening ? "bg-coral/20 text-coral" : "bg-high text-mute hover:text-ink"}`}>
              <Icon name={listening ? "stop_circle" : "mic"} size={18} className={listening ? "animate-pulse" : ""} /> {listening ? tr("Stop") : tr("Speak")}
            </button>
          )}
        </div>
        <textarea id="explain-text" className={`${inputClass} min-h-48 resize-y`} value={text} onChange={(e) => setText(e.target.value)} placeholder={tr("Type or speak your explanation here…")} maxLength={4000} />
        <p className="mt-1 text-xs text-faint">{text.trim().length < 20 ? tr("Write at least a couple of sentences.") : tr("{n} characters", { n: text.trim().length })}</p>
      </div>
      {error && <p role="alert" className="text-sm text-coral">{error}</p>}
      <Button icon="auto_awesome" onClick={submit} disabled={busy || text.trim().length < 20}>{busy ? tr("Marking your answer…") : tr("Check my explanation")}</Button>
    </div>
  );
}

// ---------- shared pattern for generated extras ----------

function useExtra(docId, kind) {
  const [data, setData] = useState(undefined); // undefined = loading, null = none yet
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const key = kind === "mindmap" ? "tree" : "content";
  useEffect(() => {
    setData(undefined);
    api(`/documents/${docId}/${kind}`).then((r) => setData(r[key])).catch((e) => { setError(e.message); setData(null); });
  }, [docId, kind, key]);
  const generate = async () => {
    setBusy(true);
    setError("");
    try {
      setData((await api(`/documents/${docId}/${kind}`, { method: "POST" }))[key]);
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  };
  return { data, busy, error, generate };
}

// ---------- mind map ----------

const BRANCH_COLORS = ["var(--cyan)", "var(--primary)", "var(--amber)", "var(--coral)", "#00cec9", "#8bd17c", "#f29ede", "#7fb4ff"];

function wrap(text, max) {
  const lines = [];
  let cur = "";
  for (const word of text.split(/\s+/)) {
    if (cur && (cur + " " + word).length > max) { lines.push(cur); cur = word; }
    else cur = cur ? `${cur} ${word}` : word;
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3);
}

function Pill({ x, y, text, color, big, max = 18 }) {
  const lines = wrap(text, max);
  const w = Math.max(...lines.map((l) => l.length)) * (big ? 9.5 : 7.4) + 26;
  const h = lines.length * (big ? 20 : 16) + 14;
  return (
    <g transform={`translate(${x},${y})`}>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={h / 2.4} fill={big ? color : "var(--card)"} stroke={color} strokeWidth={big ? 0 : 2} />
      {lines.map((l, i) => (
        <text key={i} x="0" y={(i - (lines.length - 1) / 2) * (big ? 20 : 16) + 4.5} textAnchor="middle" fontSize={big ? 15 : 12} fontWeight={big ? 700 : 500} fill={big ? "#10151a" : "var(--ink)"}>{l}</text>
      ))}
    </g>
  );
}

function MindMapSvg({ tree }) {
  const W = 1000, H = 720, cx = W / 2, cy = H / 2;
  const n = tree.branches.length;
  const parts = useMemo(
    () =>
      tree.branches.map((b, i) => {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
        const bx = cx + Math.cos(a) * 190, by = cy + Math.sin(a) * 170;
        const spread = b.children.length > 1 ? 0.5 : 0;
        const kids = b.children.map((c, j) => {
          const ca = a + (j - (b.children.length - 1) / 2) * (spread / Math.max(1, b.children.length - 1)) * 1.6;
          return { text: c, x: cx + Math.cos(ca) * 365, y: cy + Math.sin(ca) * 305 };
        });
        return { title: b.title, bx, by, kids, color: BRANCH_COLORS[i % BRANCH_COLORS.length] };
      }),
    [tree, n, cx, cy]
  );
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={tr("Mind map of {topic}", { topic: tree.center })}>
      {parts.map((p, i) => (
        <g key={i}>
          <path d={`M${cx},${cy} Q${(cx + p.bx) / 2},${(cy + p.by) / 2} ${p.bx},${p.by}`} stroke={p.color} strokeWidth="3" fill="none" opacity="0.7" />
          {p.kids.map((k, j) => <path key={j} d={`M${p.bx},${p.by} L${k.x},${k.y}`} stroke={p.color} strokeWidth="1.5" fill="none" opacity="0.5" />)}
        </g>
      ))}
      {parts.map((p, i) => (
        <g key={`n${i}`}>
          {p.kids.map((k, j) => <Pill key={j} x={k.x} y={k.y} text={k.text} color={p.color} />)}
          <Pill x={p.bx} y={p.by} text={p.title} color={p.color} max={14} />
        </g>
      ))}
      <Pill x={cx} y={cy} text={tree.center} color="var(--primary)" big max={14} />
    </svg>
  );
}

export function MindMap({ docId }) {
  const { data, busy, error, generate } = useExtra(docId, "mindmap");
  if (data === undefined) return <Skeleton className="h-96" />;
  if (!data)
    return (
      <>
        <EmptyState icon="hub" title={tr("No mind map yet")} body={tr("See the whole lesson on one page, with each main idea branching into its key points.")} action={<Button icon="auto_awesome" onClick={generate} disabled={busy}>{busy ? tr("Drawing the map…") : tr("Generate mind map")}</Button>} />
        {error && <p className="mt-3 text-center text-sm text-coral" role="alert">{error}</p>}
      </>
    );
  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-4 text-sm text-faint">
        <button onClick={() => window.print()} className="flex items-center gap-1 hover:text-ink"><Icon name="print" size={16} /> {tr("Print or save as PDF")}</button>
        <button onClick={generate} disabled={busy} className="hover:text-ink">{busy ? tr("Redrawing…") : tr("Redraw")}</button>
      </div>
      <Card className="overflow-hidden p-2 sm:p-4"><MindMapSvg tree={data} /></Card>
      {error && <p role="alert" className="text-sm text-coral">{error}</p>}
    </div>
  );
}

// ---------- cheat sheet ----------

export function CheatSheet({ docId }) {
  const { data, busy, error, generate } = useExtra(docId, "cheatsheet");
  if (data === undefined) return <Skeleton className="h-96" />;
  if (!data)
    return (
      <>
        <EmptyState icon="summarize" title={tr("No cheat sheet yet")} body={tr("A dense one-page revision sheet: key terms, facts and common mistakes, ready to print.")} action={<Button icon="auto_awesome" onClick={generate} disabled={busy}>{busy ? tr("Writing the sheet…") : tr("Generate cheat sheet")}</Button>} />
        {error && <p className="mt-3 text-center text-sm text-coral" role="alert">{error}</p>}
      </>
    );
  return (
    <div className="mx-auto max-w-[720px] space-y-4">
      <div className="flex justify-end gap-4 text-sm text-faint">
        <Link to={`/doc/${docId}/print?what=cheatsheet`} target="_blank" className="flex items-center gap-1 hover:text-ink"><Icon name="print" size={16} /> {tr("Print or save as PDF")}</Link>
        <button onClick={generate} disabled={busy} className="hover:text-ink">{busy ? tr("Rewriting…") : tr("Regenerate")}</button>
      </div>
      <Card className="p-6 sm:p-8"><Markdown>{data}</Markdown></Card>
      {error && <p role="alert" className="text-sm text-coral">{error}</p>}
    </div>
  );
}

// ---------- highlights ----------

export function Highlights({ docId, items, onChange, onOpen }) {
  const toast = useToast();
  const [editing, setEditing] = useState(null);
  const [note, setNote] = useState("");

  const saveNote = async (a) => {
    try {
      await api(`/annotations/${a.id}`, { method: "PATCH", json: { note } });
      onChange(items.map((x) => (x.id === a.id ? { ...x, note } : x)));
      setEditing(null);
    } catch (e) {
      toast(e.message, "error");
    }
  };
  const remove = async (a) => {
    try {
      await api(`/annotations/${a.id}`, { method: "DELETE" });
      onChange(items.filter((x) => x.id !== a.id));
    } catch (e) {
      toast(e.message, "error");
    }
  };

  if (items.length === 0)
    return <EmptyState icon="format_ink_highlighter" title={tr("No highlights yet")} body={tr("Select any text in a summary and choose Highlight. Add a note to remember why it matters.")} />;
  return (
    <ul className="mx-auto max-w-2xl space-y-3">
      {items.map((a) => (
        <li key={a.id} className="rounded-2xl border border-line/40 bg-low p-4">
          <p className="border-l-4 border-amber pl-3 leading-relaxed">{a.text}</p>
          {editing === a.id ? (
            <div className="mt-3 space-y-2">
              <textarea className={`${inputClass} min-h-20`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder={tr("Why does this matter?")} autoFocus />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="plain" onClick={() => setEditing(null)}>{tr("Cancel")}</Button>
                <Button size="sm" onClick={() => saveNote(a)}>{tr("Save note")}</Button>
              </div>
            </div>
          ) : a.note ? (
            <p className="mt-2 text-sm text-mute"><Icon name="sticky_note_2" size={16} className="mr-1 align-text-bottom text-faint" />{a.note}</p>
          ) : null}
          <div className="mt-3 flex items-center gap-4 text-xs text-faint">
            {a.topic && <span className="truncate">{a.topic}</span>}
            <button onClick={() => onOpen(a)} className="hover:text-ink">{tr("Show in summary")}</button>
            <button onClick={() => { setEditing(a.id); setNote(a.note); }} className="hover:text-ink">{a.note ? tr("Edit note") : tr("Add note")}</button>
            <button onClick={() => remove(a)} className="ml-auto hover:text-coral">{tr("Delete")}</button>
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Wraps each saved highlight found in the rendered summary in <mark>. Only touches text inside one block, so a
 * selection that spanned headings or list items is kept in the Highlights tab but not painted inline.
 */
export function paintHighlights(root, texts) {
  if (!root) return;
  root.querySelectorAll("mark[data-hl]").forEach((m) => m.replaceWith(document.createTextNode(m.textContent)));
  root.normalize();
  for (const text of texts) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const i = node.nodeValue.indexOf(text);
      if (i < 0 || node.parentElement.closest("mark")) continue;
      const range = document.createRange();
      range.setStart(node, i);
      range.setEnd(node, i + text.length);
      const mark = document.createElement("mark");
      mark.dataset.hl = "1";
      mark.className = "rounded bg-amber/30 px-0.5 text-inherit";
      range.surroundContents(mark);
      break;
    }
  }
}

// ---------- sharing ----------

export function ShareModal({ open, onClose, docId }) {
  const toast = useToast();
  const [token, setToken] = useState(undefined);
  const [busy, setBusy] = useState(false);
  const link = token ? `${window.location.origin}/s/${token}` : "";

  useEffect(() => {
    if (open) api(`/documents/${docId}/share`).then((r) => setToken(r.token)).catch((e) => { toast(e.message, "error"); setToken(null); });
  }, [open, docId, toast]);

  const create = async () => {
    setBusy(true);
    try { setToken((await api(`/documents/${docId}/share`, { method: "POST" })).token); } catch (e) { toast(e.message, "error"); }
    setBusy(false);
  };
  const revoke = async () => {
    setBusy(true);
    try { await api(`/documents/${docId}/share`, { method: "DELETE" }); setToken(null); toast(tr("Link turned off")); } catch (e) { toast(e.message, "error"); }
    setBusy(false);
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); toast(tr("Link copied")); } catch { toast(tr("Copy the link by hand"), "error"); }
  };

  return (
    <Modal open={open} onClose={onClose} title={tr("Share these notes")}>
      <div className="space-y-4">
        <p className="text-mute">{tr("Anyone with the link can read the summary and flashcards, and can copy the notes into their own library. They cannot change your copy. Turn the link off at any time.")}</p>
        {token === undefined ? <Skeleton className="h-12" /> : token ? (
          <>
            <div className="flex gap-2">
              <input readOnly value={link} onFocus={(e) => e.target.select()} className={inputClass} aria-label={tr("Share link")} />
              <Button onClick={copy} icon="content_copy">{tr("Copy")}</Button>
            </div>
            <div className="flex justify-end"><Button variant="ghost" onClick={revoke} disabled={busy} icon="link_off">{tr("Turn off link")}</Button></div>
          </>
        ) : (
          <Button onClick={create} disabled={busy} icon="link">{tr("Create a share link")}</Button>
        )}
      </div>
    </Modal>
  );
}
