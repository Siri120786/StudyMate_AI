import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { Button, Card, Icon, Modal, ProgressBar, Ring, Skeleton, useToast } from "../components/ui";
import Markdown from "../components/Markdown";
import { downloadFile, masteryStatus, subjectIcon, timeAgo } from "../lib/util";
import { L, tr, trx } from "../lib/i18n";

const RANGES = [
  { days: 7, label: "7 Days" },
  { days: 30, label: L("Last 30 Days") },
  { days: 180, label: L("Semester") },
];
const DAY = 86400000;
const TONE = { cyan: "text-cyan", primary: "text-primary", amber: "text-amber", coral: "text-coral" };
const BAR = { cyan: "cyan", primary: "primary", amber: "amber", coral: "coral" };
const hm = (min) => `${Math.floor(min / 60)}h ${String(Math.round(min % 60)).padStart(2, "0")}m`;
const sum = (rows, f) => rows.reduce((s, r) => s + f(r), 0);
const pctDelta = (now, before) => (before > 0 ? Math.round(((now - before) / before) * 100) : null);

function Delta({ value, suffix = "vs prior cycle" }) {
  if (value === null) return <span className="text-xs font-semibold text-faint">{tr("No prior data yet")}</span>;
  return (
    <span className={`flex items-center gap-1 text-xs font-semibold ${value >= 0 ? "text-cyan" : "text-coral"}`}>
      <Icon name={value >= 0 ? "trending_up" : "trending_down"} size={16} /> {value >= 0 ? "+" : ""}{value}% {suffix}
    </span>
  );
}

function buildIcs(startHour) {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(startHour, 0, 0, 0);
  const f = (x) => x.toISOString().replace(/[-:]|\.\d{3}/g, "");
  const end = new Date(d.getTime() + 3600000);
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//StudyMate AI//EN", "BEGIN:VEVENT", `UID:${crypto.randomUUID()}@studymate`, `DTSTAMP:${f(new Date())}`, `DTSTART:${f(d)}`, `DTEND:${f(end)}`, "RRULE:FREQ=DAILY", "SUMMARY:StudyMate focus block", "DESCRIPTION:Your peak focus window. Tackle the hardest topic first.", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
}

export default function Analytics() {
  const navigate = useNavigate();
  const toast = useToast();
  const [range, setRange] = useState(30);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [plan, setPlan] = useState(null);
  const [planBusy, setPlanBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [practiceBusy, setPracticeBusy] = useState("");

  useEffect(() => {
    setData(null);
    api(`/analytics?days=${Math.min(range * 2, 400)}`).then(setData).catch((e) => setError(e.message));
  }, [range]);

  const m = useMemo(() => {
    if (!data) return null;
    const cutoff = Date.now() - range * DAY;
    const cur = (r) => new Date(r.t).getTime() >= cutoff;
    const ev = data.events.filter(cur), evPrev = data.events.filter((r) => !cur(r));
    const at = data.attempts.filter(cur), atPrev = data.attempts.filter((r) => !cur(r));
    const minutes = sum(ev, (e) => e.minutes), minutesPrev = sum(evPrev, (e) => e.minutes);
    const acc = (rows) => (sum(rows, (a) => a.total) ? (100 * sum(rows, (a) => a.score)) / sum(rows, (a) => a.total) : null);

    // Last seven local days for the stacked chart and the sparkline.
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - (6 - i));
      return { d, review: 0, deep: 0 };
    });
    for (const e of data.events) {
      const t = new Date(e.t);
      const slot = days.find((x) => t >= x.d && t < new Date(x.d.getTime() + DAY));
      if (slot) slot[e.kind === "summary" ? "deep" : "review"] += e.minutes;
    }
    const weekMin = sum(days, (x) => x.review + x.deep);

    // Peak window: the three consecutive local hours holding the most study minutes.
    const hours = Array(24).fill(0);
    for (const e of ev) hours[new Date(e.t).getHours()] += e.minutes;
    let peak = null;
    if (sum(hours, (h) => h) > 0) {
      let best = -1;
      for (let h = 0; h < 24; h++) {
        const v = hours[h] + hours[(h + 1) % 24] + hours[(h + 2) % 24];
        if (v > best) (best = v), (peak = h);
      }
    }
    let velocity = null;
    if (peak !== null) {
      const inWin = (a) => ((new Date(a.t).getHours() - peak + 24) % 24) < 3;
      const a = at.filter(inWin), b = at.filter((x) => !inWin(x));
      if (a.length && b.length && acc(b)) velocity = Math.round(acc(a) - acc(b));
    }

    const weak = data.topics.filter((t) => t.pct < 75);
    const avg = data.topics.length ? Math.round(sum(data.topics, (t) => t.pct) / data.topics.length) : null;
    return { minutes, minutesPrev, acc: acc(at), accPrev: acc(atPrev), quizzes: at.length, days, weekMin, peak, velocity, weak, avg };
  }, [data, range]);

  const generatePlan = async () => {
    setPlanBusy(true);
    try {
      setPlan(await api("/remediation", { method: "POST" }));
    } catch (e) {
      toast(e.message, "error");
    }
    setPlanBusy(false);
  };

  const practice = async (t) => {
    setPracticeBusy(t.topic);
    try {
      const q = await api(`/documents/${t.document_id}/quiz`, { method: "POST", json: { count: 8, topic: t.topic } });
      navigate(`/quiz/${q.id}`);
    } catch (e) {
      toast(e.message, "error");
      setPracticeBusy("");
    }
  };

  const exportCsv = () => {
    const rows = ["type,when,detail,value", ...data.attempts.map((a) => `quiz,${a.t},${a.score}/${a.total},${a.seconds}s`), ...data.events.map((e) => `${e.kind},${e.t},xp,${e.xp}`)];
    downloadFile("studymate-activity.csv", rows.join("\n"), "text/csv");
  };

  if (error) return <Card className="mx-auto max-w-xl p-6 text-coral" role="alert">{error}</Card>;
  const empty = data && data.events.length === 0 && data.topics.length === 0;
  const maxBar = m ? Math.max(1, ...m.days.map((x) => x.review + x.deep)) : 1;
  const topics = data ? (showAll ? data.topics : data.topics.slice(0, 5)) : [];

  return (
    <div className="space-y-10">
      <header className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <p className="label flex items-center gap-2 text-primary"><span className="h-2 w-2 rounded-full bg-teal" /> {tr("Your learning data")}</p>
          <h1 className="mt-2 text-4xl font-bold">{tr("Performance Analytics & Learning Mastery")}</h1>
          <p className="mt-3 text-mute">{tr("Study time, quiz accuracy and spaced-repetition progress, calculated from your own activity.")}</p>
        </div>
        <div className="flex items-center gap-1 self-start rounded-full bg-low p-1 lg:self-auto" role="tablist" aria-label={tr("Date range")}>
          {RANGES.map((r) => (
            <button key={r.days} role="tab" aria-selected={range === r.days} onClick={() => setRange(r.days)} className={`rounded-full px-4 py-2 text-xs font-semibold transition ${range === r.days ? "bg-brand text-white" : "text-mute hover:text-ink"}`}>{tr(r.label)}</button>
          ))}
          <button onClick={exportCsv} disabled={!data} aria-label={tr("Export activity as CSV")} title={tr("Export CSV")} className="grid h-9 w-9 place-items-center rounded-full text-mute hover:text-ink disabled:opacity-40"><Icon name="download" size={18} /></button>
        </div>
      </header>

      {!data ? (
        <div className="space-y-6"><div className="grid gap-5 md:grid-cols-3"><Skeleton className="h-44" /><Skeleton className="h-44" /><Skeleton className="h-44" /></div><Skeleton className="h-80" /></div>
      ) : (
        <>
          {empty && (
            <Card className="flex flex-col items-center gap-3 border-dashed p-8 text-center">
              <Icon name="monitoring" size={36} className="text-primary" />
              <p className="max-w-md text-mute">{tr("No activity yet. Generate a summary, review some flashcards or take a quiz and this page fills in.")}</p>
              <Button as={Link} to="/library" size="sm">{tr("Open Library")}</Button>
            </Card>
          )}

          <section className="grid gap-5 md:grid-cols-3">
            <Card className="flex flex-col justify-between p-6">
              <div className="flex items-start justify-between"><p className="label text-mute">{tr("Active study volume")}</p><span className="grid h-10 w-10 place-items-center rounded-xl bg-high text-primary"><Icon name="timer" /></span></div>
              <p className="font-display mt-4 text-5xl font-bold">{hm(m.minutes).split(" ")[0].replace("h", "")}<span className="text-2xl font-medium text-mute">h </span>{hm(m.minutes).split(" ")[1].replace("m", "")}<span className="text-2xl font-medium text-mute">m</span></p>
              <div className="mt-5 flex items-end justify-between">
                <Delta value={pctDelta(m.minutes, m.minutesPrev)} />
                <div className="flex h-9 items-end gap-1" aria-hidden="true">
                  {m.days.map((x, i) => <span key={i} className={`w-2 rounded-sm ${i === 6 ? "bg-teal" : "bg-highest"}`} style={{ height: `${Math.max(12, ((x.review + x.deep) / maxBar) * 100)}%` }} />)}
                </div>
              </div>
            </Card>
            <Card className="flex flex-col justify-between p-6">
              <div className="flex items-start justify-between"><p className="label text-mute">{tr("Quiz accuracy rate")}</p><span className="grid h-10 w-10 place-items-center rounded-xl bg-high text-cyan"><Icon name="verified" /></span></div>
              <p className="font-display mt-4 text-5xl font-bold">{m.acc === null ? "--" : Math.round(m.acc)}<span className="text-2xl font-medium text-cyan">%</span></p>
              <div className="mt-5 flex items-center justify-between text-xs font-semibold text-mute">
                <span>{m.quizzes} quiz{m.quizzes === 1 ? "" : "zes"} taken</span>
                {m.acc !== null && m.accPrev !== null && <span className={`rounded-full px-3 py-1 ${m.acc >= m.accPrev ? "bg-teal/15 text-cyan" : "bg-coral/15 text-coral"}`}>{m.acc >= m.accPrev ? "+" : ""}{Math.round(m.acc - m.accPrev)} pts vs prior</span>}
              </div>
            </Card>
            <Card className="flex flex-col justify-between p-6">
              <div className="flex items-start justify-between">
                <p className="label text-mute">{tr("Long-term retention")}</p>
                <Ring value={data.cards.total ? (100 * data.cards.mastered) / data.cards.total : 0} size={52} stroke={5} color="var(--amber)"><span className="text-[11px] font-bold">{data.cards.total ? Math.round((100 * data.cards.mastered) / data.cards.total) : 0}%</span></Ring>
              </div>
              <p className="font-display mt-4 text-5xl font-bold">{data.cards.mastered}<span className="text-2xl font-medium text-mute">/{data.cards.total}</span></p>
              <div className="mt-5 flex items-center justify-between text-xs font-semibold">
                <span className="text-mute">{tr("Cards locked in memory")}</span>
                <Link to="/library" className="flex items-center gap-1 text-amber">{data.cards.due} due <Icon name="arrow_forward" size={14} /></Link>
              </div>
            </Card>
          </section>

          <section className="grid gap-5 lg:grid-cols-[1.9fr_1fr]">
            <Card className="p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><h2 className="text-2xl font-semibold">{tr("Weekly Cognitive Activity")}</h2><p className="text-sm text-mute">{tr("Study minutes per day, split by how you studied")}</p></div>
                <div className="flex gap-4 text-xs font-semibold"><span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-teal" /> {tr("Active Review")}</span><span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-brand" /> {tr("Deep Synthesizing")}</span></div>
              </div>
              <div className="mt-6 flex h-52 items-end gap-3 border-b border-line/30 px-1 sm:gap-5" role="img" aria-label={tr("Bar chart of study minutes for the last seven days")}>
                {m.days.map((x, i) => {
                  const total = x.review + x.deep;
                  return (
                    <div key={i} className="group relative flex h-full flex-1 flex-col items-center justify-end">
                      <div className="absolute -top-1 hidden -translate-y-full rounded-lg bg-card px-2 py-1 text-xs font-semibold shadow-lg group-hover:block">{Math.round(total)} min</div>
                      <div className="flex w-full max-w-12 flex-col justify-end overflow-hidden rounded-md" style={{ height: `${(total / maxBar) * 100}%`, minHeight: total ? 6 : 0 }}>
                        <div className="bg-teal/90" style={{ flex: x.review }} /><div className="bg-brand" style={{ flex: x.deep }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 flex gap-3 px-1 text-center text-xs font-semibold text-mute sm:gap-5">{m.days.map((x, i) => <span key={i} className="flex-1">{x.d.toLocaleDateString(undefined, { weekday: "short" })}</span>)}</div>
              <div className="mt-5 flex flex-wrap justify-between gap-2 text-xs font-semibold"><span className="text-mute">Weekly total: {(m.weekMin / 60).toFixed(2)} active hours</span>{m.acc !== null && <span className="text-cyan">Accuracy index: {(m.acc / 10).toFixed(1)} / 10</span>}</div>
            </Card>

            <Card className="flex flex-col p-6">
              <p className="label flex items-center gap-2 text-cyan"><Icon name="bolt" fill size={16} /> {tr("Peak focus window")}</p>
              {m.peak === null ? (
                <p className="mt-4 text-mute">{tr("Study a few times and we will find the hours you focus best.")}</p>
              ) : (
                <>
                  <p className="font-display mt-3 text-5xl font-bold">{new Date(2000, 0, 1, m.peak).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }).replace(/\s?([AP]M)/i, "")}<span className="ml-1 text-xl text-mute">{m.peak < 12 ? "AM" : "PM"}</span></p>
                  <p className="mt-3 text-mute">{trx("You study the most between {from} and {to} (your local time).", { from: <b className="text-ink">{new Date(2000, 0, 1, m.peak).toLocaleTimeString(undefined, { hour: "numeric" })}</b>, to: <b className="text-ink">{new Date(2000, 0, 1, (m.peak + 3) % 24).toLocaleTimeString(undefined, { hour: "numeric" })}</b> })}</p>
                  <div className="mt-5 rounded-xl border border-line/30 bg-bg/60 p-4 text-xs">
                    {m.velocity !== null ? (
                      <>
                        <div className="mb-2 flex justify-between font-semibold"><span className="text-mute">{tr("Quiz accuracy in this window")}</span><span className={m.velocity >= 0 ? "text-cyan" : "text-coral"}>{m.velocity >= 0 ? "+" : ""}{m.velocity} pts vs rest of day</span></div>
                        <ProgressBar value={Math.min(100, 50 + m.velocity)} tone={m.velocity >= 0 ? "cyan" : "coral"} />
                      </>
                    ) : <p className="text-mute">{tr("Take quizzes in and out of this window to compare your accuracy.")}</p>}
                    <p className="mt-3 text-mute">{tr("Tip: schedule your hardest topic in this slot.")}</p>
                  </div>
                  <Button variant="ghost" size="sm" className="mt-auto w-full" icon="event" onClick={() => downloadFile("studymate-focus-block.ics", buildIcs(m.peak), "text/calendar")}>{tr("Add to calendar (.ics)")}</Button>
                </>
              )}
            </Card>
          </section>

          <section>
            <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
              <div><h2 className="text-3xl font-semibold">{tr("Topic Mastery Breakdown")}</h2><p className="text-mute">{tr("Where your quiz answers are strong and where the gaps are.")}</p></div>
              {data.topics.length > 5 && <button onClick={() => setShowAll((s) => !s)} className="text-sm font-semibold text-mute hover:text-ink">{showAll ? tr("Show fewer") : tr("Show all {n} topics", { n: data.topics.length })}</button>}
            </div>
            {data.topics.length === 0 ? <Card className="p-8 text-center text-mute">{tr("Take a quiz and each topic gets a mastery score here.")}</Card> : (
              <div className="space-y-3">
                {topics.map((t) => {
                  const s = masteryStatus(t.pct, t.answered);
                  const label = { cyan: tr("Assimilated"), primary: tr("Confidence"), amber: tr("Retention"), coral: tr("Accuracy floor") }[s.tone];
                  return (
                    <Card key={t.topic} className="flex flex-col gap-4 p-5 md:flex-row md:items-center">
                      <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-high ${TONE[s.tone]}`}><Icon name={s.tone === "coral" ? "warning" : s.tone === "amber" ? "sync" : subjectIcon(t.subject)} /></span>
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2"><span className="font-display text-lg font-semibold">{t.topic}</span><span className={`rounded-full bg-current/10 px-2.5 py-0.5 text-[11px] font-semibold ${TONE[s.tone]}`} style={{ background: "color-mix(in srgb, currentColor 14%, transparent)" }}>{s.label}</span></p>
                        <p className="text-xs text-mute">{t.subject} &bull; {t.answered} questions answered &bull; Last reviewed {timeAgo(t.updated_at)}</p>
                      </div>
                      <div className="flex items-center gap-5 md:w-[26rem]">
                        <div className="shrink-0 text-center"><p className={`font-display text-2xl font-bold ${TONE[s.tone]}`}>{t.pct}%</p><p className="text-[11px] font-semibold text-mute">{label}</p></div>
                        <ProgressBar value={t.pct} tone={BAR[s.tone]} className="flex-1" />
                        {s.tone === "coral" ? <Button size="sm" variant="danger" icon="quiz" onClick={() => practice(t)} disabled={practiceBusy === t.topic}>{practiceBusy === t.topic ? tr("Writing…") : tr("Take Practice Quiz")}</Button>
                          : s.tone === "amber" ? <Button size="sm" icon="style" className="!bg-amber !text-[#2a1800]" onClick={() => navigate(`/doc/${t.document_id}?tab=flashcards`)}>{tr("Review Flashcards")}</Button>
                          : <Link to={`/doc/${t.document_id}`} aria-label={`Open ${t.doc_title}`} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-high text-mute hover:text-ink"><Icon name="chevron_right" /></Link>}
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </section>

          {data.topics.length > 0 && (
            <Card className="flex flex-col gap-5 bg-gradient-to-r from-brand/20 to-teal/10 p-6 sm:flex-row sm:items-center">
              <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-brand text-white"><Icon name="psychology" size={28} /></span>
              <div className="flex-1">
                <h2 className="text-xl font-semibold">{tr("Readiness summary")}</h2>
                <p className="mt-1 text-mute">
                  {trx("Your average topic mastery is {avg}.", { avg: <b className="text-ink">{m.avg}%</b> })}{" "}
                  {m.weak.length ? trx("Fixing {topic} ({pct}%) will raise it the most.", { topic: <b className="text-ink">{m.weak[0].topic}</b>, pct: m.weak[0].pct }) : tr("Every topic is above 75%. Keep reviewing flashcards to hold it there.")}
                </p>
              </div>
              {m.weak.length > 0 && <Button variant="soft" onClick={generatePlan} disabled={planBusy} icon="auto_awesome">{planBusy ? tr("Building plan…") : tr("Generate Remediation Plan")}</Button>}
            </Card>
          )}
        </>
      )}

      <Modal open={!!plan} onClose={() => setPlan(null)} title={tr("Your remediation plan")} wide>
        {plan && (
          <>
            <p className="mb-4 text-sm text-mute">Built from: {plan.topics.join(", ")}</p>
            <Markdown>{plan.plan}</Markdown>
            <div className="mt-6 flex justify-end"><Button variant="ghost" icon="content_copy" onClick={() => { navigator.clipboard.writeText(plan.plan); toast(tr("Plan copied")); }}>{tr("Copy plan")}</Button></div>
          </>
        )}
      </Modal>
    </div>
  );
}
