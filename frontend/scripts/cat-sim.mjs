// Runs the cat brain in fast-forward and checks that it walks to each edge, climbs, peeks, drops and turns.
import { createCat, stepCat } from "../src/lib/catBrain.js";

const env = { vw: 1100, vh: 700, size: 128, floor: 700 - 128 - 6, maxX: 1100 - 128, roaming: true, cursorNear: false, cursorX: -999, idleFor: 0 };
const s = createCat(0);
let now = 0;
const seen = new Set();
const trail = [];
let minX = Infinity, maxX = -Infinity, minY = Infinity, last = "";
for (let i = 0; i < 60 * 150; i++) { // 150 simulated seconds at 60 fps
  now += 1000 / 60;
  stepCat(s, { ...env, idleFor: 0 }, now, 1 / 60);
  seen.add(s.mode);
  minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x); minY = Math.min(minY, s.y);
  if (s.mode !== last) { trail.push(`${(now / 1000).toFixed(1)}s ${s.mode}@${Math.round(s.x)},${Math.round(s.y)}`); last = s.mode; }
}
console.log(trail.slice(0, 24).join("\n"));
console.log({ modes: [...seen], minX, maxX, minY, floor: env.floor });
const fail = [];
for (const m of ["walk", "climb", "peek", "fall", "land"]) if (!seen.has(m)) fail.push(`never reached ${m}`);
if (minX > 0.5) fail.push("never reached left edge");
if (maxX < env.maxX - 0.5) fail.push("never reached right edge");
if (minY > env.floor - 100) fail.push("never climbed");
if (s.y > env.floor + 0.01) fail.push("ended below floor");
if (fail.length) { console.log("FAIL:", fail.join("; ")); process.exit(1); }
console.log("OK: walks edge to edge, climbs, peeks, drops, turns");
