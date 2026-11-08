import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Icon, Pill, ProgressBar, Ring } from "../components/ui";
import { PublicShell } from "../components/Layout";
import { CineVideo } from "../components/Cinematic";
import { useAuth } from "../lib/auth";
import { L, tr } from "../lib/i18n";

const NAV = [
  { href: "#features", label: L("Features") },
  { href: "#how", label: L("How it Works") },
  { href: "#pricing", label: L("Pricing") },
];

function Reveal({ children, className = "", delay = 0 }) {
  const ref = useRef();
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => e.isIntersecting && (setSeen(true), io.disconnect()), { threshold: 0.15 });
    io.observe(ref.current);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={`transition duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] ${seen ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"} ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

const DEMO = [
  { topic: L("Bioenergetics"), q: L("What is the primary function of ATP in a cell?"), a: L("ATP carries usable chemical energy. Cells spend it by converting ATP to ADP and phosphate.") },
  { topic: L("Photosynthesis"), q: L("Where does the Calvin cycle take place?"), a: L("In the stroma of the chloroplast, using ATP and NADPH from the light reactions.") },
  { topic: L("Respiration"), q: L("What does the electron transport chain build across the inner mitochondrial membrane?"), a: L("A proton gradient, which ATP synthase uses to make ATP.") },
];

function HeroDemo() {
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [xp, setXp] = useState(0);
  const card = DEMO[i % DEMO.length];
  const rate = (gain) => {
    setXp((x) => x + gain);
    setFlipped(false);
    setI((n) => n + 1);
  };
  return (
    <div className="relative">
      <div className="absolute -top-4 right-2 z-10 flex items-center gap-2 rounded-full border border-line/50 bg-card px-4 py-2 text-sm font-semibold shadow-xl sm:-right-4">
        <Icon name="local_fire_department" fill className="text-amber" size={20} /> {tr("Streak: 5 Days")}
      </div>
      <div className="overflow-hidden rounded-2xl border border-line/50 bg-low shadow-[0_30px_80px_-30px_rgb(0_0_0/0.6)]">
        <div className="flex items-center gap-2 border-b border-line/40 bg-high px-4 py-3">
          <span className="h-3 w-3 rounded-full bg-[#b67d7a]" /><span className="h-3 w-3 rounded-full bg-[#b89462]" /><span className="h-3 w-3 rounded-full bg-teal" />
          <span className="ml-3 truncate text-xs font-semibold text-mute">{tr("Sample deck: Cell Biology")}</span>
        </div>
        <div className="space-y-5 p-5 sm:p-6">
          <div className="flex items-center justify-between text-xs font-semibold">
            <Pill tone="primary">{tr("Card {n} of {total}", { n: (i % DEMO.length) + 1, total: DEMO.length })}</Pill>
            <span className="text-mute">{tr(card.topic)}</span>
          </div>
          <button onClick={() => setFlipped((f) => !f)} aria-label={flipped ? tr("Show question") : tr("Reveal answer")} className="ai-border block min-h-44 w-full rounded-xl p-5 text-left transition hover:scale-[1.01]">
            {flipped ? (
              <span className="pop block"><span className="label flex items-center gap-1.5 text-cyan"><Icon name="auto_awesome" size={14} /> {tr("Answer")}</span><span className="mt-2 block text-lg leading-relaxed">{tr(card.a)}</span></span>
            ) : (
              <span className="block"><span className="label text-primary">{tr("Concept prompt")}</span><span className="mt-2 block font-display text-xl font-semibold leading-snug">{tr(card.q)}</span><span className="mt-4 block text-xs text-faint">{tr("Tap the card to reveal the answer")}</span></span>
            )}
          </button>
          <div className="grid grid-cols-3 gap-2" aria-label={tr("Rate your recall")}>
            {[["Hard", "1d", 1], ["Good", "3d", 2], ["Easy", "7d", 3]].map(([l, d, g]) => (
              <button key={l} onClick={() => rate(g)} className={`rounded-lg border px-2 py-2 text-xs font-semibold transition active:scale-95 ${l === "Easy" ? "border-teal/50 bg-teal/10 text-cyan" : "border-line text-mute hover:text-ink"}`}>{tr(l)} ({d})</button>
            ))}
          </div>
        </div>
      </div>
      <div className="absolute -bottom-6 left-2 flex items-center gap-4 rounded-xl border border-line/50 bg-card px-4 py-3 shadow-xl sm:-left-6">
        <div><p className="text-xs font-semibold">{tr("Daily XP")}</p><ProgressBar value={Math.min(100, ((350 + xp) / 500) * 100)} className="mt-1.5 w-28" /></div>
        <span className="font-mono text-sm font-bold text-cyan">{Math.min(500, 350 + xp)}/500</span>
      </div>
    </div>
  );
}

const SUBJECTS = [L("Biology"), L("Calculus"), L("Philosophy"), L("Chemistry"), L("History"), L("Economics")];

const FAQ = [
  [L("What can I upload?"), L("PDF, DOCX, EPUB, TXT and images (PNG, JPG, WEBP), up to 12 MB. You can also paste text directly. Scanned PDFs and photos of notes are read with AI vision.")],
  [L("Is my material private?"), L("Your notes belong to your account and are only readable by you. They are sent to Google's Gemini model to write summaries, flashcards and quizzes, and are not shared with other users. You can export or delete everything from Settings.")],
  [L("Can the AI get things wrong?"), L("Yes. Summaries and quizzes are written strictly from your notes, but any AI can misread or oversimplify. Use the quiz explanations and your original material to double-check anything that matters for an exam.")],
  [L("How do XP and streaks work?"), L("You earn XP for generating summaries, rating flashcards and answering quiz questions correctly. A streak counts each day you do at least one of those. Set your daily XP goal in Settings.")],
  [L("How does spaced repetition work here?"), L("When you rate a flashcard Hard, Good or Easy it comes back in 1, 3 or 7 days. Cards you rate Easy count as mastered, and the Analytics page tracks how many you have locked in.")],
  [L("Does it cost anything?"), L("No. StudyMate AI is free to use. There is no paid tier.")],
];

export default function Landing() {
  const { session } = useAuth();
  const [open, setOpen] = useState(0);

  return (
    <PublicShell links={NAV} overlay>
      <div className="landing">
      <section className="cine-wrap relative isolate flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden px-6 pb-24 pt-32 text-center text-white">
        <CineVideo />
        <h1 className="animate-fade-rise max-w-7xl font-serif text-5xl font-normal leading-[0.95] tracking-[-2.46px] sm:text-7xl md:text-8xl">
          {tr("Where")} <em className="not-italic text-white/55">{tr("dreams")}</em> {tr("rise")} <em className="not-italic text-white/55">{tr("through the silence.")}</em>
        </h1>
        <p className="animate-fade-rise-delay mt-8 max-w-2xl text-base leading-relaxed text-white/70 sm:text-lg">{tr("We're designing tools for deep thinkers, bold creators, and quiet rebels. Amid the chaos, we build digital spaces for sharp focus and inspired work.")}</p>
        <div className="animate-fade-rise-delay-2 mt-12 flex flex-wrap items-center justify-center gap-3">
          <Link to={session ? "/dashboard" : "/signup"} className="liquid-glass inline-flex items-center gap-2 rounded-full px-10 py-4 text-base text-white transition hover:scale-[1.03] sm:px-14 sm:py-5">{session ? tr("Open Dashboard") : tr("Start Studying for Free")}<Icon name="arrow_forward" size={20} /></Link>
          <a href="#how" className="rounded-full px-6 py-4 text-sm text-white/80 transition hover:text-white">{tr("See How it Works")}</a>
        </div>
        {/* fades the video into the page colour, so there is no hard line under the hero (also in light theme) */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-20 bg-gradient-to-b from-transparent to-bg" aria-hidden="true" />
      </section>

      <section className="relative pb-20 pt-16 lg:pt-20">
        <div className="mx-auto grid max-w-[1200px] items-center gap-12 px-4 sm:px-6 lg:grid-cols-[1fr_480px]">
          <Reveal>
            <p className="label text-primary">{tr("Try a flashcard")}</p>
            <h2 className="mt-4 max-w-lg">{tr("Ace your classes")} <span className="text-mute">{tr("without the burnout.")}</span></h2>
            <p className="mt-5 max-w-md text-lg leading-relaxed text-mute">{tr("Turn messy notes and heavy PDFs into interactive quizzes, smart summaries and gamified study plans in seconds.")}</p>
            <p className="mt-6 flex items-center gap-2 text-sm text-mute"><Icon name="lock" size={18} className="text-cyan" /> {tr("Free to use. Your notes stay private to your account.")}</p>
          </Reveal>
          <Reveal delay={120}><HeroDemo /></Reveal>
        </div>
      </section>

      <section className="border-y border-line/30 bg-low/50 py-9" aria-label={tr("Subjects")}>
        <div className="mx-auto flex max-w-[1200px] flex-col items-center gap-6 px-4 sm:px-6 lg:flex-row lg:justify-between">
          <p className="label text-center text-faint">{tr("Built for every course on your timetable")}</p>
          <ul className="flex flex-wrap justify-center gap-x-10 gap-y-3 font-display text-xl font-semibold uppercase tracking-wide text-faint">
            {SUBJECTS.map((s) => <li key={s}>{tr(s)}</li>)}
          </ul>
        </div>
      </section>

      <section id="features" className="scroll-mt-20 py-24">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
          <Reveal className="mx-auto max-w-2xl text-center">
            <Pill tone="cyan">{tr("Core features")}</Pill>
            <h2 className="mt-5">{tr("Engineered for Deep Retention, Built for Speed")}</h2>
            <p className="mt-4 text-lg text-mute">{tr("Everything you need to digest dense semesters, organise scattered thoughts and recall it on exam day.")}</p>
          </Reveal>
          <div className="mt-14 grid gap-6 lg:grid-cols-3">
            <Reveal delay={0}>
              <article className="flex h-full flex-col rounded-2xl border border-line/40 bg-low p-7">
                <span className="grid h-12 w-12 place-items-center rounded-xl bg-high text-primary"><Icon name="layers" /></span>
                <p className="label mt-6 text-primary">{tr("Tiered comprehension")}</p>
                <h3 className="mt-1 text-2xl font-semibold">{tr("3-Tier Summaries")}</h3>
                <p className="mt-3 flex-1 text-mute">{tr("Review at the exact level you need. Switch between a plain-language overview, a conceptual deep dive and an exam-depth version of the same notes.")}</p>
                <ol className="mt-6 space-y-2 rounded-xl bg-bg/60 p-4 text-xs font-semibold">
                  {[[tr("Beginner"), tr("Plain language and analogies")], [tr("Intermediate"), tr("Concepts and how they connect")], [tr("Advanced"), tr("Mechanisms and edge cases")]].map(([a, b], n) => (
                    <li key={a} className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${["bg-teal", "bg-brand", "bg-amber"][n]}`} /><span>{a}</span><span className="ml-auto text-faint">{b}</span></li>
                  ))}
                </ol>
              </article>
            </Reveal>
            <Reveal delay={100}>
              <article className="flex h-full flex-col rounded-2xl border border-line/40 bg-low p-7">
                <span className="grid h-12 w-12 place-items-center rounded-xl bg-high text-cyan"><Icon name="quiz" /></span>
                <p className="label mt-6 text-cyan">{tr("Active recall engine")}</p>
                <h3 className="mt-1 text-2xl font-semibold">{tr("Instant AI Quizzes")}</h3>
                <p className="mt-3 flex-1 text-mute">{tr("Generate multiple-choice quizzes from your own material in about 15 seconds. Every answer comes with an explanation that points back to your notes.")}</p>
                <div className="mt-6 grid grid-cols-4 gap-2 rounded-xl bg-bg/60 p-4 text-center text-xs font-bold" aria-hidden="true">
                  {["A", "B", "C", "D"].map((l) => <span key={l} className={`rounded-lg py-2 ${l === "C" ? "bg-brand text-white" : "bg-high text-mute"}`}>{l}</span>)}
                </div>
              </article>
            </Reveal>
            <Reveal delay={200}>
              <article className="flex h-full flex-col rounded-2xl border border-line/40 bg-low p-7">
                <span className="grid h-12 w-12 place-items-center rounded-xl bg-high text-amber"><Icon name="monitoring" /></span>
                <p className="label mt-6 text-amber">{tr("Spaced diagnostics")}</p>
                <h3 className="mt-1 text-2xl font-semibold">{tr("Targeted Mastery and Analytics")}</h3>
                <p className="mt-3 flex-1 text-mute">{tr("Find your knowledge blind spots before the exam. Topic mastery, flashcard retention and your best study hours are tracked for you.")}</p>
                <div className="mt-6 space-y-3 rounded-xl bg-bg/60 p-4 text-xs font-semibold" aria-hidden="true">
                  {[[tr("Cell energetics"), 92, "cyan"], [tr("Calvin cycle"), 64, "amber"], [tr("Thermodynamics"), 41, "coral"]].map(([t, v, tone]) => (
                    <div key={t}><div className="mb-1 flex justify-between text-mute"><span>{t}</span><span>{v}%</span></div><ProgressBar value={v} tone={tone} /></div>
                  ))}
                  <p className="text-[10px] font-medium text-faint">{tr("Example data")}</p>
                </div>
              </article>
            </Reveal>
          </div>
        </div>
      </section>

      <section id="how" className="scroll-mt-20 border-y border-line/30 bg-low/40 py-24">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
          <Reveal><h2 className="max-w-xl">{tr("From a pile of notes to exam-ready in four steps")}</h2></Reveal>
          <ol className="mt-14 grid gap-x-8 gap-y-10 md:grid-cols-2 lg:grid-cols-4">
            {[
              ["upload_file", tr("Upload"), tr("Drop in a PDF, DOCX, EPUB, image or pasted text.")],
              ["article", tr("Read"), tr("Pick Beginner, Intermediate or Advanced. Key terms are highlighted and the audio briefing reads it aloud.")],
              ["style", tr("Practise"), tr("Flip flashcards and rate each one. Hard cards return tomorrow, easy ones next week.")],
              ["emoji_events", tr("Prove it"), tr("Take a quiz, read the explanations, and watch your mastery and streak grow.")],
            ].map(([icon, title, body], n) => (
              <Reveal key={title} delay={n * 90}>
                <li className="relative list-none">
                  <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand text-white shadow-[0_12px_30px_-10px_rgb(108_92_231/0.9)]"><Icon name={icon} size={28} /></span>
                  <h3 className="mt-5 text-2xl font-semibold">{title}</h3>
                  <p className="mt-2 text-mute">{body}</p>
                </li>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      <section className="py-24">
        <div className="mx-auto grid max-w-[1200px] items-center gap-14 px-4 sm:px-6 lg:grid-cols-2">
          <Reveal>
            <Pill tone="cyan" icon="bolt">{tr("Zero friction workflows")}</Pill>
            <h2 className="mt-5">{tr("Stop reorganising notes. Start internalising concepts.")}</h2>
            <p className="mt-5 text-lg text-mute">{tr("Colour-coding outlines and hand-writing flashcards eats hours. StudyMate does the formatting so your study time goes to actually remembering.")}</p>
            <ul className="mt-8 space-y-6">
              <li className="flex gap-4"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-high text-primary"><Icon name="verified_user" size={20} /></span><div><p className="font-semibold">{tr("Grounded in your material")}</p><p className="text-mute">{tr("Summaries, flashcards and quizzes are written only from what you upload, and quotes come straight from your notes.")}</p></div></li>
              <li className="flex gap-4"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-high text-cyan"><Icon name="forum" size={20} /></span><div><p className="font-semibold">{tr("A tutor that knows your notes")}</p><p className="text-mute">{tr("Stuck on a mechanism? Ask the Study Sidekick and get an answer drawn from your own document.")}</p></div></li>
            </ul>
          </Reveal>
          <Reveal delay={120}>
            <div className="rounded-3xl border border-line/40 bg-gradient-to-br from-low to-brand/15 p-6 sm:p-8">
              <div className="flex items-center justify-between">
                <p className="font-semibold">{tr("Today's study session")}</p>
                <Pill tone="amber" icon="local_fire_department">{tr("5 day streak")}</Pill>
              </div>
              <div className="mt-6 grid grid-cols-3 gap-3 text-center">
                <div className="rounded-2xl bg-bg/60 p-4"><Ring value={70} size={64} stroke={6}><span className="text-sm font-bold">70%</span></Ring><p className="mt-2 text-xs font-semibold text-mute">{tr("Daily goal")}</p></div>
                <div className="rounded-2xl bg-bg/60 p-4"><p className="font-display text-3xl font-bold text-cyan">12</p><p className="mt-3 text-xs font-semibold text-mute">{tr("Cards due")}</p></div>
                <div className="rounded-2xl bg-bg/60 p-4"><p className="font-display text-3xl font-bold text-amber">8/10</p><p className="mt-3 text-xs font-semibold text-mute">{tr("Last quiz")}</p></div>
              </div>
              <div className="mt-5 flex items-center gap-4 rounded-2xl bg-bg/60 p-4">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand/25 text-primary"><Icon name="bolt" fill /></span>
                <div className="flex-1"><p className="font-semibold">{tr("Study session velocity")}</p><p className="text-xs text-mute">{tr("XP from summaries, flashcards and quizzes")}</p></div>
                <p className="font-display text-2xl font-bold text-cyan">{tr("+240 XP")}</p>
              </div>
              <p className="mt-4 text-center text-[11px] text-faint">{tr("Illustration with sample numbers")}</p>
            </div>
          </Reveal>
        </div>
      </section>

      <section id="pricing" className="scroll-mt-20 border-y border-line/30 bg-low/40 py-24">
        <div className="mx-auto grid max-w-[1200px] gap-14 px-4 sm:px-6 lg:grid-cols-[1fr_1.15fr]">
          <Reveal>
            <h2>{tr("Free for every student")}</h2>
            <p className="mt-4 text-lg text-mute">{tr("One plan with everything included. No credit card, no trial clock.")}</p>
            <div className="ai-border mt-8 rounded-3xl p-8">
              <p className="label text-primary">{tr("StudyMate AI")}</p>
              <p className="font-display mt-2 text-5xl font-bold">{tr("Free")}</p>
              <ul className="mt-6 space-y-3">
                {[tr("Unlimited uploads (12 MB each)"), tr("3-tier summaries and audio briefings"), tr("AI flashcards with spaced repetition"), tr("Quizzes with explanations"), tr("Analytics and mastery tracking")].map((f) => (
                  <li key={f} className="flex items-center gap-3"><Icon name="check_circle" fill size={20} className="text-cyan" />{f}</li>
                ))}
              </ul>
              <Button as={Link} to={session ? "/dashboard" : "/signup"} size="lg" className="mt-8 w-full">{session ? tr("Open Dashboard") : tr("Start Studying for Free")}</Button>
            </div>
          </Reveal>
          <Reveal delay={100}>
            <div id="faq" className="scroll-mt-24">
              <h2 className="!text-4xl">{tr("Questions, answered")}</h2>
              <div className="mt-6 divide-y divide-line/40 rounded-2xl border border-line/40 bg-low">
                {FAQ.map(([q, a], n) => (
                  <div key={q}>
                    <button onClick={() => setOpen(open === n ? -1 : n)} aria-expanded={open === n} className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left font-semibold">
                      {tr(q)}<Icon name="expand_more" className={`shrink-0 transition ${open === n ? "rotate-180" : ""}`} />
                    </button>
                    {open === n && <p className="pop px-6 pb-5 leading-relaxed text-mute">{tr(a)}</p>}
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="py-24">
        <Reveal className="mx-auto max-w-[1200px] px-4 sm:px-6">
          <div className="cine-wrap relative isolate overflow-hidden rounded-3xl px-6 py-20 text-center text-white sm:px-16">
            <CineVideo className="opacity-70" />
            <h2 className="mx-auto max-w-3xl">{tr("Ready to take control of your academic semester?")}</h2>
            <p className="mx-auto mt-5 max-w-xl text-lg text-white/75">{tr("Upload your first set of notes and have a summary, flashcards and a quiz in a couple of minutes.")}</p>
            <div className="mt-10 flex justify-center">
              <Link to={session ? "/dashboard" : "/signup"} className="liquid-glass inline-flex items-center gap-2 rounded-full px-12 py-4 text-base text-white transition hover:scale-[1.03]">{session ? tr("Open Dashboard") : tr("Start Studying for Free")}<Icon name="arrow_forward" size={20} /></Link>
            </div>
            <p className="label mt-6 text-white/60">{tr("Instant setup • No credit card required")}</p>
          </div>
        </Reveal>
      </section>
      </div>
    </PublicShell>
  );
}
