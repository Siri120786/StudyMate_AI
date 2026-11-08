import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { BADGE_TEXT } from "../lib/badges";
import Challenges from "../components/Challenges";
import { Card, Icon, ProgressBar, Skeleton } from "../components/ui";
import { tr, trx } from "../lib/i18n";

export default function Achievements() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api("/achievements").then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <Card className="p-6 text-coral" role="alert">{error}</Card>;
  const earned = data?.badges.filter((b) => b.earned).length ?? 0;

  return (
    <div className="mx-auto max-w-4xl space-y-10">
      <header>
        <p className="label text-primary">{tr("Progress")}</p>
        <h1 className="mt-1 text-4xl font-bold">{tr("Achievements")}</h1>
        <p className="mt-2 text-lg text-mute">{tr("Earn XP to level up, keep a streak, and collect badges as you study.")}</p>
      </header>

      {!data ? <Skeleton className="h-40" /> : (
        <Card className="ai-border grid gap-6 p-6 sm:grid-cols-[auto_1fr] sm:items-center sm:p-8">
          <div className="grid h-24 w-24 place-items-center rounded-full bg-brand text-white shadow-[0_12px_30px_-10px_rgb(108_92_231/0.9)]">
            <div className="text-center">
              <p className="label text-[10px] text-white/70">{tr("Level")}</p>
              <p className="font-display text-4xl font-bold leading-none">{data.level}</p>
            </div>
          </div>
          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-lg font-semibold">{tr("{n} XP in total", { n: data.xp_total })}</p>
              <p className="text-sm text-mute">{tr("{n} XP to level {next}", { n: data.xp_span - data.xp_into, next: data.level + 1 })}</p>
            </div>
            <ProgressBar value={(100 * data.xp_into) / data.xp_span} className="mt-3" />
            <div className="mt-4 flex flex-wrap gap-3 text-sm">
              <span className="flex items-center gap-2 rounded-full bg-high px-4 py-2 font-semibold"><Icon name="local_fire_department" fill size={18} className="text-amber" /> {tr("{n}-day streak", { n: data.streak })}</span>
              <span className="flex items-center gap-2 rounded-full bg-high px-4 py-2 font-semibold" title={tr("A streak freeze covers one missed day. You get another every third level.")}><Icon name="ac_unit" size={18} className="text-cyan" /> {tr(data.freezes_left === 1 ? "{n} streak freeze left" : "{n} streak freezes left", { n: data.freezes_left })}</span>
            </div>
          </div>
        </Card>
      )}

      <section>
        <h2 className="mb-4 text-2xl font-semibold">{tr("Today's challenges")}</h2>
        <Challenges />
      </section>

      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-2xl font-semibold">{tr("Badges")}</h2>
          {data && <span className="text-sm text-mute">{trx("{n} earned", { n: <b className="text-ink">{earned}/{data.badges.length}</b> })}</span>}
        </div>
        {!data ? <Skeleton className="h-48" /> : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.badges.map((b) => {
              const [name, how] = BADGE_TEXT[b.id] || [b.id, ""];
              return (
                <li key={b.id} className={`rounded-2xl border p-4 transition ${b.earned ? "border-teal/40 bg-teal/5" : "border-line/40 bg-low opacity-75"}`}>
                  <div className="flex items-start gap-3">
                    <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${b.earned ? "bg-brand text-white" : "bg-high text-faint"}`}>
                      <Icon name={b.earned ? b.icon : "lock"} fill={b.earned} size={22} />
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold">{tr(name)}</p>
                      <p className="text-sm text-mute">{tr(how)}</p>
                    </div>
                  </div>
                  {!b.earned && (
                    <div className="mt-3 flex items-center gap-3">
                      <ProgressBar value={(100 * b.value) / b.target} className="flex-1" />
                      <span className="font-mono text-xs text-mute">{Math.floor(b.value)}/{b.target}</span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
