import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import Markdown from "../components/Markdown";
import { PublicShell } from "../components/Layout";
import { Button, Card, Icon, Skeleton, useToast } from "../components/ui";
import { tr } from "../lib/i18n";

/** What a friend sees when they open a share link: a read-only preview and a button to copy it into their library. */
export default function Shared() {
  const { token } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { session } = useAuth();
  const [doc, setDoc] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // public endpoint, so no sign-in header
    fetch(`/api/shared/${encodeURIComponent(token)}`)
      .then(async (r) => (r.ok ? r.json() : Promise.reject(new Error((await r.json().catch(() => ({}))).detail || "This link is not available"))))
      .then(setDoc)
      .catch((e) => setError(e.message));
  }, [token]);

  const importIt = async () => {
    setBusy(true);
    try {
      const d = await api(`/shared/${encodeURIComponent(token)}/copy`, { method: "POST" });
      toast(tr("Added to your library"));
      navigate(`/doc/${d.id}?new=1`);
    } catch (e) {
      toast(e.message, "error");
      setBusy(false);
    }
  };

  return (
    <PublicShell>
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-12 sm:px-6">
        {error ? (
          <Card className="p-8 text-center"><Icon name="link_off" size={36} className="text-faint" /><p className="mt-3 text-lg">{error}</p><Button as={Link} to="/" className="mt-5">{tr("Go to StudyMate AI")}</Button></Card>
        ) : !doc ? <Skeleton className="h-64" /> : (
          <>
            <header>
              <p className="label text-cyan">{doc.subject}</p>
              <h1 className="mt-1 text-4xl font-bold">{doc.title}</h1>
              {doc.blurb && <p className="mt-2 text-mute">{doc.blurb}</p>}
              <p className="mt-3 text-sm text-faint">{tr("Shared with you from StudyMate AI. This is a read-only preview.")}</p>
              <div className="mt-5">
                {session ? (
                  <Button icon="library_add" onClick={importIt} disabled={busy}>{tr("Copy to my library")}</Button>
                ) : (
                  <Button as={Link} to="/login" state={{ from: `/s/${token}` }} icon="login">{tr("Log in to copy this to your library")}</Button>
                )}
              </div>
            </header>
            {doc.summary && <Card className="p-6 sm:p-8"><h2 className="label mb-3 text-mute">{tr("Summary")}</h2><Markdown>{doc.summary}</Markdown></Card>}
            {doc.cards.length > 0 && (
              <Card className="p-6">
                <h2 className="label mb-3 text-mute">{tr("Flashcards")} ({doc.cards.length})</h2>
                <ul className="divide-y divide-line/30">
                  {doc.cards.map((c, i) => <li key={i} className="py-3"><p className="font-semibold">{c.front}</p><p className="text-sm text-mute">{c.back}</p></li>)}
                </ul>
              </Card>
            )}
          </>
        )}
      </div>
    </PublicShell>
  );
}
