import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button, Card, Icon, Pill, ProgressBar, Skeleton } from "../components/ui";
import { Dropzone } from "../components/Upload";
import Challenges from "../components/Challenges";
import { subjectIcon, timeAgo } from "../lib/util";
import { tr, trx } from "../lib/i18n";

/** Maps a document's study state to the card label and call to action from the Stitch dashboard. */
export function materialState(d, first = false) {
  if (d.last_quiz) {
    const pct = Math.round((100 * d.last_quiz.score) / d.last_quiz.total);
    return { meta: tr("Last quiz {pct}%", { pct }), action: { label: tr("Take Quiz"), icon: "quiz", to: `/doc/${d.id}?quiz=1`, primary: false } };
  }
  if (d.levels.length) {
    const level = ["beginner", "intermediate", "advanced"].indexOf(d.levels[d.levels.length - 1]) + 1;
    return {
      meta: first ? `Summarized ${timeAgo(d.last_active)}` : `Level ${level} Summary`,
      action: first
        ? { label: tr("Resume Study"), icon: "play_arrow", to: `/doc/${d.id}`, primary: true }
        : { label: tr("Review Summary"), icon: "article", to: `/doc/${d.id}`, primary: false },
    };
  }
  return { meta: `Uploaded ${timeAgo(d.created_at)}`, action: { label: tr("Generate Summary"), icon: "auto_awesome", to: `/doc/${d.id}?new=1`, primary: true } };
}

export function MaterialRow({ d, first }) {
  const s = materialState(d, first);
  return (
    <Card className="group flex flex-col gap-4 p-5 transition hover:border-brand/50 sm:flex-row sm:items-center sm:p-6">
      <Link to={`/doc/${d.id}`} className="flex min-w-0 flex-1 items-center gap-5">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-high text-primary"><Icon name={subjectIcon(d.subject)} size={28} /></span>
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-x-2 text-xs font-semibold">
            <span className="text-cyan">{d.subject}</span>
            <span className="text-faint">&bull; {s.meta}</span>
          </span>
          <span className="mt-0.5 block truncate font-display text-xl font-semibold group-hover:text-primary sm:text-2xl">{d.title}</span>
          {d.blurb && <span className="block truncate text-sm text-mute">{d.blurb}</span>}
        </span>
      </Link>
      <Button as={Link} to={s.action.to} variant={s.action.primary ? "primary" : "ghost"} size="sm" icon={s.action.icon} className="self-start sm:self-center">
        {s.action.label}
      </Button>
    </Card>
  );
}

function Nudge({ nudge, dueCards, onDismiss }) {
  const navigate = useNavigate();
  if (nudge) {
    return (
      <Card className="relative flex flex-col gap-4 overflow-hidden bg-gradient-to-r from-low to-teal/10 p-5 sm:flex-row sm:items-center sm:p-6">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-bg text-amber"><Icon name="lightbulb" size={24} /></span>
        <div className="flex-1">
          <p className="label text-amber">{tr("Spaced repetition")}</p>
          <p className="mt-1 text-lg">
            {nudge.days >= 2
              ? trx("You haven't reviewed {topic} in {days} days, ready for a 3-minute refresher?", { topic: <span className="font-semibold text-cyan">{nudge.topic}</span>, days: nudge.days })
              : trx("Your score on {topic} is {pct}%, ready for a 3-minute refresher?", { topic: <span className="font-semibold text-cyan">{nudge.topic}</span>, pct: nudge.pct })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={onDismiss} className="label text-mute hover:text-ink">{tr("Dismiss")}</button>
          <Button size="sm" trailing="arrow_forward" onClick={() => navigate(`/doc/${nudge.document_id}?tab=flashcards`)}>{tr("Review Now")}</Button>
        </div>
      </Card>
    );
  }
  if (dueCards > 0) {
    return (
      <Card className="flex flex-col gap-4 bg-gradient-to-r from-low to-teal/10 p-5 sm:flex-row sm:items-center sm:p-6">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-bg text-amber"><Icon name="style" size={24} /></span>
        <p className="flex-1 text-lg">{trx(dueCards > 1 ? "{n} flashcards are due for review today." : "{n} flashcard is due for review today.", { n: <span className="font-semibold text-cyan">{dueCards}</span> })}</p>
        <Button as={Link} to="/library" size="sm" trailing="arrow_forward">{tr("Open Library")}</Button>
      </Card>
    );
  }
  return null;
}

export default function Dashboard() {
  const { name, refreshStats } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [dismissed, setDismissed] = useState(false);
  const [exam, setExam] = useState(null); // the nearest upcoming exam, if the student added one

  useEffect(() => {
    api("/dashboard").then(setData).catch((e) => setError(e.message));
    api("/planner").then((p) => setExam(p.exams[0] || null)).catch(() => {});
    refreshStats(false);
  }, [refreshStats]);

  if (error) return <Card className="p-6 text-coral" role="alert">{error}</Card>;

  const goal = data?.profile.daily_goal_xp ?? 100;
  const today = data?.xp_today ?? 0;

  return (
    <div className="mx-auto max-w-4xl space-y-10">
      <section className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-4xl font-bold sm:text-5xl">{tr("Welcome back, {name}", { name })}</h1>
          <p className="mt-2 text-lg text-mute">{tr("Ready to focus on your studies today?")}</p>
        </div>
        <div className="w-full shrink-0 rounded-2xl bg-low p-4 sm:w-64">
          <div className="mb-2 flex items-baseline justify-between text-sm">
            <span className="font-semibold">{tr("Daily XP")}</span>
            <span className="font-semibold text-cyan">{today}/{goal}</span>
          </div>
          <ProgressBar value={(100 * today) / goal} />
          <p className="mt-2 flex items-center gap-1 text-xs text-mute">
            <Icon name="local_fire_department" fill size={14} className="text-amber" />
            {data ? (data.streak ? tr("{n}-day streak", { n: data.streak }) : tr("Study today to start a streak")) : "…"}
          </p>
        </div>
      </section>

      {!data ? (
        <Skeleton className="h-28" />
      ) : (
        !dismissed && <Nudge nudge={data.nudge} dueCards={data.due_cards} onDismiss={() => setDismissed(true)} />
      )}

      <Dropzone />

      <section className="grid gap-6 md:grid-cols-2">
        <div>
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-2xl font-semibold">{tr("Today's challenges")}</h2>
            <Link to="/achievements" className="label flex items-center gap-1 text-mute hover:text-ink">{tr("Badges")} <Icon name="arrow_forward" size={16} /></Link>
          </div>
          <Challenges />
        </div>
        <div className="space-y-4">
          <h2 className="text-2xl font-semibold">{tr("Level and exam")}</h2>
          {data ? (
            <Link to="/achievements" className="block rounded-2xl border border-line/40 bg-low p-5 transition hover:border-brand/60">
              <div className="flex items-center gap-4">
                <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-brand font-display text-xl font-bold text-white">{data.level}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{tr("Level {n}", { n: data.level })}</p>
                  <ProgressBar value={(100 * data.xp_into) / data.xp_span} className="mt-2" />
                  <p className="mt-1 text-xs text-mute">{tr("{n} XP to level {next}", { n: data.xp_span - data.xp_into, next: data.level + 1 })} &middot; {tr(data.freezes_left === 1 ? "{n} streak freeze left" : "{n} streak freezes left", { n: data.freezes_left })}</p>
                </div>
              </div>
            </Link>
          ) : <Skeleton className="h-24" />}
          <Link to="/planner" className="block rounded-2xl border border-line/40 bg-low p-5 transition hover:border-brand/60">
            {exam ? (
              <div className="flex items-center gap-4">
                <span className={`font-display text-4xl font-bold ${exam.days_left <= 3 ? "text-coral" : exam.days_left <= 7 ? "text-amber" : "text-cyan"}`}>{exam.days_left}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{exam.name}</p>
                  <p className="text-xs text-mute">{exam.days_left === 1 ? tr("day left") : tr("days left")} &middot; {tr("{n} min planned today", { n: exam.minutes })}</p>
                </div>
                <Icon name="chevron_right" className="text-faint" />
              </div>
            ) : (
              <p className="flex items-center gap-3 text-mute"><Icon name="event" className="text-primary" /> {tr("Add an exam date and get a daily study plan.")}</p>
            )}
          </Link>
        </div>
      </section>

      <section>
        <div className="mb-5 flex items-baseline justify-between gap-4">
          <h2 className="text-2xl font-semibold sm:text-3xl">
            {tr("Active & Recent Material")}{" "}
            {data && data.materials.length > 0 && <span className="ml-2 text-xs font-semibold text-faint">{tr("{n} in library", { n: data.doc_count })}</span>}
          </h2>
          <Link to="/library" className="label flex items-center gap-1 text-mute hover:text-ink">{tr("View All")} <Icon name="arrow_forward" size={16} /></Link>
        </div>
        {!data ? (
          <div className="space-y-4"><Skeleton className="h-28" /><Skeleton className="h-28" /></div>
        ) : data.materials.length === 0 ? (
          <Card className="border-dashed p-10 text-center text-mute">
            <Pill tone="primary" icon="tips_and_updates" className="mb-3">{tr("Start here")}</Pill>
            <p>{tr("Nothing in your library yet. Upload your first notes above and your summaries, flashcards and quizzes will appear here.")}</p>
          </Card>
        ) : (
          <div className="space-y-4">{data.materials.map((d, i) => <MaterialRow key={d.id} d={d} first={i === 0} />)}</div>
        )}
      </section>
    </div>
  );
}
