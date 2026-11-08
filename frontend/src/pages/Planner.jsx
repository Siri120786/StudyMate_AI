import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Button, Card, EmptyState, Field, Icon, Modal, ProgressBar, Skeleton, inputClass, useToast } from "../components/ui";
import { tr } from "../lib/i18n";

const enc = encodeURIComponent;

/** Where each kind of task sends the student. */
function taskLink(t) {
  const doc = `/doc/${t.doc}`;
  if (t.kind === "read") return `${doc}?topic=${enc(t.topic)}&level=intermediate`;
  if (t.kind === "check") return `${doc}?quiz=1&topic=${enc(t.topic)}`;
  if (t.kind === "mock") return `${doc}?quiz=1&exam=1`;
  return `${doc}?tab=flashcards`;
}

const TASK = {
  read: { icon: "article", text: "Read: {topic}" },
  check: { icon: "quiz", text: "Quiz yourself: {topic}" },
  cards: { icon: "style", text: "Review {n} flashcards" },
  make_cards: { icon: "auto_awesome", text: "Make flashcards" },
  mock: { icon: "timer", text: "Take a timed mock exam" },
};

function Countdown({ days }) {
  const tone = days <= 3 ? "text-coral" : days <= 7 ? "text-amber" : "text-cyan";
  return (
    <div className="text-center">
      <p className={`font-display text-5xl font-bold leading-none ${tone}`}>{days}</p>
      <p className="label mt-1 text-mute">{days === 1 ? tr("day left") : days === 0 ? tr("today") : tr("days left")}</p>
    </div>
  );
}

function AddExam({ open, onClose, onAdded }) {
  const [docs, setDocs] = useState(null);
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [picked, setPicked] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

  useEffect(() => {
    if (open && !docs) api("/documents").then(setDocs).catch((e) => setError(e.message));
  }, [open, docs]);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/exams", { method: "POST", json: { name, exam_date: date, document_ids: picked } });
      setName(""); setDate(""); setPicked([]);
      onAdded();
      onClose();
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  };

  return (
    <Modal open={open} onClose={onClose} title={tr("Add an exam")}>
      <form onSubmit={save} className="space-y-4">
        <Field label={tr("Exam name")}><input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder={tr("Biology final")} maxLength={80} required autoFocus /></Field>
        <Field label={tr("Exam date")}><input className={inputClass} type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} required /></Field>
        <Field label={tr("Which notes does it cover?")} hint={tr("Leave all unticked to include your whole library.")}>
          {!docs ? <Skeleton className="h-20" /> : (
            <ul className="max-h-44 space-y-1 overflow-y-auto rounded-xl border border-line p-2">
              {docs.map((d) => (
                <li key={d.id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 hover:bg-high">
                    <input type="checkbox" className="h-4 w-4 accent-[#6c5ce7]" checked={picked.includes(d.id)} onChange={() => setPicked((p) => (p.includes(d.id) ? p.filter((x) => x !== d.id) : [...p, d.id]))} />
                    <span className="min-w-0 flex-1 truncate">{d.title}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </Field>
        {error && <p role="alert" className="text-sm text-coral">{error}</p>}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="plain" onClick={onClose}>{tr("Cancel")}</Button>
          <Button type="submit" disabled={busy || !name.trim() || !date} icon="event">{tr("Add exam")}</Button>
        </div>
      </form>
    </Modal>
  );
}

export default function Planner() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => api("/planner").then(setData).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);

  const remove = async (e) => {
    if (!confirm(tr("Remove this exam from your planner?"))) return;
    try {
      await api(`/exams/${e.id}`, { method: "DELETE" });
      load();
    } catch (err) {
      toast(err.message, "error");
    }
  };

  if (error) return <Card className="p-6 text-coral" role="alert">{error}</Card>;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="label text-primary">{tr("Exam planner")}</p>
          <h1 className="mt-1 text-4xl font-bold">{tr("Your study plan")}</h1>
          <p className="mt-2 max-w-xl text-lg text-mute">{tr("Add an exam date and get a short list of what to do today. The plan shrinks as you study and focuses on your weak topics first.")}</p>
        </div>
        <Button icon="add" onClick={() => setAdding(true)}>{tr("Add exam")}</Button>
      </header>

      {!data ? <Skeleton className="h-64" /> : data.exams.length === 0 ? (
        <EmptyState icon="event" title={tr("No exams yet")} body={tr("Pick a date and the notes it covers. StudyMate will spread the reading, quizzes and flashcards across the days you have.")} action={<Button icon="add" onClick={() => setAdding(true)}>{tr("Add your first exam")}</Button>} />
      ) : (
        <>
          <p className="text-mute">{tr("About {n} minutes of study planned for today.", { n: data.minutes_today })}</p>
          <div className="space-y-6">
            {data.exams.map((e) => (
              <Card key={e.id} className="overflow-hidden">
                <div className="flex items-center gap-5 border-b border-line/30 p-5 sm:p-6">
                  <Countdown days={e.days_left} />
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-2xl font-semibold">{e.name}</h2>
                    <p className="text-sm text-mute">{new Date(e.exam_date + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })} &middot; {tr(e.doc_count === 1 ? "{n} set of notes" : "{n} sets of notes", { n: e.doc_count })}</p>
                    <div className="mt-3 flex items-center gap-3">
                      <ProgressBar value={e.progress} className="flex-1" />
                      <span className="w-12 text-right font-mono text-xs text-mute">{e.progress}%</span>
                    </div>
                  </div>
                  <button onClick={() => remove(e)} aria-label={tr("Remove exam")} className="grid h-10 w-10 place-items-center rounded-full text-faint hover:bg-coral/10 hover:text-coral"><Icon name="delete" size={20} /></button>
                </div>
                <div className="p-5 sm:p-6">
                  {e.tasks.length === 0 ? (
                    <p className="flex items-center gap-2 text-cyan"><Icon name="task_alt" /> {e.remaining === 0 ? tr("Everything is covered. Keep your flashcards fresh until the exam.") : tr("Nothing left for today.")}</p>
                  ) : (
                    <>
                      <p className="label mb-3 text-mute">{tr("Today")} &middot; {tr("{n} min", { n: e.minutes })}</p>
                      <ul className="space-y-2">
                        {e.tasks.map((t, i) => (
                          <li key={i}>
                            <Link to={taskLink(t)} className="group flex items-center gap-3 rounded-xl bg-low px-4 py-3 transition hover:bg-high">
                              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-high text-primary group-hover:bg-card"><Icon name={TASK[t.kind].icon} size={18} /></span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate font-medium">{tr(TASK[t.kind].text, { topic: t.topic, n: t.due })}</span>
                                <span className="block truncate text-xs text-faint">{t.doc_title}{t.weak ? ` · ${tr("weak topic")}` : ""}</span>
                              </span>
                              <span className="text-xs text-mute">{tr("{n} min", { n: t.minutes })}</span>
                              <Icon name="chevron_right" size={18} className="text-faint" />
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
      <AddExam open={adding} onClose={() => setAdding(false)} onAdded={load} />
    </div>
  );
}
