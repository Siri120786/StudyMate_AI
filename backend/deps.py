import json
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone

import httpx
import jwt
from fastapi import Header, HTTPException
from fastapi.responses import StreamingResponse
from supabase import ClientOptions, create_client

SUPABASE_URL = os.environ["SUPABASE_URL"]

# One pooled HTTP/1.1 client for every Supabase call. Measured on this project: 60 queries issued 25 at a time took
# 1.7 s and none failed. The library's default shared HTTP/2 connection either serialises them (10.8 s) or, when
# tuned, drops them with socket errors on Windows (23 of 60 failed). Timeouts are short on purpose: the library
# default waits two minutes on a stalled connection, which looks like a page that loads forever.
_http = httpx.Client(
    http2=False,
    timeout=httpx.Timeout(connect=5, read=25, write=60, pool=8),
    limits=httpx.Limits(max_connections=64, max_keepalive_connections=32, keepalive_expiry=30),
)
sb = create_client(SUPABASE_URL, os.environ["SUPABASE_SERVICE_KEY"], options=ClientOptions(httpx_client=_http))

# Each database call is a network round trip (200 to 500 ms), so independent ones run side by side.
# `par` is for single queries; `fan` is for whole helpers that use `par` inside. Separate pools cannot deadlock each other.
_LEAF = ThreadPoolExecutor(max_workers=32, thread_name_prefix="db")
_FAN = ThreadPoolExecutor(max_workers=8, thread_name_prefix="fan")


def par(*calls):
    """Run zero-argument callables at the same time and return their results in order."""
    return [f.result() for f in [_LEAF.submit(c) for c in calls]]


def fan(*calls):
    return [f.result() for f in [_FAN.submit(c) for c in calls]]


# ---------- who is calling ----------

# Supabase signs access tokens with a key pair, so the token can be checked here against the public key. That
# avoids a 1.5 second round trip to Supabase on every request. A signed-out token stays valid until it expires (one
# hour), which is how stateless tokens work.
_jwks = jwt.PyJWKClient(f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json", cache_keys=True, lifespan=3600, timeout=8)
_checked: dict[str, tuple[str, float]] = {}
FALLBACK_TTL = 300


def _warm_keys() -> None:
    try:
        _jwks.get_signing_keys()
    except Exception:
        pass


threading.Thread(target=_warm_keys, daemon=True).start()  # so the first request does not pay for it


def verify_token(token: str) -> str:
    try:
        key = _jwks.get_signing_key_from_jwt(token).key
        claims = jwt.decode(
            token, key, algorithms=["ES256", "RS256"], audience="authenticated",
            issuer=f"{SUPABASE_URL}/auth/v1", options={"require": ["exp", "sub"]},
        )
        return claims["sub"]
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid or expired token")
    except Exception:
        pass  # key not available (older project or no network): ask Supabase itself, and remember the answer briefly
    hit = _checked.get(token)
    if hit and hit[1] > time.time():
        return hit[0]
    try:
        user_id = sb.auth.get_user(token).user.id
    except Exception:
        raise HTTPException(401, "Invalid or expired token")
    _checked[token] = (user_id, time.time() + FALLBACK_TTL)
    if len(_checked) > 2000:
        now = time.time()
        for k in [k for k, v in _checked.items() if v[1] <= now]:
            del _checked[k]
    return user_id


def current_user(authorization: str | None = Header(default=None)) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Missing bearer token")
    return verify_token(authorization.split(" ", 1)[1])


# ---------- recent activity, shared by the header chips, dashboard and badges ----------

_events: dict[str, tuple[float, list]] = {}
EVENTS_TTL = 10


def activity_events(user_id: str) -> list[dict]:
    hit = _events.get(user_id)
    if hit and hit[0] > time.time():
        return hit[1]
    rows = (
        sb.table("activity").select("kind,xp,minutes,created_at").eq("user_id", user_id)
        .order("created_at", desc=True).limit(5000).execute().data
    )
    _events[user_id] = (time.time() + EVENTS_TTL, rows)
    return rows


def tz_offset(x_tz_offset: str | None = Header(default=None)) -> int:
    """Minutes as reported by JS Date.getTimezoneOffset() (UTC minus local)."""
    try:
        return max(-840, min(840, int(x_tz_offset or 0)))
    except ValueError:
        return 0


def user_lang(x_lang: str | None = Header(default=None)) -> str:
    """Language the student has picked in the UI, sent on every request."""
    from langs import LANGS

    return x_lang if x_lang in LANGS else "en"


def own_row(table: str, row_id: str, user_id: str) -> dict:
    res = sb.table(table).select("*").eq("id", row_id).eq("user_id", user_id).limit(1).execute()
    if not res.data:
        raise HTTPException(404, f"{table[:-1].capitalize()} not found")
    return res.data[0]


def parse_ts(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def local_date(ts: str, offset_min: int) -> date:
    return (parse_ts(ts) - timedelta(minutes=offset_min)).date()


def today_local(offset_min: int) -> date:
    return (datetime.now(timezone.utc) - timedelta(minutes=offset_min)).date()


def compute_streak(days: set[date], today: date) -> int:
    day = today if today in days else today - timedelta(days=1)
    streak = 0
    while day in days:
        streak += 1
        day -= timedelta(days=1)
    return streak


def award(user_id: str, kind: str, xp: int, minutes: float = 0, document_id: str | None = None) -> None:
    sb.table("activity").insert(
        {"user_id": user_id, "kind": kind, "xp": xp, "minutes": round(minutes, 2), "document_id": document_id}
    ).execute()
    _events.pop(user_id, None)  # the next read must include this


def sse(chunks, on_done=None):
    """Wrap a text iterator as server-sent events; JSON-encode so newlines survive."""

    def gen():
        parts = []
        try:
            for text in chunks:
                parts.append(text)
                yield f"data: {json.dumps(text)}\n\n"
            full = "".join(parts)
            if not full.strip():
                raise RuntimeError("The model returned an empty response. Try again.")
            if on_done:
                on_done(full)
            yield "event: done\ndata: {}\n\n"
        except Exception as exc:
            yield f"event: error\ndata: {json.dumps(str(exc))}\n\n"

    return StreamingResponse(
        gen(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
    )
