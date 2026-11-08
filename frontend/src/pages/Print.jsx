import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import Markdown from "../components/Markdown";
import { tr } from "../lib/i18n";

const LEVEL_ORDER = ["intermediate", "beginner", "advanced"];

/** A plain white page for the browser's Print dialog. Choosing "Save as PDF" there makes a PDF in any language. */
export default function Print() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const what = ["cards", "cheatsheet"].includes(params.get("what")) ? params.get("what") : "summary";
  const topic = params.get("topic") || "";
  const [doc, setDoc] = useState(null);
  const [cards, setCards] = useState([]);
  const [sheet, setSheet] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api(`/documents/${id}`), what === "cards" ? api(`/documents/${id}/flashcards`) : { cards: [] }, what === "cheatsheet" ? api(`/documents/${id}/cheatsheet`) : { content: "" }])
      .then(([d, c, x]) => { setDoc(d); setCards(c.cards); setSheet(x.content || ""); })
      .catch((e) => setError(e.message));
  }, [id, what]);

  const level = params.get("level");
  const byLevel = topic ? doc?.topic_summaries?.[topic] : doc?.summaries;
  const useLevel = byLevel && (byLevel[level] ? level : LEVEL_ORDER.find((l) => byLevel[l]));
  const body = useLevel ? byLevel[useLevel] : "";
  const ready = doc && (what === "cards" ? cards.length > 0 : what === "cheatsheet" ? !!sheet : !!body);

  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => window.print(), 600);
    return () => clearTimeout(t);
  }, [ready]);

  if (error) return <p className="p-8 text-coral" role="alert">{error}</p>;
  if (!doc) return <p className="p-8 text-mute">{tr("Preparing your document…")}</p>;

  return (
    <div className="light min-h-screen bg-white text-black">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="mb-8 flex items-center justify-between gap-3 print:hidden">
          <Link to={`/doc/${id}`} className="text-sm font-semibold text-[#5341cd] hover:underline">{tr("Back to the notes")}</Link>
          <button onClick={() => window.print()} className="rounded-full bg-[#6c5ce7] px-5 py-2 text-sm font-semibold text-white">{tr("Print or save as PDF")}</button>
        </div>
        <header className="mb-8 border-b border-neutral-300 pb-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">{doc.subject}</p>
          <h1 className="text-3xl font-bold">{doc.title}{topic ? `: ${topic}` : ""}</h1>
          {what === "summary" && useLevel && <p className="mt-1 text-sm capitalize text-neutral-500">{tr(useLevel)}</p>}
        </header>

        {what === "cheatsheet" ? (
          sheet ? <Markdown>{sheet}</Markdown> : <p className="text-neutral-600">{tr("There is no cheat sheet to print yet.")}</p>
        ) : what === "summary" ? (
          body ? <Markdown>{body}</Markdown> : <p className="text-neutral-600">{tr("There is no summary to print yet. Open the notes and generate one first.")}</p>
        ) : cards.length === 0 ? (
          <p className="text-neutral-600">{tr("There are no flashcards to print yet.")}</p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-neutral-400 text-left">
                <th className="w-1/2 py-2 pr-4">{tr("Front")}</th>
                <th className="py-2">{tr("Back")}</th>
              </tr>
            </thead>
            <tbody>
              {cards.map((c) => (
                <tr key={c.id} className="break-inside-avoid border-b border-neutral-300 align-top">
                  <td className="py-3 pr-4 font-semibold">{c.front}</td>
                  <td className="py-3">{c.back}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <footer className="mt-10 border-t border-neutral-300 pt-3 text-xs text-neutral-500">{tr("Made with StudyMate AI")}</footer>
      </div>
    </div>
  );
}
