import { Field, Icon } from "./ui";
import { L, tr } from "../lib/i18n";

const SECONDS = { mcq: 60, tf: 30, fill: 60, short: 150 }; // mirrors the server's mock exam clock
export const TYPE_INFO = [
  ["mcq", L("Multiple choice"), "checklist"],
  ["tf", L("True or false"), "rule"],
  ["fill", L("Fill in the blank"), "edit_note"],
  ["short", L("Short answer"), "short_text"],
];

/** Question types and the mock exam switch, shared by the document quiz dialog and the mixed quiz dialog. */
export default function QuizOptions({ types, setTypes, exam, setExam, count }) {
  const toggle = (t) => setTypes((cur) => (cur.includes(t) ? (cur.length > 1 ? cur.filter((x) => x !== t) : cur) : [...cur, t]));
  const minutes = Math.max(1, Math.round((count * types.reduce((a, t) => a + SECONDS[t], 0)) / types.length / 60));
  return (
    <>
      <Field label={tr("Question types")} hint={tr("Pick one or more. They are mixed together.")}>
        <div className="grid grid-cols-2 gap-2">
          {TYPE_INFO.map(([id, label, icon]) => {
            const on = types.includes(id);
            return (
              <button key={id} type="button" onClick={() => toggle(id)} aria-pressed={on} className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition ${on ? "border-brand bg-brand/20 text-primary" : "border-line text-mute hover:text-ink"}`}>
                <Icon name={on ? "check_box" : icon} size={18} /> {tr(label)}
              </button>
            );
          })}
        </div>
      </Field>
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-4">
        <input type="checkbox" checked={exam} onChange={(e) => setExam(e.target.checked)} className="mt-1 h-4 w-4 accent-[#6c5ce7]" />
        <span>
          <span className="block font-medium">{tr("Mock exam")}</span>
          <span className="text-sm text-mute">{tr("Timed, no hints, and it submits itself when time is up. About {n} minutes.", { n: minutes })}</span>
        </span>
      </label>
    </>
  );
}
