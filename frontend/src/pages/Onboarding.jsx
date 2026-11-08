import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { Button, Field, Icon, Logo, inputClass } from "../components/ui";
import { L, tr } from "../lib/i18n";

const SUBJECTS = [L("Biology"), L("Chemistry"), L("Physics"), L("Calculus"), L("Statistics"), L("Computer Science"), L("Economics"), L("History"), L("Philosophy"), L("Psychology"), L("Literature"), L("Law")];
const GOALS = [
  { xp: 50, label: L("Light"), note: L("About one short quiz a day") },
  { xp: 100, label: L("Steady"), note: L("A quiz and a flashcard round") },
  { xp: 250, label: L("Intense"), note: L("Exam season pace") },
];

export default function Onboarding() {
  const { profile, saveProfile, user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(profile?.display_name || user?.user_metadata?.display_name || "");
  const [subjects, setSubjects] = useState(profile?.subjects || []);
  const [goal, setGoal] = useState(profile?.daily_goal_xp || 100);
  const [busy, setBusy] = useState(false);

  const toggle = (s) => setSubjects((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));
  const finish = async () => {
    setBusy(true);
    await saveProfile({ display_name: name.trim() || user?.email?.split("@")[0] || "", subjects, daily_goal_xp: goal, onboarded: true });
    navigate("/dashboard", { replace: true });
  };

  return (
    <div className="hero-glow flex min-h-[100dvh] flex-col px-4 py-6">
      <Logo />
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center py-10">
        <div className="mb-8 flex gap-2" aria-label={`Step ${step + 1} of 3`}>
          {[0, 1, 2].map((i) => (
            <span key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i <= step ? "bg-teal" : "bg-high"}`} />
          ))}
        </div>

        {step === 0 && (
          <section className="pop">
            <h1 className="text-4xl font-bold">{tr("What should we call you?")}</h1>
            <p className="mt-3 text-mute">{tr("Your Sidekick will use this name when it checks in on you.")}</p>
            <div className="mt-8">
              <Field label={tr("First name")}>
                <input autoFocus className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder={tr("Alex")} />
              </Field>
            </div>
          </section>
        )}

        {step === 1 && (
          <section className="pop">
            <h1 className="text-4xl font-bold">{tr("What are you studying?")}</h1>
            <p className="mt-3 text-mute">{tr("Pick any that apply. This is only used to personalise your dashboard.")}</p>
            <div className="mt-8 flex flex-wrap gap-2.5">
              {SUBJECTS.map((s) => {
                const on = subjects.includes(s);
                return (
                  <button key={s} onClick={() => toggle(s)} aria-pressed={on} className={`flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium transition ${on ? "border-brand bg-brand/20 text-primary" : "border-line text-mute hover:border-faint hover:text-ink"}`}>
                    {on && <Icon name="check" size={16} />}
                    {tr(s)}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {step === 2 && (
          <section className="pop">
            <h1 className="text-4xl font-bold">{tr("Set a daily goal")}</h1>
            <p className="mt-3 text-mute">{tr("You earn XP from summaries, flashcards and quizzes. You can change this any time in Settings.")}</p>
            <div className="mt-8 grid gap-3">
              {GOALS.map((g) => (
                <button key={g.xp} onClick={() => setGoal(g.xp)} aria-pressed={goal === g.xp} className={`flex items-center justify-between rounded-2xl border p-5 text-left transition ${goal === g.xp ? "border-brand bg-brand/15" : "border-line bg-low hover:border-faint"}`}>
                  <span>
                    <span className="block font-display text-lg font-semibold">{tr(g.label)}</span>
                    <span className="text-sm text-mute">{tr(g.note)}</span>
                  </span>
                  <span className="font-display text-2xl font-bold text-cyan">{g.xp} <span className="text-sm font-medium text-mute">{tr("XP")}</span></span>
                </button>
              ))}
            </div>
          </section>
        )}

        <div className="mt-10 flex items-center justify-between">
          <Button variant="plain" onClick={() => setStep((s) => s - 1)} className={step === 0 ? "invisible" : ""}>{tr("Back")}</Button>
          {step < 2 ? (
            <Button trailing="arrow_forward" onClick={() => setStep((s) => s + 1)} disabled={step === 0 && !name.trim()}>{tr("Continue")}</Button>
          ) : (
            <Button trailing="arrow_forward" onClick={finish} disabled={busy}>{busy ? tr("Setting up…") : tr("Go to my dashboard")}</Button>
          )}
        </div>
      </div>
    </div>
  );
}
