import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useNavigate } from "react-router-dom";
import { Button, Card, EmptyState, Field, Icon, Modal, Pill, Skeleton } from "../components/ui";
import QuizOptions from "../components/QuizOptions";
import { timeAgo } from "../lib/util";
import { tr } from "../lib/i18n";

function MixedQuiz({ open, onClose }) {
  const navigate = useNavigate();
  const [docs, setDocs] = useState(null);
  const [picked, setPicked] = useState([]);
  const [count, setCount] = useState(12);
  const [types, setTypes] = useState(["mcq"]);
  const [exam, setExam] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open && !docs) api("/documents").then(setDocs).catch((e) => setError(e.message));
  }, [open, docs]);

  const start = async () => {
    setBusy(true);
    setError("");
    try {
      const q = await api("/quizzes/mixed", { method: "POST", json: { document_ids: picked, count, types, exam } });
      navigate(`/quiz/${q.id}`);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <Modal open={open} onClose={busy ? () => {} : onClose} title={tr("Mixed quiz")} wide>
      <div className="space-y-5">
        <Field label={tr("Choose the notes to mix")} hint={tr("Pick at least two. Great for revising a whole subject.")}>
          {!docs ? <Skeleton className="h-24" /> : (
            <ul className="max-h-52 space-y-1 overflow-y-auto rounded-xl border border-line p-2">
              {docs.map((d) => (
                <li key={d.id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 hover:bg-high">
                    <input type="checkbox" checked={picked.includes(d.id)} onChange={() => toggle(d.id)} className="h-4 w-4 accent-[#6c5ce7]" />
                    <span className="min-w-0 flex-1 truncate">{d.title}</span>
                    <span className="text-xs text-faint">{d.subject}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </Field>
        <QuizOptions types={types} setTypes={setTypes} exam={exam} setExam={setExam} count={count} />
        <Field label={tr("Number of questions")}>
          <div className="flex gap-2">
            {[8, 12, 16, 20].map((n) => (
              <button key={n} onClick={() => setCount(n)} aria-pressed={count === n} className={`flex-1 rounded-xl border py-2.5 font-semibold transition ${count === n ? "border-brand bg-brand/20 text-primary" : "border-line text-mute hover:text-ink"}`}>{n}</button>
            ))}
          </div>
        </Field>
        {error && <p role="alert" className="text-sm text-coral">{error}</p>}
        <div className="flex justify-end gap-3">
          <Button variant="plain" onClick={onClose} disabled={busy}>{tr("Cancel")}</Button>
          <Button onClick={start} disabled={busy || picked.length < 2} icon="auto_awesome">{busy ? tr("Writing {count} questions…", { count }) : tr("Start quiz")}</Button>
        </div>
      </div>
    </Modal>
  );
}

export default function Quizzes() {
  const [mixed, setMixed] = useState(false);
  const [quizzes, setQuizzes] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/quizzes").then(setQuizzes).catch((e) => setError(e.message));
  }, []);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header>
        <h1 className="text-4xl font-bold">{tr("Quizzes")}</h1>
        <p className="mt-2 text-lg text-mute">{tr("Active recall is the fastest way to lock in what you read. Retake any quiz to beat your score.")}</p>
        <Button className="mt-5" variant="ghost" icon="library_add" onClick={() => setMixed(true)}>{tr("New mixed quiz")}</Button>
      </header>
      <MixedQuiz open={mixed} onClose={() => setMixed(false)} />
      {error && <Card className="p-5 text-coral" role="alert">{error}</Card>}
      {!quizzes && !error && <div className="space-y-4"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>}
      {quizzes?.length === 0 && (
        <EmptyState icon="quiz" title={tr("No quizzes yet")} body={tr("Open any set of notes and choose Generate Quiz. Questions are written from your own material.")} action={<Button as={Link} to="/library" icon="auto_stories">{tr("Open Library")}</Button>} />
      )}
      <div className="space-y-4">
        {quizzes?.map((q) => {
          const pct = q.last ? Math.round((100 * q.last.score) / q.last.total) : null;
          return (
            <Card key={q.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
              <div className="min-w-0 flex-1">
                <p className="label text-cyan">{q.subject || tr("Quiz")}</p>
                <h2 className="mt-0.5 flex items-center gap-2 text-xl font-semibold"><span className="truncate">{q.title}</span>{q.mode === "exam" && <Pill tone="amber" icon="timer">{tr("Mock exam")}</Pill>}{q.scope === "mixed" && <Pill icon="library_add">{tr("Mixed")}</Pill>}</h2>
                <p className="mt-1 text-sm text-mute">From {q.doc_title || "deleted notes"} &bull; {q.question_count} questions &bull; {timeAgo(q.created_at)}</p>
              </div>
              {pct !== null ? <Pill tone={pct >= 80 ? "cyan" : pct >= 60 ? "amber" : "coral"}>Last {pct}% &middot; {q.attempts} attempt{q.attempts > 1 ? "s" : ""}</Pill> : <Pill>{tr("Not attempted")}</Pill>}
              <Button as={Link} to={`/quiz/${q.id}`} variant={pct === null ? "primary" : "ghost"} size="sm" icon={pct === null ? "play_arrow" : "replay"}>{pct === null ? tr("Start") : tr("Retake")}</Button>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
