import { supabase } from "./supabase";
import { getLang, tr } from "./i18n";

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error("Not signed in");
  return {
    Authorization: `Bearer ${data.session.access_token}`,
    // Lets the server bucket streaks and "today" by the student's own midnight.
    "X-Tz-Offset": String(new Date().getTimezoneOffset()),
    // Tells the server which language to write summaries, quizzes and chat replies in.
    "X-Lang": getLang(),
  };
}

async function failure(res) {
  let detail = res.statusText;
  try {
    detail = (await res.json()).detail || detail;
  } catch {}
  if (typeof detail !== "string") detail = "Something went wrong. Please try again.";
  return new Error(detail);
}

const FRESH_MS = 15000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cache = new Map(); // "lang|path" -> { at, promise }

/** Forget saved answers. Called after anything that changes data, so a page never shows stale numbers. */
export const clearApiCache = () => cache.clear();

async function send(path, opts = {}, attempt = 0) {
  const { method = "GET", json, form } = opts;
  const headers = await authHeaders();
  if (json) headers["Content-Type"] = "application/json";
  const controller = new AbortController();
  // Reads should be quick; writes can include an AI call, so they get longer.
  const timer = setTimeout(() => controller.abort(), method === "GET" ? 15000 : 120000);
  try {
    const res = await fetch(`/api${path}`, { method, headers, body: json ? JSON.stringify(json) : form, signal: controller.signal });
    if (!res.ok) {
      if (method === "GET" && attempt === 0 && [502, 503, 504].includes(res.status)) {
        await sleep(400);
        return send(path, opts, 1);
      }
      throw await failure(res);
    }
    return await res.json();
  } catch (e) {
    if (e.name === "AbortError" || e instanceof TypeError) {
      // a stalled or dropped connection: reads try once more, then say so instead of spinning forever
      if (method === "GET" && attempt === 0) {
        await sleep(400);
        return send(path, opts, 1);
      }
      throw new Error(tr("This is taking longer than expected. Check your connection and try again."));
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Talk to the API. Reads are remembered for 15 seconds and shared between callers asking at the same moment,
 * so moving between pages and back is instant and the same request is never sent twice. Pass { fresh: true }
 * to skip the memory (used when polling). Any write clears everything.
 */
export function api(path, opts = {}) {
  const method = opts.method || "GET";
  if (method !== "GET") {
    clearApiCache();
    return send(path, opts).then((r) => { clearApiCache(); return r; });
  }
  const key = `${getLang()}|${path}`;
  const hit = cache.get(key);
  if (!opts.fresh && hit && Date.now() - hit.at < FRESH_MS) return hit.promise.then(structuredClone);
  const promise = send(path, opts).catch((e) => {
    cache.delete(key);
    throw e;
  });
  cache.set(key, { at: Date.now(), promise });
  return promise.then(structuredClone);
}

/** POST and read a server-sent-event stream, calling onToken for each text chunk. */
export async function stream(path, json, onToken, signal) {
  clearApiCache(); // generating content changes what the pages show
  const headers = { ...(await authHeaders()), "Content-Type": "application/json" };
  const res = await fetch(`/api${path}`, { method: "POST", headers, body: JSON.stringify(json ?? {}), signal });
  if (!res.ok) throw await failure(res);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop();
    for (const evt of events) {
      const lines = evt.split("\n");
      const type = lines.find((l) => l.startsWith("event: "))?.slice(7) ?? "message";
      const data = lines.find((l) => l.startsWith("data: "))?.slice(6);
      if (data === undefined) continue;
      if (type === "error") throw new Error(JSON.parse(data));
      if (type === "message") onToken(JSON.parse(data));
    }
  }
}

/** GET a binary response (such as podcast audio) as an object URL; callers revoke it when done. */
export async function blobUrl(path) {
  const res = await fetch(`/api${path}`, { headers: await authHeaders() });
  if (!res.ok) throw await failure(res);
  return URL.createObjectURL(await res.blob());
}
