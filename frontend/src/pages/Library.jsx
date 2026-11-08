import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Button, Card, EmptyState, Icon, Skeleton, inputClass } from "../components/ui";
import { PasteModal } from "../components/Upload";
import { MaterialRow } from "./Dashboard";
import { L, tr } from "../lib/i18n";

const SORTS = { recent: L("Recently active"), title: L("Title (A to Z)"), newest: L("Newest upload") };

export default function Library() {
  const [docs, setDocs] = useState(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState(tr("All"));
  const [sort, setSort] = useState("recent");
  const [paste, setPaste] = useState(false);
  const [hits, setHits] = useState(null); // passages from inside the notes that match the search

  useEffect(() => {
    api("/documents").then(setDocs).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) return setHits(null);
    const t = setTimeout(() => api(`/search?q=${encodeURIComponent(q)}`).then((r) => setHits(r.results)).catch(() => setHits(null)), 400);
    return () => clearTimeout(t);
  }, [query]);

  const subjects = useMemo(() => ["All", ...new Set((docs || []).map((d) => d.subject))], [docs]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = (docs || []).filter(
      (d) => (subject === "All" || d.subject === subject) && (!q || `${d.title} ${d.subject} ${d.blurb}`.toLowerCase().includes(q))
    );
    if (sort === "title") rows.sort((a, b) => a.title.localeCompare(b.title));
    if (sort === "newest") rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
    return rows;
  }, [docs, query, subject, sort]);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-4xl font-bold">{tr("Library")}</h1>
          <p className="mt-2 text-lg text-mute">{tr("Every set of notes you have uploaded, with its study progress.")}</p>
        </div>
        <Button icon="add" onClick={() => setPaste(true)}>{tr("Add notes")}</Button>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Icon name="search" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-faint" size={20} />
          <input className={`${inputClass} pl-11`} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tr("Search titles, subjects and what is inside your notes")} aria-label={tr("Search library")} />
        </div>
        <select className={`${inputClass} sm:w-52`} value={sort} onChange={(e) => setSort(e.target.value)} aria-label={tr("Sort library")}>
          {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{tr(v)}</option>)}
        </select>
      </div>

      {hits && hits.length > 0 && (
        <section aria-label={tr("Matches inside your notes")}>
          <h2 className="label mb-3 text-mute">{tr("Found inside your notes")}</h2>
          <ul className="space-y-2">
            {hits.map((h, i) => (
              <li key={i}>
                <Link to={`/doc/${h.doc}?tab=notes`} className="block rounded-xl border border-line/40 bg-low p-4 transition hover:border-brand/60">
                  <p className="text-sm font-semibold text-cyan">{h.title}</p>
                  <p className="mt-1 line-clamp-3 text-sm text-mute">{h.text}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {subjects.length > 2 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label={tr("Filter by subject")}>
          {subjects.map((s) => (
            <button key={s} onClick={() => setSubject(s)} aria-pressed={subject === s} className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${subject === s ? "border-brand bg-brand/20 text-primary" : "border-line text-mute hover:text-ink"}`}>
              {s}
            </button>
          ))}
        </div>
      )}

      {error && <Card className="p-5 text-coral" role="alert">{error}</Card>}
      {!docs && !error && <div className="space-y-4"><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div>}
      {docs && docs.length === 0 && (
        <EmptyState icon="auto_stories" title={tr("Your library is empty")} body={tr("Add notes or upload a PDF and StudyMate will turn them into summaries, flashcards and quizzes.")} action={<Button icon="add" onClick={() => setPaste(true)}>{tr("Add notes")}</Button>} />
      )}
      {docs && docs.length > 0 && shown.length === 0 && <EmptyState icon="search_off" title={tr("No matches")} body={tr("Try a different search or clear the subject filter.")} />}
      <div className="space-y-4">{shown.map((d) => <MaterialRow key={d.id} d={d} first={false} />)}</div>
      <PasteModal open={paste} onClose={() => setPaste(false)} />
    </div>
  );
}
