import { getLang, tr } from "./i18n";

export function timeAgo(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return tr("just now");
  const m = Math.floor(s / 60);
  if (m < 60) return tr("{m} min ago", { m });
  const h = Math.floor(m / 60);
  if (h < 24) return tr(h > 1 ? "{h} hrs ago" : "{h} hr ago", { h });
  const d = Math.floor(h / 24);
  if (d === 1) return tr("Yesterday");
  if (d < 30) return tr("{d} days ago", { d });
  return new Date(iso).toLocaleDateString(getLang(), { month: "short", day: "numeric" });
}

export function readingMinutes(text) {
  const words = (text || "").trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round((words / 220) * 2) / 2);
}

export function stripMarkdown(md) {
  return (md || "")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/[*_`]/g, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/\n{2,}/g, ". ")
    .trim();
}

const SUBJECT_ICONS = [
  [/bio|cell|life|zoo|botan|genet|anatom/i, "biotech"],
  [/calc|math|algebra|geometr|stat|trig/i, "function"],
  [/phil|ethic|logic/i, "psychology_alt"],
  [/chem|molec/i, "science"],
  [/phys|mechanic|thermo/i, "bolt"],
  [/hist|politic|civic|econom|geograph/i, "public"],
  [/comput|code|program|software|data|cs/i, "terminal"],
  [/lit|english|writing|language/i, "menu_book"],
  [/psych|neuro|mind/i, "psychology"],
];
export function subjectIcon(subject) {
  return SUBJECT_ICONS.find(([re]) => re.test(subject || ""))?.[1] ?? "school";
}

export function masteryStatus(pct, answered) {
  if (pct >= 85) return { label: tr("Mastered"), tone: "cyan" };
  if (pct >= 70) return { label: tr("Proficient"), tone: "primary" };
  if (pct >= 60 || answered < 3) return { label: tr("Needs Review"), tone: "amber" };
  return { label: tr("Flagged Misconception"), tone: "coral" };
}

export const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? tr("Good morning") : h < 18 ? tr("Good afternoon") : tr("Good evening");
};

export function downloadFile(name, text, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}
