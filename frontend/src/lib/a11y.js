// Reading-comfort settings, kept on this device and applied before the app draws.
const KEY = "studymate-a11y";
export const DEFAULTS = { size: 100, readable: false, spacing: false, calm: false };

export function loadA11y() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY)) };
  } catch {
    return { ...DEFAULTS };
  }
}

function ensureReadableFont() {
  if (document.getElementById("font-readable")) return;
  const link = document.createElement("link");
  link.id = "font-readable";
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&display=swap";
  document.head.appendChild(link);
}

export function applyA11y(s = loadA11y()) {
  const root = document.documentElement;
  root.style.fontSize = `${s.size}%`;
  root.dataset.readable = s.readable ? "1" : "";
  root.dataset.spacing = s.spacing ? "1" : "";
  root.dataset.calm = s.calm ? "1" : "";
  if (s.readable) ensureReadableFont();
}

export function saveA11y(next) {
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
  applyA11y(next);
}

// "calm" also follows the operating system's reduce-motion setting without any code, via CSS.
applyA11y();
