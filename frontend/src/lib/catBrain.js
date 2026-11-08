// What the study cat decides to do, with no DOM in it, so it can be run in fast-forward and tested.
// stepCat() moves the cat by dt seconds and returns the name of the sprite frame to draw.

export const GROUND = new Set(["walk", "sit", "sleep", "happy", "scratch", "meow"]); // on the floor, so it can be touched
export const WATCH_RANGE = 240; // px: closer than this and the cat stops to wave at the cursor
export const SLEEP_AFTER_MS = 30000;
const CLIMB_SPEED = 40; // px per second up the side of the screen
const GRAVITY = 1700;
const rand = (a, b) => a + Math.random() * (b - a);

export function createCat(now = 0) {
  return {
    x: 24, y: 0, dir: 1, mode: "sit", t0: now, until: now + 1800, vy: 0, waving: true, quiet: false,
    hopAt: -1e9, squash: 1, nextSit: now + rand(9000, 14000), placed: false,
  };
}

export function enter(s, mode, now, extra = {}) {
  Object.assign(s, { mode, t0: now }, extra);
}

/**
 * env: { vw, vh, size, floor, maxX, roaming, cursorNear, cursorX, idleFor }
 * Returns the frame name. Mutates s.
 */
export function stepCat(s, env, now, dt) {
  const { vh, size, floor, maxX, roaming, cursorNear, cursorX, idleFor } = env;
  if (!s.placed) { s.y = floor; s.placed = true; }
  const age = now - s.t0;
  const cx = s.x + size / 2;
  let name = "sit_rest";

  if (!roaming && ["walk", "climb", "peek", "fall", "land"].includes(s.mode)) {
    s.y = floor; // roaming was switched off: come down and settle
    enter(s, "sit", now, { waving: false, until: Infinity });
  }

  switch (s.mode) {
    case "walk": {
      const speed = size < 128 ? 52 : 68;
      s.x += s.dir * speed * dt;
      s.y = floor;
      name = `walk_${Math.floor(age / 150) % 4}`;
      if (s.x <= 0) { s.x = 0; s.dir = -1; enter(s, "climb", now); }
      else if (s.x >= maxX) { s.x = maxX; s.dir = 1; enter(s, "climb", now); }
      else if (cursorNear) enter(s, "sit", now, { waving: true, until: now + 1400 });
      else if (idleFor > SLEEP_AFTER_MS) enter(s, "sleep", now);
      else if (now > s.nextSit) enter(s, "sit", now, { waving: true, until: now + rand(2200, 3800) });
      break;
    }
    case "sit": {
      s.y = floor;
      if (roaming && s.until === Infinity) s.until = now + 1500; // roaming was switched back on
      if (cursorNear && !s.quiet) {
        s.dir = cursorX < cx ? -1 : 1; // wave on the side the cursor is on
        s.waving = true;
        s.until = Math.max(Number.isFinite(s.until) ? s.until : 0, now + 1200);
      }
      name = s.waving ? (Math.floor(age / 380) % 2 ? "sit_wave_b" : "sit_wave_a") : age % 4200 > 3900 ? "sit_blink" : "sit_rest";
      if (roaming && now > s.until) { s.nextSit = now + rand(9000, 15000); enter(s, "walk", now); }
      else if (!cursorNear && idleFor > SLEEP_AFTER_MS && !s.quiet) enter(s, "sleep", now);
      break;
    }
    case "sleep":
      s.y = floor;
      name = Math.floor(age / 900) % 2 ? "sleep_b" : "sleep_a";
      break;
    case "happy":
      s.y = floor;
      name = Math.floor(age / 280) % 2 ? "happy_b" : "happy_a";
      if (now > s.until) enter(s, "sit", now, { waving: false, until: now + 800 });
      break;
    case "scratch":
      s.y = floor;
      name = Math.floor(age / 150) % 2 ? "scratch_b" : "scratch_a";
      if (now > s.until) enter(s, "sit", now, { waving: false, until: now + 800 });
      break;
    case "meow":
      s.y = floor;
      name = "meow";
      if (now > s.until) enter(s, "sit", now, { waving: false, until: now + 800 });
      break;
    case "climb": {
      s.x = s.dir > 0 ? maxX : 0; // clinging to the edge of the screen
      s.y -= CLIMB_SPEED * dt;
      name = `climb_${Math.floor(age / 280) % 2}`;
      const top = Math.max(84, floor - Math.min(vh * 0.42, 300)); // stays below the top bar
      if (s.y <= top) { s.y = top; enter(s, "peek", now); }
      break;
    }
    case "peek":
      name = "climb_0";
      if (age > 1500) enter(s, "fall", now, { vy: 0 });
      break;
    case "fall":
      s.vy += GRAVITY * dt;
      s.y += s.vy * dt;
      name = "sit_wave_b"; // paw in the air on the way down
      if (s.y >= floor) { s.y = floor; enter(s, "land", now); }
      break;
    case "land":
      s.squash = 1 - 0.18 * Math.sin(Math.PI * Math.min(1, age / 240));
      name = "sit_rest";
      if (age > 280) {
        s.squash = 1;
        s.dir = -s.dir; // turn away from the edge and head back across
        s.x = Math.max(0, Math.min(maxX, s.x + s.dir * 8));
        s.nextSit = now + rand(8000, 14000);
        enter(s, "walk", now);
      }
      break;
    default:
      enter(s, "sit", now);
  }

  s.x = Math.max(0, Math.min(maxX, s.x));
  if (s.mode !== "climb" && s.mode !== "peek" && s.mode !== "fall") s.y = Math.min(s.y, floor);
  return name;
}
