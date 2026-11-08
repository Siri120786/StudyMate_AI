import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { Button, Card, EmptyState, Field, Icon, Skeleton, inputClass, useToast } from "../components/ui";
import { tr } from "../lib/i18n";

export default function Groups() {
  const toast = useToast();
  const [groups, setGroups] = useState(null);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api("/groups").then(setGroups).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);

  const act = async (fn, done) => {
    setBusy(true);
    try {
      await fn();
      if (done) toast(done);
      await load();
    } catch (e) {
      toast(e.message, "error");
    }
    setBusy(false);
  };

  const create = (e) => { e.preventDefault(); act(async () => { await api("/groups", { method: "POST", json: { name } }); setName(""); }, tr("Group created")); };
  const join = (e) => { e.preventDefault(); act(async () => { await api("/groups/join", { method: "POST", json: { code } }); setCode(""); }, tr("Joined the group")); };
  const leave = (g) => confirm(tr("Leave this group?")) && act(() => api(`/groups/${g.id}/leave`, { method: "DELETE" }));
  const copy = async (g) => { try { await navigator.clipboard.writeText(g.code); toast(tr("Code copied")); } catch { toast(g.code); } };

  if (error) return <Card className="p-6 text-coral" role="alert">{error}</Card>;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header>
        <p className="label text-primary">{tr("Study together")}</p>
        <h1 className="mt-1 text-4xl font-bold">{tr("Study groups")}</h1>
        <p className="mt-2 max-w-2xl text-lg text-mute">{tr("Make a group, share its code with friends, and see who earned the most XP this week. Members see each other's display name and weekly XP, nothing else.")}</p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <form onSubmit={create} className="space-y-3">
            <Field label={tr("Start a group")}><input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder={tr("Class 10 revision")} maxLength={50} required /></Field>
            <Button type="submit" icon="group_add" disabled={busy || name.trim().length < 2}>{tr("Create group")}</Button>
          </form>
        </Card>
        <Card className="p-5">
          <form onSubmit={join} className="space-y-3">
            <Field label={tr("Join with a code")}><input className={`${inputClass} font-mono uppercase tracking-widest`} value={code} onChange={(e) => setCode(e.target.value)} placeholder="ABC234" maxLength={12} required /></Field>
            <Button type="submit" variant="ghost" icon="login" disabled={busy || code.trim().length < 4}>{tr("Join group")}</Button>
          </form>
        </Card>
      </div>

      {!groups ? <Skeleton className="h-48" /> : groups.length === 0 ? (
        <EmptyState icon="groups" title={tr("No groups yet")} body={tr("Create one above, or ask a friend for their code.")} />
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <Card key={g.id} className="overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/30 p-5">
                <div>
                  <h2 className="text-2xl font-semibold">{g.name}</h2>
                  <p className="text-sm text-mute">{tr(g.members.length === 1 ? "{n} member" : "{n} members", { n: g.members.length })} &middot; {tr("this week")}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => copy(g)} className="flex items-center gap-2 rounded-full bg-high px-4 py-2 font-mono text-sm font-semibold tracking-widest hover:text-primary" title={tr("Copy the group code")}>{g.code} <Icon name="content_copy" size={16} /></button>
                  <Button size="sm" variant="plain" onClick={() => leave(g)} disabled={busy}>{tr("Leave")}</Button>
                </div>
              </div>
              <ol className="divide-y divide-line/30">
                {g.members.map((m, i) => (
                  <li key={i} className={`flex items-center gap-4 px-5 py-3 ${m.you ? "bg-brand/10" : ""}`}>
                    <span className={`grid h-8 w-8 place-items-center rounded-full font-display text-sm font-bold ${i === 0 && m.xp > 0 ? "bg-amber text-[#3a2600]" : "bg-high text-mute"}`}>{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate font-medium">{m.name}{m.you ? ` (${tr("you")})` : ""}</span>
                    <span className="text-sm text-mute">{tr("{n} min", { n: m.minutes })}</span>
                    <span className="w-20 text-right font-semibold text-cyan">{m.xp} XP</span>
                  </li>
                ))}
              </ol>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
