import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button, Card, Icon, Modal, Ring, Skeleton } from "../components/ui";
import { tr } from "../lib/i18n";
import { pet } from "../lib/events";

const LETTERS = ["A", "B", "C", "D"];
const clock = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

function load(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}

function Results({ result, quiz, seconds, onRetake }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(() => result.review.findIndex((r) => !r.is_correct));
  const [busy, setBusy] = useState(false);
  const pct = Math.round((100 * result.score) / result.total);
  const headline = pct >= 80 ? tr("Excellent work!") : pct >= 60 ? tr("Great effort!") : tr("Keep going!");

  const [busyKey, setBusyKey] = useState("");
  const [err, setErr] = useState("");
  const weak = result.topics.filter((t) => t.weak);
  const lessonQuiz = result.scope === "lesson" && result.mode !== "exam";
  useEffect(() => { pet(pct >= 80 ? "cheer" : "comfort"); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const startQuiz = async (body, tag) => {
    setBusyKey(tag);
    setErr("");
    try {
      const q = await api(`/documents/${result.document_id}/quiz`, { method: "POST", json: body });
      navigate(`/quiz/${q.id}`);
    } catch (e) {
      setErr(e.message);
      setBusyKey("");
    }
  };
  const doc = `/doc/${result.document_id}`;
  const enc = encodeURIComponent;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <Card className="ai-border overflow-hidden p-8 text-center sm:p-10">
        <div className="mx-auto w-fit">
          <Ring value={pct} size={168} stroke={10} color={pct >= 60 ? "var(--cyan)" : "var(--coral)"}>
            <div>
              <p className="font-display text-5xl font-bold">{result.score}<span className="text-2xl text-mute">/{result.total}</span></p>
              <p className="label mt-1 text-mute">{tr("Score")}</p>
            </div>
          </Ring>
        </div>
        <h1 className="mt-6 text-3xl font-bold">{headline}</h1>
        <p className="mt-1 text-mute">You scored {pct}% on {quiz.title} in {clock(seconds)}.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <span className="flex items-center gap-2 rounded-full bg-amber/15 px-4 py-2 text-sm font-semibold text-amber"><Icon name="star" fill size={18} /> +{result.xp} XP Earned</span>
          <span className="flex items-center gap-2 rounded-full bg-high px-4 py-2 text-sm font-semibold"><Icon name="local_fire_department" fill size={18} className="text-amber" /> Daily Streak: {result.streak} Day{result.streak === 1 ? "" : "s"}</span>
        </div>
      </Card>

      <section aria-labelledby="by-topic">
        <h2 id="by-topic" className="mb-4 text-2xl font-semibold">{tr("Results by topic")}</h2>
        <div className="space-y-3">
          {result.topics.map((t) => {
            const pct = Math.round((100 * t.correct) / t.total);
            return (
              <div key={t.topic} className={`rounded-2xl border bg-low p-5 ${t.weak ? "border-coral/30" : "border-line/40"}`}>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold">{t.topic}</p>
                  <span className={`label rounded-full px-3 py-1 ${t.weak ? "bg-coral/15 text-coral" : "bg-teal/15 text-cyan"}`}>{t.weak ? tr("Needs review") : tr("Solid")} &middot; {t.correct}/{t.total}</span>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-high"><div className={`h-full rounded-full ${t.weak ? "bg-coral" : "bg-teal"}`} style={{ width: `${pct}%` }} /></div>
                {t.weak && (
                  <div className="mt-4 space-y-3">
                    <p className="text-sm text-mute">{tr("Go back to this topic, then come back and try it again.")}</p>
                    <div className="flex flex-wrap gap-2">
                      <Button as={Link} to={`${doc}?topic=${enc(t.topic)}&level=beginner`} size="sm" variant="ghost" icon="auto_awesome">{tr("Summarize it for me")}</Button>
                      <Button as={Link} to={`${doc}?tab=notes&topic=${enc(t.topic)}`} size="sm" variant="ghost" icon="description">{tr("Read it myself")}</Button>
                      <Button size="sm" icon="replay" disabled={!!busyKey} onClick={() => startQuiz({ count: 5, topic: t.topic }, t.topic)}>{busyKey === t.topic ? tr("Writing questions…") : tr("Try this topic again")}</Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {err && <p className="mt-3 text-sm text-coral" role="alert">{err}</p>}
      </section>

      <section>
        <h2 className="mb-4 text-2xl font-semibold">{tr("Review Answers")}</h2>
        <div className="space-y-3">
          {result.review.map((r, i) => {
            const isOpen = open === i;
            return (
              <div key={i} className={`overflow-hidden rounded-2xl border bg-low transition ${r.is_correct ? "border-line/40" : "border-coral/30"}`}>
                <button onClick={() => setOpen(isOpen ? -1 : i)} aria-expanded={isOpen} className="flex w-full items-center gap-4 p-5 text-left">
                  <Icon name={r.is_correct ? "check_circle" : "cancel"} fill className={r.is_correct ? "text-cyan" : "text-coral"} />
                  <span className="flex-1 font-semibold">Q{i + 1}: {r.question}</span>
                  <Icon name="expand_more" className={`transition ${isOpen ? "rotate-180" : ""}`} />
                </button>
                {isOpen && (
                  <div className="pop space-y-4 border-t border-line/30 p-5 pt-4">
                    {r.type === "tf" && (
                      <ul className="space-y-2 text-sm">
                        {[tr("True"), tr("False")].map((o, j) => (
                          <li key={j} className={`flex items-start gap-3 rounded-xl px-4 py-2.5 ${j === r.correct_index ? "bg-teal/15 text-cyan" : j === r.your_index ? "bg-coral/10 text-coral" : "text-mute"}`}>
                            <span className="flex-1">{o}</span>
                            {j === r.correct_index && <span className="label">{tr("Correct")}</span>}
                            {j === r.your_index && j !== r.correct_index && <span className="label">{tr("Your answer")}</span>}
                          </li>
                        ))}
                        {r.your_index == null && <li className="px-4 text-coral">{tr("You skipped this question.")}</li>}
                      </ul>
                    )}
                    {(r.type === "fill" || r.type === "short") && (
                      <div className="space-y-2 text-sm">
                        <div className={`rounded-xl px-4 py-2.5 ${r.is_correct ? "bg-teal/15 text-cyan" : "bg-coral/10 text-coral"}`}>
                          <span className="label block">{tr("Your answer")}</span>
                          {r.your_text?.trim() ? r.your_text : tr("You skipped this question.")}
                        </div>
                        {!r.is_correct && (
                          <div className="rounded-xl bg-teal/15 px-4 py-2.5 text-cyan">
                            <span className="label block">{r.type === "fill" ? tr("Correct") : tr("Model answer")}</span>
                            {r.answer}
                          </div>
                        )}
                        {r.feedback && <p className="px-1 text-mute">{r.feedback}</p>}
                      </div>
                    )}
                    <ul className={`space-y-2 text-sm ${r.type && r.type !== "mcq" ? "hidden" : ""}`}>
                      {r.options.map((o, j) => (
                        <li key={j} className={`flex items-start gap-3 rounded-xl px-4 py-2.5 ${j === r.correct_index ? "bg-teal/15 text-cyan" : j === r.your_index ? "bg-coral/10 text-coral" : "text-mute"}`}>
                          <b>{LETTERS[j]}.</b> <span className="flex-1">{o}</span>
                          {j === r.correct_index && <span className="label">{tr("Correct")}</span>}
                          {j === r.your_index && j !== r.correct_index && <span className="label">{tr("Your answer")}</span>}
                        </li>
                      ))}
                      {r.your_index == null && <li className="px-4 text-coral">{tr("You skipped this question.")}</li>}
                    </ul>
                    <div className="ai-border rounded-xl p-4">
                      <p className="mb-1 flex items-center gap-2 text-sm font-semibold text-primary"><Icon name="smart_toy" size={18} /> {r.is_correct ? tr("AI Explanation") : tr("AI Tutor Note")}</p>
                      <p className="text-sm leading-relaxed text-mute">{r.explanation}</p>
                    </div>
                    {!r.is_correct && (
                      <Link to={`${doc}?topic=${enc(r.topic)}&level=beginner`} className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
                        Review this topic: {r.topic} <Icon name="arrow_forward" size={16} />
                      </Link>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <div className="flex flex-wrap gap-3">
        <Button as={Link} to="/dashboard" variant="ghost" icon="dashboard">{tr("Back to Dashboard")}</Button>
        <Button variant="ghost" icon="replay" onClick={onRetake}>{tr("Retake Quiz")}</Button>
        {lessonQuiz && weak.length > 0 && <Button icon="psychology" onClick={() => startQuiz({ count: 8, focus_weak: true }, "weak")} disabled={!!busyKey}>{busyKey === "weak" ? tr("Writing questions…") : tr("Quiz my weak topics")}</Button>}
      </div>
    </div>
  );
}

export default function QuizSession() {
  const { id } = useParams();
  const { refreshStats } = useAuth();
  const key = `studymate-quiz-${id}`;
  const [quiz, setQuiz] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [flags, setFlags] = useState([]);
  const [step, setStep] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [savedAt, setSavedAt] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const startRef = useRef(Date.now());

  const reset = useCallback((q) => {
    setAnswers(Array(q.questions.length).fill(null));
    setFlags(Array(q.questions.length).fill(false));
    setStep(0);
    setElapsed(0);
    startRef.current = Date.now();
    setResult(null);
  }, []);

  useEffect(() => {
    api(`/quizzes/${id}`)
      .then((q) => {
        setQuiz(q);
        const saved = load(key);
        if (saved && saved.answers?.length === q.questions.length) {
          setAnswers(saved.answers);
          setFlags(saved.flags);
          setStep(saved.step);
          startRef.current = Date.now() - saved.elapsed * 1000;
          setElapsed(saved.elapsed);
        } else reset(q);
      })
      .catch((e) => setError(e.message));
  }, [id, key, reset]);

  useEffect(() => {
    if (!quiz || result) return;
    const t = setInterval(() => setElapsed(Math.round((Date.now() - startRef.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, [quiz, result]);

  useEffect(() => {
    if (!quiz || result || !answers.length) return;
    try {
      localStorage.setItem(key, JSON.stringify({ answers, flags, step, elapsed }));
      setSavedAt(new Date());
    } catch {}
  }, [answers, flags, step, key, quiz, result]); // elapsed intentionally omitted: saved with each answer or move

  const total = quiz?.questions.length ?? 0;
  const pick = useCallback((j) => setAnswers((a) => a.map((v, k) => (k === step ? j : v))), [step]);
  const typing = (e) => ["INPUT", "TEXTAREA"].includes(e.target.tagName);
  const blank = (a) => a === null || (typeof a === "string" && !a.trim());
  const unanswered = answers.filter(blank).length;
  const exam = quiz?.mode === "exam" && quiz.time_limit_sec > 0;
  const remaining = exam ? Math.max(0, quiz.time_limit_sec - elapsed) : 0;

  const submit = async () => {
    setBusy(true);
    setConfirm(false);
    try {
      setResult(await api(`/quizzes/${id}/attempt`, { method: "POST", json: { answers, seconds: elapsed } }));
      try { localStorage.removeItem(key); } catch {}
      refreshStats();
      window.scrollTo(0, 0);
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  };

  useEffect(() => {
    if (exam && !result && !busy && remaining === 0 && elapsed > 0) submit();
  }, [exam, remaining, elapsed]); // eslint-disable-line react-hooks/exhaustive-deps

  const next = useCallback(() => (step < total - 1 ? setStep((s) => s + 1) : unanswered ? setConfirm(true) : submit()), [step, total, unanswered]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!quiz || result || confirm) return;
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e)) return;
      const kind = quiz.questions[step].type;
      const choices = kind === "mcq" ? 4 : kind === "tf" ? 2 : 0;
      const n = ["a", "b", "c", "d"].indexOf(e.key.toLowerCase());
      const digit = Number(e.key) - 1;
      if (choices && n >= 0 && n < choices) pick(n);
      else if (choices && digit >= 0 && digit < choices) pick(digit);
      else if (e.key === "ArrowRight" || (e.key === "Enter" && choices)) next();
      else if (e.key === "ArrowLeft") setStep((s) => Math.max(0, s - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [quiz, result, confirm, pick, next, step]);

  const q = quiz?.questions[step];
  const answeredCount = total - unanswered;

  if (error && !quiz) return <Card className="mx-auto max-w-xl p-6 text-coral" role="alert">{error}</Card>;
  if (!quiz || !answers.length) return <div className="mx-auto max-w-3xl space-y-4"><Skeleton className="h-8 w-1/2" /><Skeleton className="h-40" /><Skeleton className="h-20" /><Skeleton className="h-20" /></div>;
  if (result) return <Results result={result} quiz={quiz} seconds={elapsed} onRetake={() => reset(quiz)} />;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <span className="h-2 w-2 rounded-full bg-teal" /> <span className="label">Question {step + 1} of {total}</span>
          <span className="text-faint">&bull;</span> <span className="font-normal text-mute">{quiz.title}</span>
        </p>
        <span className={`flex items-center gap-2 rounded-full px-4 py-1.5 font-mono text-sm font-semibold ${exam && remaining <= 60 ? "bg-coral/15 text-coral" : "bg-high"}`} aria-label={exam ? tr("Time left {time}", { time: clock(remaining) }) : tr("Time elapsed {time}", { time: clock(elapsed) })}>
          <Icon name="schedule" size={16} className={exam && remaining <= 60 ? "text-coral" : "text-cyan"} /> {clock(exam ? remaining : elapsed)} <span className="label text-[10px] text-faint">{exam ? tr("Left") : tr("Elapsed")}</span>
        </span>
      </div>

      <div className="mt-4 flex gap-1.5" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={step + 1}>
        {answers.map((a, i) => (
          <button key={i} onClick={() => setStep(i)} aria-label={tr("Go to question {n}", { n: i + 1 })} className={`h-1 flex-1 rounded-full transition ${i === step ? "bg-brand" : !blank(a) ? "bg-teal" : "bg-high hover:bg-highest"} ${flags[i] ? "ring-1 ring-amber" : ""}`} />
        ))}
      </div>

      <section key={step} className="pop mt-10">
        <div className="flex items-center gap-3">
          <span className="rounded-lg bg-high px-3 py-1.5 font-display text-2xl font-bold text-primary">{String(step + 1).padStart(2, "0")}</span>
          <span className="label text-mute">{tr({ mcq: "Single choice", tf: "True or false", fill: "Fill in the blank", short: "Short answer" }[q.type] || "Single choice")} &middot; {q.topic}</span>
        </div>
        <h1 className="mt-5 text-2xl font-semibold leading-snug sm:text-4xl">{q.question}</h1>
        {q.hint && <p className="mt-3 max-w-2xl text-mute">{q.hint}</p>}

        {q.type === "fill" && (
          <input
            className="mt-8 w-full rounded-2xl border border-line bg-low px-5 py-4 text-lg outline-none focus:border-brand"
            value={answers[step] ?? ""}
            onChange={(e) => pick(e.target.value)}
            placeholder={tr("Type the missing word or phrase")}
            aria-label={tr("Your answer")}
            autoComplete="off"
            onKeyDown={(e) => e.key === "Enter" && next()}
          />
        )}
        {q.type === "short" && (
          <textarea
            className="mt-8 min-h-40 w-full resize-y rounded-2xl border border-line bg-low px-5 py-4 text-lg outline-none focus:border-brand"
            value={answers[step] ?? ""}
            onChange={(e) => pick(e.target.value)}
            placeholder={tr("Write your answer in one or two sentences")}
            aria-label={tr("Your answer")}
          />
        )}
        {q.type === "tf" && (
          <div className="mt-8 grid grid-cols-2 gap-3" role="radiogroup" aria-label={tr("Answer options")}>
            {[tr("True"), tr("False")].map((o, j) => {
              const on = answers[step] === j;
              return (
                <button key={j} role="radio" aria-checked={on} onClick={() => pick(j)} className={`relative flex items-center justify-center gap-3 rounded-2xl py-6 text-xl font-semibold transition ${on ? "bg-brand text-white" : "bg-low hover:bg-card"}`}>
                  <Icon name={j === 0 ? "check" : "close"} /> {o}
                  <kbd className={`absolute right-3 top-3 hidden rounded-md px-2 py-0.5 font-mono text-[10px] sm:block ${on ? "bg-white/20" : "bg-bg text-faint"}`}>{j + 1}</kbd>
                </button>
              );
            })}
          </div>
        )}
        {(!q.type || q.type === "mcq") && (
        <div className="mt-8 space-y-3" role="radiogroup" aria-label={tr("Answer options")}>
            {q.options.map((o, j) => {
              const on = answers[step] === j;
              return (
                <button key={j} role="radio" aria-checked={on} onClick={() => pick(j)} className={`group relative flex w-full items-center gap-4 overflow-hidden rounded-2xl p-4 text-left transition sm:p-5 ${on ? "bg-high" : "bg-low hover:bg-card"}`}>
                  {on && <span className="absolute inset-y-0 left-0 w-1 bg-brand" />}
                  <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg font-bold transition ${on ? "bg-brand text-white" : "bg-high text-mute group-hover:text-ink"}`}>{LETTERS[j]}</span>
                  <span className="flex-1 text-base sm:text-lg">{o}</span>
                  {on && <Icon name="check_circle" className="text-primary" />}
                  <kbd className={`hidden rounded-md bg-bg px-2.5 py-1 font-mono text-[11px] font-semibold tracking-wider sm:block ${on ? "text-primary" : "text-faint"}`}>KEY [{LETTERS[j]}]</kbd>
                </button>
              );
            })}
          </div>
        )}

        <div className="mt-8 flex items-center justify-between text-sm font-semibold text-mute">
          <span className="flex items-center gap-2"><Icon name="lock" size={18} className="text-cyan" /> {tr("Answers autosave on this device")}</span>
          <button onClick={() => setFlags((f) => f.map((v, k) => (k === step ? !v : v)))} aria-pressed={flags[step]} className={`flex items-center gap-2 hover:text-ink ${flags[step] ? "text-amber" : ""}`}>
            <Icon name="bookmark" fill={flags[step]} size={18} /> {flags[step] ? tr("Flagged") : tr("Flag for Review")}
          </button>
        </div>
      </section>

      <div className="mt-12 flex items-center justify-between gap-3 rounded-2xl bg-low p-3 sm:p-4">
        <Button variant="plain" icon="arrow_back" onClick={() => setStep((s) => s - 1)} disabled={step === 0}>
          <span className="hidden sm:inline">{tr("Previous Question")}</span><span className="sm:hidden">{tr("Back")}</span>
        </Button>
        <span className="hidden items-center gap-2 text-xs font-semibold text-mute md:flex"><Icon name="cloud_done" size={18} className="text-cyan" /> Response saved &bull; {savedAt?.toLocaleTimeString()}</span>
        {step === total - 1 ? (
          <Button size="lg" onClick={next} disabled={busy} trailing="check">{busy ? tr("Scoring…") : tr("Submit Quiz")}</Button>
        ) : (
          <Button size="lg" onClick={next} trailing="arrow_forward">{tr("Next Question")}</Button>
        )}
      </div>
      {error && <p className="mt-4 text-center text-sm text-coral" role="alert">{error}</p>}

      <Modal open={confirm} onClose={() => setConfirm(false)} title={tr("Submit with unanswered questions?")}>
        <p className="text-mute">{unanswered} question{unanswered > 1 ? "s are" : " is"} still blank and will count as incorrect. You have answered {answeredCount} of {total}.</p>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="plain" onClick={() => { setConfirm(false); setStep(Math.max(0, answers.findIndex(blank))); }}>{tr("Go back")}</Button>
          <Button onClick={submit}>{tr("Submit anyway")}</Button>
        </div>
      </Modal>
    </div>
  );
}
