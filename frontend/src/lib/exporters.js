import { downloadFile } from "./util";

const oneLine = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const safeName = (s) => oneLine(s).replace(/[^\w\- ]+/g, "").replace(/\s+/g, "-").toLowerCase() || "studymate";

/** Anki imports tab-separated text: front, back, tags. Use File > Import in Anki. */
export function exportAnki(title, cards) {
  const rows = cards.map((c) => [oneLine(c.front), oneLine(c.back), oneLine(c.topic).replace(/\s+/g, "_")].join("\t"));
  downloadFile(`${safeName(title)}-anki.txt`, rows.join("\n"), "text/plain;charset=utf-8");
}

export function exportCsv(title, cards) {
  const q = (s) => `"${oneLine(s).replace(/"/g, '""')}"`;
  const rows = [["Front", "Back", "Topic"].map(q).join(","), ...cards.map((c) => [c.front, c.back, c.topic].map(q).join(","))];
  // the BOM lets Excel read Hindi, Telugu and other scripts correctly
  downloadFile(`${safeName(title)}-flashcards.csv`, "﻿" + rows.join("\n"), "text/csv;charset=utf-8");
}

export function exportMarkdown(title, markdown) {
  downloadFile(`${safeName(title)}.md`, `# ${title}\n\n${markdown}\n`, "text/markdown;charset=utf-8");
}
