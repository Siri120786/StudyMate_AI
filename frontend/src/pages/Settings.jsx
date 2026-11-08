import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { useTheme } from "../lib/theme";
import { Button, Card, Field, Icon, Modal, inputClass, useToast } from "../components/ui";
import { downloadFile } from "../lib/util";
import { tr, trx } from "../lib/i18n";
import { CatSettings, ReadingComfort, ReminderSetting } from "../components/Comfort";

const GOALS = [50, 100, 250, 500];

function Section({ icon, title, children }) {
  return (
    <Card className="p-6 sm:p-8">
      <h2 className="mb-5 flex items-center gap-3 text-xl font-semibold"><span className="grid h-10 w-10 place-items-center rounded-xl bg-high text-primary"><Icon name={icon} size={20} /></span>{title}</h2>
      {children}
    </Card>
  );
}

export default function Settings() {
  const { profile, saveProfile, user } = useAuth();
  const { theme, toggle } = useTheme();
  const toast = useToast();
  const navigate = useNavigate();
  const [name, setName] = useState(profile?.display_name || "");
  const [goal, setGoal] = useState(profile?.daily_goal_xp || 100);
  const [saving, setSaving] = useState(false);
  const [password, setPassword] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [del, setDel] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [delBusy, setDelBusy] = useState(false);

  const dirty = name.trim() !== (profile?.display_name || "") || goal !== profile?.daily_goal_xp;

  const save = async () => {
    setSaving(true);
    try {
      await saveProfile({ display_name: name.trim(), daily_goal_xp: goal });
      toast(tr("Settings saved"));
    } catch (e) {
      toast(e.message, "error");
    }
    setSaving(false);
  };

  const changePassword = async (e) => {
    e.preventDefault();
    setPwBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setPwBusy(false);
    if (error) toast(error.message, "error");
    else (toast(tr("Password updated")), setPassword(""));
  };

  const exportData = async () => {
    try {
      downloadFile("studymate-export.json", JSON.stringify(await api("/export"), null, 2));
    } catch (e) {
      toast(e.message, "error");
    }
  };

  const deleteAccount = async () => {
    setDelBusy(true);
    try {
      await api("/account", { method: "DELETE" });
      await supabase.auth.signOut();
      navigate("/");
    } catch (e) {
      toast(e.message, "error");
      setDelBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="mb-4"><h1 className="text-4xl font-bold">{tr("Settings")}</h1><p className="mt-2 text-mute">Signed in as {user?.email}</p></header>

      <Section icon="person" title={tr("Profile and goals")}>
        <div className="space-y-5">
          <Field label={tr("First name")}><input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} /></Field>
          <Field label={tr("Daily XP goal")} hint={tr("You earn XP from summaries, flashcards and quizzes.")}>
            <div className="grid grid-cols-4 gap-2">
              {GOALS.map((g) => (
                <button key={g} onClick={() => setGoal(g)} aria-pressed={goal === g} className={`rounded-xl border py-2.5 font-semibold transition ${goal === g ? "border-brand bg-brand/20 text-primary" : "border-line text-mute hover:text-ink"}`}>{g}</button>
              ))}
            </div>
          </Field>
          <Button onClick={save} disabled={!dirty || saving || !name.trim()}>{saving ? tr("Saving…") : tr("Save changes")}</Button>
        </div>
      </Section>

      <Section icon="contrast" title={tr("Appearance")}>
        <div className="flex items-center justify-between gap-4">
          <p className="text-mute">{trx("Currently using {mode} mode.", { mode: <b className="text-ink">{tr(theme)}</b> })}</p>
          <Button variant="ghost" icon={theme === "dark" ? "light_mode" : "dark_mode"} onClick={toggle}>{theme === "dark" ? tr("Switch to light") : tr("Switch to dark")}</Button>
        </div>
      </Section>

      <Section icon="pets" title={tr("Study cat")}>
        <CatSettings />
      </Section>

      <Section icon="accessibility_new" title={tr("Reading comfort")}>
        <ReadingComfort />
      </Section>

      <Section icon="notifications" title={tr("Reminders")}>
        <ReminderSetting />
      </Section>

      <Section icon="key" title={tr("Password")}>
        <form onSubmit={changePassword} className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="flex-1"><Field label={tr("New password")} hint={tr("Use 8 or more characters.")}><input className={inputClass} type="password" minLength={8} required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field></div>
          <Button type="submit" variant="ghost" disabled={pwBusy || password.length < 8}>{pwBusy ? tr("Updating…") : tr("Update password")}</Button>
        </form>
      </Section>

      <Section icon="database" title={tr("Your data")}>
        <p className="text-mute">{tr("Download everything stored for your account, or remove it for good.")}</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button variant="ghost" icon="download" onClick={exportData}>{tr("Export my data (JSON)")}</Button>
          <Button variant="danger" icon="delete_forever" onClick={() => setDel(true)}>{tr("Delete account")}</Button>
        </div>
      </Section>

      <Modal open={del} onClose={() => setDel(false)} title={tr("Delete your account?")}>
        <p className="text-mute">{trx("This permanently deletes your notes, summaries, flashcards, quizzes and progress. It cannot be undone. Type {word} to confirm.", { word: <b className="text-ink">{tr("DELETE")}</b> })}</p>
        <input className={`${inputClass} mt-4`} value={confirmText} onChange={(e) => setConfirmText(e.target.value)} aria-label={tr("Type DELETE to confirm")} />
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="plain" onClick={() => setDel(false)}>{tr("Cancel")}</Button>
          <Button variant="danger" disabled={confirmText !== "DELETE" || delBusy} onClick={deleteAccount}>{delBusy ? tr("Deleting…") : tr("Delete everything")}</Button>
        </div>
      </Modal>
    </div>
  );
}
