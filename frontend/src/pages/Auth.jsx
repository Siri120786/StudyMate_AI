import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { Button, Field, Icon, Logo, inputClass } from "../components/ui";
import { ThemeToggle } from "../components/Layout";
import { CineVideo } from "../components/Cinematic";
import { L, tr, trx } from "../lib/i18n";

const POINTS = [
  ["layers", L("Three reading levels"), L("Switch any upload between Beginner, Intermediate and Advanced.")],
  ["quiz", L("Quizzes with explanations"), L("Every wrong answer comes with a reason grounded in your notes.")],
  ["monitoring", L("Mastery you can see"), L("Spaced repetition tells you what to review before you forget it.")],
];

function AuthFrame({ title, subtitle, children, footer }) {
  return (
    <div className="grid min-h-[100dvh] lg:grid-cols-[1.05fr_1fr]">
      <aside className="cine-wrap relative isolate hidden flex-col justify-between overflow-hidden p-12 text-white lg:flex">
        <CineVideo />
        {/* darkens the lower part of the video so the list stays readable */}
        <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-transparent via-[hsl(201_100%_8%/0.55)] to-[hsl(201_100%_6%/0.9)]" aria-hidden="true" />
        <Logo />
        <div>
          <h2 className="max-w-md">
            {tr("Ace your classes")} <span className="text-white/55">{tr("without the burnout.")}</span>
          </h2>
          <ul className="mt-10 space-y-6">
            {POINTS.map(([icon, head, body]) => (
              <li key={head} className="flex gap-4">
                <span className="liquid-glass grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white"><Icon name={icon} /></span>
                <div>
                  <p className="font-semibold">{tr(head)}</p>
                  <p className="text-sm text-white/70">{tr(body)}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-sm text-white/60">{tr("Your notes stay private to your account.")}</p>
      </aside>
      <main className="relative flex flex-col px-4 py-6 sm:px-10">
        <div className="flex items-center justify-between lg:justify-end">
          <Logo className="lg:hidden" />
          <ThemeToggle />
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          <h1 className="text-3xl font-bold">{title}</h1>
          <p className="mt-2 text-mute">{subtitle}</p>
          <div className="mt-8">{children}</div>
          <div className="mt-6 text-center text-sm text-mute">{footer}</div>
        </div>
      </main>
    </div>
  );
}

function PasswordInput({ value, onChange, autoComplete, id }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        id={id} className={`${inputClass} pr-12`} type={show ? "text" : "password"} required minLength={8}
        autoComplete={autoComplete} value={value} onChange={(e) => onChange(e.target.value)} placeholder={tr("At least 8 characters")}
      />
      <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? tr("Hide password") : tr("Show password")} className="absolute right-3 top-1/2 -translate-y-1/2 text-faint hover:text-ink">
        <Icon name={show ? "visibility_off" : "visibility"} size={20} />
      </button>
    </div>
  );
}

function Status({ error, notice }) {
  if (error) return <p role="alert" className="rounded-xl border border-coral/30 bg-coral/10 px-4 py-3 text-sm text-coral">{error}</p>;
  if (notice) return <p role="status" className="rounded-xl border border-teal/30 bg-teal/10 px-4 py-3 text-sm text-cyan">{notice}</p>;
  return null;
}

export function Login() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const from = useLocation().state?.from || "/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (session) return <Navigate to={from} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setError(error.message === "Invalid login credentials" ? tr("That email and password don't match. Try again or reset your password.") : error.message);
    else navigate(from, { replace: true });
  };

  return (
    <AuthFrame
      title={tr("Welcome back")}
      subtitle={tr("Log in to pick up where you left off.")}
      footer={<>{tr("New to StudyMate?")} <Link to="/signup" className="font-semibold text-primary hover:underline">{tr("Create an account")}</Link></>}
    >
      <form onSubmit={submit} className="space-y-5">
        <Field label={tr("Email")}>
          <input className={inputClass} type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={tr("you@university.edu")} />
        </Field>
        <Field label={tr("Password")}>
          <PasswordInput value={password} onChange={setPassword} autoComplete="current-password" />
        </Field>
        <div className="text-right">
          <Link to="/forgot" className="text-sm text-mute hover:text-ink">{tr("Forgot password?")}</Link>
        </div>
        <Status error={error} />
        <Button className="w-full" size="lg" disabled={busy} type="submit">{busy ? tr("Logging in…") : tr("Log in")}</Button>
      </form>
    </AuthFrame>
  );
}

export function Signup() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  if (session) return <Navigate to="/dashboard" replace />;
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { data, error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: { data: { display_name: form.name.trim() }, emailRedirectTo: `${window.location.origin}/onboarding` },
    });
    setBusy(false);
    if (error) return setError(error.message);
    if (data.session) navigate("/onboarding", { state: { name: form.name.trim() } });
    else setNotice(tr("Almost there. Check your email and confirm your address, then log in."));
  };

  return (
    <AuthFrame
      title={tr("Create your account")}
      subtitle={tr("Free to use. No credit card needed.")}
      footer={<>{tr("Already have an account?")} <Link to="/login" className="font-semibold text-primary hover:underline">{tr("Log in")}</Link></>}
    >
      <form onSubmit={submit} className="space-y-5">
        <Field label={tr("First name")}>
          <input className={inputClass} required autoComplete="given-name" value={form.name} onChange={(e) => set("name")(e.target.value)} placeholder={tr("Alex")} />
        </Field>
        <Field label={tr("Email")}>
          <input className={inputClass} type="email" required autoComplete="email" value={form.email} onChange={(e) => set("email")(e.target.value)} placeholder={tr("you@university.edu")} />
        </Field>
        <Field label={tr("Password")} hint={tr("Use 8 or more characters.")}>
          <PasswordInput value={form.password} onChange={set("password")} autoComplete="new-password" />
        </Field>
        <Status error={error} notice={notice} />
        <Button className="w-full" size="lg" disabled={busy || !!notice} type="submit">{busy ? tr("Creating account…") : tr("Start Studying for Free")}</Button>
        <p className="text-center text-xs text-faint">
          {trx("By signing up you agree to the {terms} and {privacy}.", { terms: <Link to="/terms" className="underline">{tr("Terms")}</Link>, privacy: <Link to="/privacy" className="underline">{tr("Privacy Policy")}</Link> })}
        </p>
      </form>
    </AuthFrame>
  );
}

export function Forgot() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset` });
    setBusy(false);
    if (error) setError(error.message);
    else setNotice(tr("If that email has an account, a reset link is on its way."));
  };

  return (
    <AuthFrame
      title={tr("Reset your password")}
      subtitle={tr("Enter your email and we'll send you a link.")}
      footer={<Link to="/login" className="font-semibold text-primary hover:underline">{tr("Back to log in")}</Link>}
    >
      <form onSubmit={submit} className="space-y-5">
        <Field label={tr("Email")}>
          <input className={inputClass} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder={tr("you@university.edu")} />
        </Field>
        <Status error={error} notice={notice} />
        <Button className="w-full" size="lg" disabled={busy || !!notice} type="submit">{busy ? tr("Sending…") : tr("Send reset link")}</Button>
      </form>
    </AuthFrame>
  );
}

export function Reset() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) setError(error.message);
    else navigate("/dashboard", { replace: true });
  };

  return (
    <AuthFrame title={tr("Choose a new password")} subtitle={tr("Pick something you haven't used before.")} footer={<Link to="/login" className="font-semibold text-primary hover:underline">{tr("Back to log in")}</Link>}>
      {session ? (
        <form onSubmit={submit} className="space-y-5">
          <Field label={tr("New password")}><PasswordInput value={password} onChange={setPassword} autoComplete="new-password" /></Field>
          <Status error={error} />
          <Button className="w-full" size="lg" disabled={busy} type="submit">{busy ? tr("Saving…") : tr("Save password")}</Button>
        </form>
      ) : (
        <Status error={tr("This reset link has expired or was already used. Request a new one from the forgot password page.")} />
      )}
    </AuthFrame>
  );
}
