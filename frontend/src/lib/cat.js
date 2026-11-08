import { FRAMES, PALETTES, SIZE } from "./catSprites";

export const SKINS = ["orange", "gray"];
const KEYS = { shown: "studymate-cat", skin: "studymate-cat-skin", roam: "studymate-cat-roam" };

const read = (k) => {
  try { return localStorage.getItem(k); } catch { return null; }
};

/** What the student chose for the study cat: shown or hidden, which colour, and whether it walks around. */
export function readCatPrefs() {
  return { shown: read(KEYS.shown) !== "off", skin: SKINS.includes(read(KEYS.skin)) ? read(KEYS.skin) : "orange", roam: read(KEYS.roam) !== "off" };
}

export function saveCatPrefs(patch) {
  const next = { ...readCatPrefs(), ...patch };
  try {
    localStorage.setItem(KEYS.shown, next.shown ? "on" : "off");
    localStorage.setItem(KEYS.skin, next.skin);
    localStorage.setItem(KEYS.roam, next.roam ? "on" : "off");
  } catch {}
  window.dispatchEvent(new Event("studycat-prefs")); // lets the cat and the settings page stay in step
  return next;
}

const cache = new Map();

/** A drawn frame as a 32x32 canvas, built once per colour set. */
export function sprite(skin, name) {
  const key = `${skin}/${name}`;
  let c = cache.get(key);
  if (!c) {
    c = document.createElement("canvas");
    c.width = c.height = SIZE;
    const g = c.getContext("2d");
    const palette = PALETTES[skin];
    FRAMES[name].forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        if (row[x] !== ".") {
          g.fillStyle = palette[row[x]];
          g.fillRect(x, y, 1, 1);
        }
      }
    });
    cache.set(key, c);
  }
  return c;
}

export { SIZE };
