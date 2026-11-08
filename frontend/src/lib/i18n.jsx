import { Fragment, createContext, useCallback, useContext, useMemo, useState } from "react";

export const LANGS = [
  { code: "en", name: "English", native: "English" },
  { code: "hi", name: "Hindi", native: "हिन्दी", font: "Noto Sans Devanagari" },
  { code: "te", name: "Telugu", native: "తెలుగు", font: "Noto Sans Telugu" },
  { code: "ta", name: "Tamil", native: "தமிழ்", font: "Noto Sans Tamil" },
  { code: "kn", name: "Kannada", native: "ಕನ್ನಡ", font: "Noto Sans Kannada" },
  { code: "ml", name: "Malayalam", native: "മലയാളം", font: "Noto Sans Malayalam" },
];

// Inter and Sora have no Indic glyphs, so the matching Noto script font is loaded on demand.
function useScriptFont(code) {
  const font = LANGS.find((l) => l.code === code)?.font;
  const root = document.documentElement;
  if (!font) return root.style.removeProperty("--font-script");
  const id = `font-${font.replace(/\s+/g, "-")}`;
  if (!document.getElementById(id)) {
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${font.replace(/\s+/g, "+")}:wght@400;500;600;700&display=swap`;
    document.head.appendChild(link);
  }
  root.style.setProperty("--font-script", `"${font}"`);
}
const KEY = "studymate-lang";

// code -> { "English text": "translation" }, filled by loadLanguage. Each language is its own small file.
const STRINGS = {};

/** Fetch one language's dictionary. English needs none, and a failed fetch simply leaves the text in English. */
export async function loadLanguage(code) {
  if (code === "en" || STRINGS[code]) return;
  try {
    STRINGS[code] = (await import(`./strings/${code}.json`)).default;
  } catch {
    STRINGS[code] = {};
  }
}

function initial() {
  try {
    const saved = localStorage.getItem(KEY);
    if (LANGS.some((l) => l.code === saved)) return saved;
  } catch {}
  const guess = (typeof navigator !== "undefined" ? navigator.language : "en").slice(0, 2);
  return LANGS.some((l) => l.code === guess) ? guess : "en";
}

// Module-level so plain functions (api calls, toasts, timeAgo) can translate without a hook.
let current = initial();
if (typeof document !== "undefined") {
  document.documentElement.lang = current;
  useScriptFont(current);
}

/** Marks a string in a module-level constant for extraction; the render site calls tr() on it. */
export const L = (text) => text;

export const getLang = () => current;

/**
 * Translate an English UI string (named tr because many components use `t` as a loop variable). The English text is the key, so a missing
 * translation just shows English. `{name}` placeholders are filled from `vars`.
 */
export function tr(text, vars) {
  let out = (current !== "en" && STRINGS[current]?.[text]) || text;
  if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  return out;
}

/** Like tr(), but placeholders are filled with React nodes (bold terms, links) instead of strings. */
export function trx(text, parts) {
  const out = (current !== "en" && STRINGS[current]?.[text]) || text;
  return out.split(/(\{\w+\})/).map((seg, i) => {
    const m = seg.match(/^\{(\w+)\}$/);
    return m && m[1] in parts ? <Fragment key={i}>{parts[m[1]]}</Fragment> : seg;
  });
}

const Ctx = createContext({ lang: "en", setLang: () => {} });
export const useI18n = () => useContext(Ctx);

/** Remounts its subtree on a language change, so every t() call re-evaluates. */
export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(current);
  const setLang = useCallback(async (code) => {
    if (!LANGS.some((l) => l.code === code) || code === current) return;
    await loadLanguage(code); // before switching, so nothing flashes in English
    current = code;
    document.documentElement.lang = code;
    useScriptFont(code);
    try { localStorage.setItem(KEY, code); } catch {}
    setLangState(code);
  }, []);
  const value = useMemo(() => ({ lang, setLang }), [lang, setLang]);
  return (
    <Ctx.Provider value={value}>
      <div key={lang} className="contents">{children}</div>
    </Ctx.Provider>
  );
}
