import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, stream } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button, Card, Field, Icon, Modal, Pill, Skeleton, useToast } from "../components/ui";
import Markdown from "../components/Markdown";
import Flashcards from "../components/Flashcards";
import Podcast from "../components/Podcast";
import QuizOptions from "../components/QuizOptions";
import ReadAloud from "../components/ReadAloud";
import { CheatSheet, Explain, Highlights, MindMap, ShareModal, paintHighlights } from "../components/StudyTools";
import { ChatPanel, SidekickHeader, useSidekick } from "../components/Sidekick";
import { readingMinutes, timeAgo } from "../lib/util";
import { exportMarkdown } from "../lib/exporters";
import { L, tr, trx } from "../lib/i18n";

const LEVELS = ["beginner", "intermediate", "advanced"];
const LEVEL_HINT = {
  beginner: L("Only the most important points"),
  intermediate: L("Adds the supporting topics and detail"),
  advanced: L("Everything, exam-ready"),
};
const TABS = [
  ["summary", L("Summary"), "article"],
  ["notes", L("Notes"), "description"],
  ["flashcards", L("Flashcards"), "style"],
  ["quizzes", L("Quizzes"), "quiz"],
  ["explain", L("Explain"), "record_voice_over"],
  ["map", L("Mind map"), "hub"],
  ["cheat", L("Cheat sheet"), "summarize"],
  ["highlights", L("Highlights"), "format_ink_highlighter"],
];
const keyOf = (topic, level) => `${topic}::${level}`;

function QuizLauncher({ open, onClose, docId, topics, presetTopic, presetExam }) {
  const navigate = useNavigate();
  const [count, setCount] = useState(10);
  const [scope, setScope] = useState("lesson");
  const [topic, setTopic] = useState("");
  const [weak, setWeak] = useState(false);
  const [types, setTypes] = useState(["mcq"]);
  const [exam, setExam] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setScope(presetTopic ? "topic" : "lesson");
    setExam(!!presetExam);
    setTopic(presetTopic || topics[0]?.title || "");
    setError("");
  }, [open, presetTopic, presetExam, topics]);

  const start = async () => {
    setBusy(true);
    setError("");
    try {
      const body = { ...(scope === "topic" ? { count, topic } : { count, focus_weak: weak }), types, exam };
      const q = await api(`/documents/${docId}/quiz`, { method: "POST", json: body });
      navigate(`/quiz/${q.id}`);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  const choice = (on) => `flex-1 rounded-xl border p-3 text-left transition ${on ? "border-brand bg-brand/20" : "border-line text-mute hover:text-ink"}`;

  return (
    <Modal open={open} onClose={busy ? () => {} : onClose} title={tr("Generate a quiz")}>
      <div className="space-y-5">
        <div className="flex gap-2" role="radiogroup" aria-label={tr("Quiz scope")}>
          <button role="radio" aria-checked={scope === "lesson"} onClick={() => setScope("lesson")} className={choice(scope === "lesson")}>
            <span className="block font-semibold text-ink">{tr("Entire lesson")}</span>
            <span className="text-xs text-mute">{tr("Questions from every topic")}</span>
          </button>
          <button role="radio" aria-checked={scope === "topic"} onClick={() => setScope("topic")} disabled={!topics.length} className={choice(scope === "topic")}>
            <span className="block font-semibold text-ink">{tr("One topic")}</span>
            <span className="text-xs text-mute">{topics.length ? tr("Drill a single topic") : tr("Topics are still loading")}</span>
          </button>
        </div>

        {scope === "topic" ? (
          <Field label={tr("Topic")}>
            <div className="flex max-h-44 flex-wrap gap-2 overflow-y-auto">
              {topics.map((t) => (
                <button key={t.title} onClick={() => setTopic(t.title)} aria-pressed={topic === t.title} className={`rounded-full border px-3 py-1.5 text-sm transition ${topic === t.title ? "border-brand bg-brand/20 text-primary" : "border-line text-mute hover:text-ink"}`}>{t.title}</button>
              ))}
            </div>
          </Field>
        ) : (
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-4">
            <input type="checkbox" checked={weak} onChange={(e) => setWeak(e.target.checked)} className="mt-1 h-4 w-4 accent-[#6c5ce7]" />
            <span>
              <span className="block font-medium">{tr("Focus on my weak topics")}</span>
              <span className="text-sm text-mute">{tr("Weights about half the questions toward topics you scored under 70% on in this lesson.")}</span>
            </span>
          </label>
        )}

        <QuizOptions types={types} setTypes={setTypes} exam={exam} setExam={setExam} count={count} />

        <Field label={tr("Number of questions")}>
          <div className="flex gap-2">
            {[5, 10, 15].map((n) => (
              <button key={n} onClick={() => setCount(n)} aria-pressed={count === n} className={`flex-1 rounded-xl border py-2.5 font-semibold transition ${count === n ? "border-brand bg-brand/20 text-primary" : "border-line text-mute hover:text-ink"}`}>{n}</button>
            ))}
          </div>
        </Field>
        {error && <p role="alert" className="text-sm text-coral">{error}</p>}
        <div className="flex justify-end gap-3">
          <Button variant="plain" onClick={onClose} disabled={busy}>{tr("Cancel")}</Button>
          <Button onClick={start} disabled={busy || (scope === "topic" && !topic)} icon="auto_awesome">{busy ? tr("Writing {count} questions…", { count }) : tr("Start quiz")}</Button>
        </div>
        {busy && <p className="text-center text-xs text-faint">{tr("This usually takes 10 to 20 seconds.")}</p>}
      </div>
    </Modal>
  );
}

function SummaryLoading({ what }) {
  return (
    <div className="space-y-4" role="status" aria-label={tr("Generating summary")}>
      <p className="flex items-center gap-2 text-sm text-cyan"><Icon name="auto_awesome" size={18} className="animate-pulse" /> {what}</p>
      <Skeleton className="h-4 w-11/12" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-4/5" />
      <Skeleton className="mt-6 h-6 w-1/3" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-10/12" />
    </div>
  );
}

function ModeChoice({ topics, loading, error, onPick, onRetry }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold">{tr("How do you want to study this?")}</h2>
        <p className="mt-1 text-mute">{tr("Take the whole lesson in one go, or work through it one topic at a time. You can switch whenever you like.")}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <button onClick={() => onPick("lesson")} className="rounded-2xl border border-line/50 bg-low p-6 text-left transition hover:border-brand/70 hover:bg-card">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-high text-primary"><Icon name="menu_book" /></span>
          <span className="mt-4 block text-lg font-semibold">{tr("Entire lesson at once")}</span>
          <span className="mt-1 block text-sm text-mute">{tr("One summary that walks through every topic in order.")}</span>
        </button>
        <button onClick={() => onPick("topic")} disabled={!topics.length} className="rounded-2xl border border-line/50 bg-low p-6 text-left transition hover:border-brand/70 hover:bg-card disabled:opacity-60">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-high text-cyan"><Icon name="format_list_numbered" /></span>
          <span className="mt-4 block text-lg font-semibold">{tr("Topic by topic")}</span>
          <span className="mt-1 block text-sm text-mute">{topics.length ? `${topics.length} topics. Read one, then move on when you are ready.` : tr("Splitting your notes into topics…")}</span>
        </button>
      </div>
      {loading && <Skeleton className="h-24" />}
      {error && (
        <Card className="flex items-center justify-between gap-4 border-coral/40 p-4 text-sm text-coral" role="alert">
          <span>{error}</span><Button size="sm" variant="ghost" onClick={onRetry}>{tr("Retry")}</Button>
        </Card>
      )}
      {topics.length > 0 && (
        <div>
          <p className="label mb-2 text-faint">{tr("Topics found in your notes")}</p>
          <ol className="space-y-2">
            {topics.map((t, i) => (
              <li key={t.title} className="flex gap-3 rounded-xl bg-low px-4 py-3 text-sm">
                <span className="font-mono text-faint">{String(i + 1).padStart(2, "0")}</span>
                <span><span className="font-semibold">{t.title}</span><span className="block text-mute">{t.blurb}</span></span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

function NotesView({ docId, topics, topic, onTopic, onQuiz, onSummary }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    setData(null);
    setError("");
    api(`/documents/${docId}/notes?topic=${encodeURIComponent(topic)}`).then(setData).catch((e) => setError(e.message));
  }, [docId, topic]);

  const chip = (on) => `shrink-0 rounded-full border px-3 py-1.5 text-sm transition ${on ? "border-brand bg-brand/20 text-primary" : "border-line text-mute hover:text-ink"}`;
  return (
    <div className="mx-auto max-w-[720px] space-y-5 xl:mx-0">
      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label={tr("Notes by topic")}>
        <button role="tab" aria-selected={!topic} onClick={() => onTopic("")} className={chip(!topic)}>{tr("Whole notes")}</button>
        {topics.map((t) => <button key={t.title} role="tab" aria-selected={topic === t.title} onClick={() => onTopic(t.title)} className={chip(topic === t.title)}>{t.title}</button>)}
      </div>
      {error ? <p className="text-coral" role="alert">{error}</p> : !data ? <Skeleton className="h-64" /> : (
        <>
          {topic && !data.sliced && <p className="rounded-xl bg-amber/10 px-4 py-3 text-sm text-amber">{tr("We could not pinpoint where this topic starts, so the whole notes are shown.")}</p>}
          <article className="whitespace-pre-wrap rounded-2xl border border-line/40 bg-low p-6 text-[15px] leading-relaxed text-mute">{data.text}</article>
          {topic && (
            <div className="flex flex-wrap gap-3">
              <Button icon="quiz" onClick={() => onQuiz(topic)}>{tr("I have read it. Quiz me on this topic")}</Button>
              <Button variant="ghost" icon="auto_awesome" onClick={() => onSummary(topic)}>{tr("Summarize this topic instead")}</Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function Document() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { refreshStats } = useAuth();
  const sidekick = useSidekick();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") || "summary";
  const notesTopic = params.get("topic") || "";

  const [doc, setDoc] = useState(null);
  const [topics, setTopics] = useState([]);
  const [outlineBusy, setOutlineBusy] = useState(false);
  const [outlineError, setOutlineError] = useState("");
  const [mode, setMode] = useState(null); // null = ask, "lesson" | "topic"
  const [topic, setTopic] = useState("");
  const [listOpen, setListOpen] = useState(false);
  const [level, setLevel] = useState("intermediate");
  const [store, setStore] = useState({}); // "topic::level" -> markdown, "" topic = whole lesson
  const [streaming, setStreaming] = useState(false);
  const [gotToken, setGotToken] = useState(false);
  const [error, setError] = useState("");
  const [quizOpen, setQuizOpen] = useState(false);
  const [quizTopic, setQuizTopic] = useState("");
  const [quizExam, setQuizExam] = useState(false);
  const [cardCount, setCardCount] = useState(null);
  const [anns, setAnns] = useState([]);
  const [shareOpen, setShareOpen] = useState(false);
  const [sel, setSel] = useState(null); // text the student has selected in the summary
  const summaryRef = useRef();
  const abortRef = useRef();
  const attempted = useRef(new Set());

  const patchParams = (fn) => setParams((p) => { const n = new URLSearchParams(p); fn(n); return n; }, { replace: true });
  const setTab = (t) => patchParams((n) => { t === "summary" ? n.delete("tab") : n.set("tab", t); n.delete("topic"); });
  const openQuiz = (t = "") => { setQuizTopic(t); setQuizExam(false); setQuizOpen(true); };

  const loadOutline = useCallback(async () => {
    setOutlineBusy(true);
    setOutlineError("");
    try {
      const o = await api(`/documents/${id}/outline`, { method: "POST" });
      setTopics(o.topics);
    } catch (e) {
      setOutlineError(e.message);
    }
    setOutlineBusy(false);
  }, [id]);

  const generate = useCallback(
    async (lvl, tp) => {
      const k = keyOf(tp, lvl);
      attempted.current.add(k);
      setError("");
      setStreaming(true);
      setGotToken(false);
      setStore((s) => ({ ...s, [k]: "" }));
      abortRef.current = new AbortController();
      try {
        await stream(`/documents/${id}/summary?level=${lvl}&topic=${encodeURIComponent(tp)}`, {}, (t) => {
          setGotToken(true);
          setStore((s) => ({ ...s, [k]: (s[k] ?? "") + t }));
        }, abortRef.current.signal);
        refreshStats();
      } catch (e) {
        setStore((s) => { const n = { ...s }; delete n[k]; return n; });
        if (e.name !== "AbortError") setError(e.message);
      }
      setStreaming(false);
    },
    [id, refreshStats]
  );

  useEffect(() => {
    api(`/documents/${id}`)
      .then((d) => {
        const s = {};
        for (const [l, text] of Object.entries(d.summaries)) s[keyOf("", l)] = text;
        for (const [t, byLevel] of Object.entries(d.topic_summaries)) for (const [l, text] of Object.entries(byLevel)) s[keyOf(t, l)] = text;
        setStore(s);
        setDoc(d);
        setTopics(d.topics);

        const deepTopic = params.get("topic");
        const deepLevel = params.get("level");
        if (LEVELS.includes(deepLevel)) setLevel(deepLevel);
        else {
          const have = LEVELS.filter((l) => d.summaries[l]);
          if (have.length && !d.summaries.intermediate) setLevel(have[0]);
        }
        if (deepTopic && (params.get("tab") || "summary") === "summary") { setMode("topic"); setTopic(deepTopic); }
        else if (Object.keys(d.summaries).length) setMode("lesson");
        else if (Object.keys(d.topic_summaries).length) setMode("topic");

        if (params.get("quiz")) {
          setQuizOpen(true);
          setQuizTopic(params.get("topic") || "");
          setQuizExam(!!params.get("exam"));
        }
        patchParams((n) => { n.delete("new"); n.delete("quiz"); n.delete("exam"); n.delete("level"); if ((n.get("tab") || "summary") === "summary") n.delete("topic"); });
        if (!d.topics.length) loadOutline();
        api(`/documents/${id}/annotations`).then(setAnns).catch(() => {});
      })
      .catch((e) => setError(e.message));
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!doc) return;
    sidekick.setDoc({ id: doc.id, title: doc.title });
    return () => sidekick.setDoc(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.id]);

  // In topic mode, always sit on a real topic.
  useEffect(() => {
    if (mode === "topic" && topics.length && !topics.some((t) => t.title === topic)) setTopic(topics[0].title);
  }, [mode, topics, topic]);

  const activeTopic = mode === "topic" ? topic : "";
  const current = store[keyOf(activeTopic, level)];

  // Write whatever the student is looking at if it does not exist yet.
  useEffect(() => {
    if (!doc || tab !== "summary" || !mode || streaming || current) return;
    if (mode === "topic" && !activeTopic) return;
    if (attempted.current.has(keyOf(activeTopic, level))) return;
    generate(level, activeTopic);
  }, [doc, tab, mode, streaming, current, activeTopic, level, generate]);

  const remove = async () => {
    if (!confirm(tr("Delete these notes along with their summaries, flashcards and quizzes?"))) return;
    await api(`/documents/${id}`, { method: "DELETE" });
    toast(tr("Notes deleted"));
    navigate("/library");
  };

  const pickMode = (m) => {
    setMode(m);
    setError("");
    if (m === "topic" && !topic && topics.length) setTopic(topics[0].title);
  };
  const goTopic = (title) => { setTopic(title); setListOpen(false); setError(""); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const summarizeTopic = (title) => { patchParams((n) => { n.delete("tab"); n.delete("topic"); }); setMode("topic"); setTopic(title); };
  const retry = () => { attempted.current.delete(keyOf(activeTopic, level)); setError(""); generate(level, activeTopic); };

  // Paint saved highlights into the finished summary, and offer a Highlight button when text is selected.
  const hlKey = anns.filter((a) => a.topic === activeTopic && (!a.level || a.level === level)).map((a) => a.text).join("\u0001");
  useEffect(() => {
    if (!streaming && current) paintHighlights(summaryRef.current, hlKey ? hlKey.split("\u0001") : []);
  }, [streaming, current, hlKey]);

  useEffect(() => {
    const clear = () => { if (!window.getSelection()?.toString().trim()) setSel(null); };
    document.addEventListener("selectionchange", clear);
    return () => document.removeEventListener("selectionchange", clear);
  }, []);

  const onSelect = () => {
    const s = window.getSelection();
    const text = s?.toString().trim() || "";
    if (text.length < 3 || text.length > 600 || !summaryRef.current?.contains(s.anchorNode)) return setSel(null);
    const r = s.getRangeAt(0).getBoundingClientRect();
    setSel({ text, x: r.left + r.width / 2, y: r.top });
  };

  const saveHighlight = async (withNote) => {
    const note = withNote ? prompt(tr("Add a note to this highlight"), "") : "";
    if (note === null) return;
    try {
      const row = await api(`/documents/${id}/annotations`, { method: "POST", json: { text: sel.text, note: note || "", topic: activeTopic, level } });
      setAnns((a) => [...a, row]);
      window.getSelection()?.removeAllRanges();
      setSel(null);
      toast(tr("Highlight saved"));
    } catch (e) {
      toast(e.message, "error");
    }
  };

  const termCount = useMemo(() => new Set([...(current || "").matchAll(/\*\*(.+?)\*\*/g)].map((m) => m[1].toLowerCase())).size, [current]);
  const idx = topics.findIndex((t) => t.title === topic);

  if (!doc) return error ? <Card className="mx-auto max-w-xl p-6 text-coral" role="alert">{error}</Card> : <div className="space-y-4"><Skeleton className="h-10 w-1/2" /><Skeleton className="h-96" /></div>;

  const ready = doc.mastery_pct;
  const doneAt = (t) => !!store[keyOf(t, level)];

  return (
    <div className="pb-24">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="label flex items-center gap-1.5 truncate text-cyan"><Icon name="eco" size={14} /> {doc.subject}</p>
          <h1 className="mt-1 text-3xl font-bold sm:text-4xl">{doc.title}</h1>
          {doc.blurb && <p className="mt-2 max-w-2xl text-mute">{doc.blurb}</p>}
        </div>
        <div className="flex items-center gap-3">
          {tab === "summary" && mode && (
            <div className="flex rounded-full bg-high p-1" role="tablist" aria-label={tr("Reading level")}>
              {LEVELS.map((l) => (
                <button key={l} role="tab" aria-selected={level === l} title={tr(LEVEL_HINT[l])} onClick={() => setLevel(l)} disabled={streaming} className={`rounded-full px-4 py-1.5 text-sm font-semibold capitalize transition ${level === l ? "bg-primary/90 text-[#2900a0]" : "text-mute hover:text-ink"}`}>
                  {tr(l)}
                </button>
              ))}
            </div>
          )}
          <button onClick={() => setShareOpen(true)} aria-label={tr("Share these notes")} title={tr("Share these notes")} className="grid h-10 w-10 place-items-center rounded-full text-faint transition hover:bg-high hover:text-ink"><Icon name="share" size={20} /></button>
          <button onClick={remove} aria-label={tr("Delete notes")} title={tr("Delete notes")} className="grid h-10 w-10 place-items-center rounded-full text-faint transition hover:bg-coral/10 hover:text-coral"><Icon name="delete" size={20} /></button>
        </div>
      </header>

      <nav className="mt-6 flex gap-1 overflow-x-auto border-b border-line/40" role="tablist" aria-label={tr("Document sections")}>
        {TABS.map(([key, label, icon]) => (
          <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition ${tab === key ? "border-brand text-ink" : "border-transparent text-mute hover:text-ink"}`}>
            <Icon name={icon} size={18} /> {tr(label)}
            {key === "flashcards" && cardCount ? <span className="rounded-full bg-high px-2 text-xs">{cardCount}</span> : null}
            {key === "quizzes" && doc.quizzes.length ? <span className="rounded-full bg-high px-2 text-xs">{doc.quizzes.length}</span> : null}
          </button>
        ))}
      </nav>

      <div className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          {tab === "summary" && !mode && (
            <div className="mx-auto max-w-[720px] xl:mx-0">
              <ModeChoice topics={topics} loading={outlineBusy} error={outlineError} onPick={pickMode} onRetry={loadOutline} />
            </div>
          )}

          {tab === "summary" && mode && (
            <div className="mx-auto max-w-[720px] space-y-6 xl:mx-0">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex rounded-full bg-low p-1 text-sm" role="tablist" aria-label={tr("Study mode")}>
                  {[["lesson", tr("Entire lesson")], ["topic", tr("Topic by topic")]].map(([m, label]) => (
                    <button key={m} role="tab" aria-selected={mode === m} onClick={() => pickMode(m)} disabled={streaming || (m === "topic" && !topics.length)} className={`rounded-full px-4 py-1.5 font-semibold transition ${mode === m ? "bg-high text-ink" : "text-mute hover:text-ink"}`}>{label}</button>
                  ))}
                </div>
                <p className="flex items-center gap-1.5 text-xs font-semibold text-mute">
                  <span className="h-2 w-2 rounded-full bg-teal" /> {tr(level)} &middot; {tr(LEVEL_HINT[level])}
                </p>
              </div>

              {mode === "topic" && topics.length > 0 && (
                <div className="rounded-2xl border border-line/40 bg-low p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="label text-cyan">Topic {idx + 1} of {topics.length}</p>
                      <h2 className="mt-1 text-2xl font-semibold">{topic}</h2>
                      <p className="mt-1 text-sm text-mute">{topics[idx]?.blurb}</p>
                    </div>
                    <button onClick={() => setListOpen((o) => !o)} aria-expanded={listOpen} className="flex shrink-0 items-center gap-1 text-sm font-semibold text-primary hover:underline">
                      {tr("All topics")} <Icon name="expand_more" size={18} className={`transition ${listOpen ? "rotate-180" : ""}`} />
                    </button>
                  </div>
                  <div className="mt-4 flex gap-1.5" role="progressbar" aria-valuemin={1} aria-valuemax={topics.length} aria-valuenow={idx + 1}>
                    {topics.map((t, i) => (
                      <button key={t.title} disabled={streaming} onClick={() => goTopic(t.title)} aria-label={tr("Go to topic {n}: {title}", { n: i + 1, title: t.title })} title={t.title} className={`h-1.5 flex-1 rounded-full transition ${i === idx ? "bg-brand" : doneAt(t.title) ? "bg-teal" : "bg-high hover:bg-highest"}`} />
                    ))}
                  </div>
                  {listOpen && (
                    <ol className="pop mt-4 space-y-1">
                      {topics.map((t, i) => (
                        <li key={t.title}>
                          <button disabled={streaming} onClick={() => goTopic(t.title)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition ${i === idx ? "bg-high font-semibold" : "hover:bg-high"}`}>
                            <Icon name={doneAt(t.title) ? "check_circle" : "radio_button_unchecked"} fill={doneAt(t.title)} size={18} className={doneAt(t.title) ? "text-cyan" : "text-faint"} />
                            <span className="flex-1">{t.title}</span>
                          </button>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              )}

              {(mode === "lesson" || topics.some((t) => t.title === topic)) && <Podcast key={`${activeTopic}|${level}`} docId={id} topic={activeTopic} level={level} />}
              {current && !streaming && <ReadAloud text={current} />}
              {current && !streaming && (
                <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold text-mute">
                  <span>Reading time: {readingMinutes(current)} min</span>
                  {ready != null && <span className="text-amber">{ready}% Mastery Confidence</span>}
                </p>
              )}

              {streaming && !gotToken ? (
                <SummaryLoading what={mode === "topic" ? tr("Writing the {level} summary of \"{topic}\"…", { level: tr(level), topic }) : tr("Reading your notes and writing the summary…")} />
              ) : current ? (
                <div key={`${activeTopic}|${level}|${streaming ? "s" : "d"}`} ref={summaryRef} onMouseUp={onSelect} onKeyUp={onSelect} className={streaming ? "cursor" : ""}><Markdown>{current}</Markdown></div>
              ) : !error && <SummaryLoading what={tr("Getting ready…")} />}

              {error && (
                <Card className="flex items-center justify-between gap-4 border-coral/40 p-4 text-sm text-coral" role="alert">
                  <span>{error}</span>
                  <Button size="sm" variant="ghost" onClick={retry}>{tr("Retry")}</Button>
                </Card>
              )}

              {current && !streaming && (
                <>
                  {mode === "topic" && (
                    <div className="flex flex-col gap-3 rounded-2xl bg-low p-4 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm text-mute">{trx("Done with {topic}? Check yourself before moving on.", { topic: <b className="text-ink">{topic}</b> })}</p>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="ghost" icon="description" onClick={() => patchParams((n) => { n.set("tab", "notes"); n.set("topic", topic); })}>{tr("Read the notes")}</Button>
                        <Button size="sm" icon="quiz" onClick={() => openQuiz(topic)}>{tr("Quiz this topic")}</Button>
                      </div>
                    </div>
                  )}
                  {mode === "topic" && (
                    <div className="flex items-center justify-between gap-3">
                      <Button variant="plain" icon="arrow_back" disabled={idx <= 0} onClick={() => goTopic(topics[idx - 1].title)}>{tr("Previous")}</Button>
                      {idx < topics.length - 1 ? (
                        <Button trailing="arrow_forward" onClick={() => goTopic(topics[idx + 1].title)}>Next: {topics[idx + 1].title}</Button>
                      ) : (
                        <Button trailing="quiz" onClick={() => openQuiz()}>{tr("Finished. Take the lesson quiz")}</Button>
                      )}
                    </div>
                  )}
                  <div className="flex flex-col gap-3 rounded-2xl bg-low p-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="flex items-center gap-3 text-sm font-semibold text-mute">
                      <span className="grid h-9 w-9 place-items-center rounded-full bg-high text-primary"><Icon name="menu_book" size={18} /></span>
                      {termCount} key term{termCount === 1 ? "" : "s"} highlighted in this summary
                    </p>
                    <button onClick={() => setTab("flashcards")} className="text-sm font-semibold text-primary hover:underline">{tr("Review flashcards")}</button>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-faint">
                    <button onClick={retry} className="hover:text-ink">{tr("Regenerate this summary")}</button>
                    <button onClick={() => exportMarkdown(mode === "topic" ? `${doc.title}: ${topic}` : doc.title, current)} className="flex items-center gap-1 hover:text-ink"><Icon name="download" size={16} /> {tr("Download Markdown")}</button>
                    <Link to={`/doc/${id}/print?what=summary&level=${level}${mode === "topic" ? `&topic=${encodeURIComponent(topic)}` : ""}`} target="_blank" className="flex items-center gap-1 hover:text-ink"><Icon name="print" size={16} /> {tr("Print or save as PDF")}</Link>
                  </div>
                </>
              )}
            </div>
          )}

          {tab === "notes" && (
            <NotesView
              docId={id}
              topics={topics}
              topic={notesTopic}
              onTopic={(t) => patchParams((n) => { t ? n.set("topic", t) : n.delete("topic"); })}
              onQuiz={openQuiz}
              onSummary={summarizeTopic}
            />
          )}

          {tab === "explain" && <Explain docId={id} topics={topics} />}
          {tab === "map" && <MindMap docId={id} />}
          {tab === "cheat" && <CheatSheet docId={id} />}
          {tab === "highlights" && (
            <Highlights
              docId={id}
              items={anns}
              onChange={setAnns}
              onOpen={(a) => {
                setTab("summary");
                if (a.topic) { setMode("topic"); setTopic(a.topic); } else setMode("lesson");
                if (a.level) setLevel(a.level);
              }}
            />
          )}

          {tab === "flashcards" && <Flashcards docId={id} title={doc.title} onChange={setCardCount} />}

          {tab === "quizzes" && (
            <div className="mx-auto max-w-2xl space-y-4 xl:mx-0">
              <Button icon="add" onClick={() => openQuiz()}>{tr("New quiz")}</Button>
              {doc.quizzes.length === 0 ? (
                <p className="text-mute">{tr("No quizzes for these notes yet. Generate one to see where you stand.")}</p>
              ) : (
                doc.quizzes.map((q) => (
                  <Link key={q.id} to={`/quiz/${q.id}`} className="flex items-center justify-between gap-3 rounded-2xl border border-line/40 bg-low p-5 transition hover:border-brand/60">
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{q.title}</span>
                      <span className="text-xs text-faint">{q.scope === "topic" ? tr("Topic quiz") : tr("Full lesson")} &middot; created {timeAgo(q.created_at)}</span>
                    </span>
                    <Pill tone="primary" icon="play_arrow">{tr("Start")}</Pill>
                  </Link>
                ))
              )}
            </div>
          )}
        </div>

        <aside className="hidden space-y-6 xl:block">
          <div className="sticky top-24 space-y-6">
            <div className="rounded-2xl bg-brand p-6 text-white shadow-[0_20px_50px_-20px_rgb(108_92_231/0.9)]">
              <Icon name="quiz" size={32} />
              <h2 className="mt-3 text-2xl font-semibold leading-tight">{tr("Test Your Knowledge")}</h2>
              <p className="mt-2 text-white/80">{tr("Quiz the whole lesson, or just the topic you are on.")}</p>
              <Button variant="white" className="mt-5 w-full" onClick={() => openQuiz(mode === "topic" && tab === "summary" ? topic : "")}>
                {mode === "topic" && tab === "summary" && topic ? tr("Quiz this topic") : tr("Generate Quiz")}
              </Button>
            </div>
            <Card className="flex h-[26rem] flex-col overflow-hidden">
              <SidekickHeader />
              <ChatPanel docId={id} title={doc.title} className="flex-1" />
            </Card>
          </div>
        </aside>
      </div>

      <div className="glass fixed inset-x-3 bottom-20 z-20 mx-auto flex max-w-xl items-center justify-between gap-2 rounded-full border border-line/50 py-2 pl-5 pr-2 shadow-2xl md:bottom-6 xl:hidden">
        <button onClick={sidekick.open} className="flex items-center gap-2 text-sm font-semibold hover:text-primary"><Icon name="forum" size={18} /> {tr("Ask Sidekick")}</button>
        {ready != null && <span className="hidden items-center gap-1.5 text-xs font-semibold text-mute sm:flex"><Icon name="donut_large" size={16} className="text-cyan" />{ready}% Ready</span>}
        <Button size="sm" trailing="arrow_forward" onClick={() => openQuiz()}>{tr("Start Quiz")}</Button>
      </div>

      {sel && (
        <div className="fixed z-50 flex gap-1 rounded-full border border-line/60 bg-card p-1 shadow-2xl" style={{ left: sel.x, top: sel.y - 8, transform: "translate(-50%, -100%)" }} onMouseDown={(e) => e.preventDefault()}>
          <button onClick={() => saveHighlight(false)} className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-amber hover:bg-high"><Icon name="format_ink_highlighter" size={16} /> {tr("Highlight")}</button>
          <button onClick={() => saveHighlight(true)} className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold hover:bg-high"><Icon name="sticky_note_2" size={16} /> {tr("Add note")}</button>
        </div>
      )}
      <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} docId={id} />
      <QuizLauncher open={quizOpen} onClose={() => setQuizOpen(false)} docId={id} topics={topics} presetTopic={quizTopic} presetExam={quizExam} />
    </div>
  );
}
