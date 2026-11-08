from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

import llm
from deps import activity_events, compute_streak, current_user, fan, local_date, par, parse_ts, sb, today_local, tz_offset, user_lang
from langs import lang_note
import logic
from routers.documents import documents_overview
from routers.gamify import badge_values, events_of, snapshot, sync_badges

router = APIRouter(prefix="/api")


# ---------- profile ----------


class ProfileIn(BaseModel):
    display_name: str = Field(default="", max_length=60)
    daily_goal_xp: int = Field(default=100, ge=20, le=2000)
    subjects: list[str] = Field(default_factory=list, max_length=12)
    onboarded: bool = True


def get_profile(user_id: str) -> dict:
    rows = sb.table("profiles").select("display_name,daily_goal_xp,subjects,onboarded").eq("user_id", user_id).limit(1).execute().data
    return rows[0] if rows else {"display_name": "", "daily_goal_xp": 100, "subjects": [], "onboarded": False}


@router.get("/profile")
def read_profile(user_id: str = Depends(current_user)):
    return get_profile(user_id)


@router.put("/profile")
def write_profile(body: ProfileIn, user_id: str = Depends(current_user)):
    row = {**body.model_dump(), "user_id": user_id}
    row["display_name"] = row["display_name"].strip()
    row["subjects"] = [s.strip()[:40] for s in row["subjects"] if s.strip()]
    sb.table("profiles").upsert(row).execute()
    return get_profile(user_id)


# ---------- dashboard ----------


def activity_rows(user_id: str, since: datetime | None = None) -> list[dict]:
    q = sb.table("activity").select("kind,xp,minutes,created_at,document_id").eq("user_id", user_id)
    if since:
        q = q.gte("created_at", since.isoformat())
    return q.order("created_at", desc=True).limit(5000).execute().data


def due_card_count(user_id: str) -> int:
    now = datetime.now(timezone.utc).isoformat()
    res = sb.table("flashcards").select("id", count="exact").eq("user_id", user_id).lte("due_at", now).execute()
    return res.count or 0


def pick_nudge(user_id: str) -> dict | None:
    rows = sb.table("topic_mastery").select("topic,correct,total,updated_at,document_id").eq("user_id", user_id).execute().data
    now = datetime.now(timezone.utc)
    best, best_score = None, 0
    for r in rows:
        if not r["total"] or not r["document_id"]:
            continue
        pct = round(100 * r["correct"] / r["total"])
        age = (now - parse_ts(r["updated_at"])).days
        if age < 2 and pct >= 70:
            continue
        score = (100 - pct) + age * 5
        if score > best_score:
            best, best_score = {"topic": r["topic"], "days": age, "pct": pct, "document_id": r["document_id"]}, score
    return best


@router.get("/dashboard")
def dashboard(user_id: str = Depends(current_user), offset: int = Depends(tz_offset)):
    profile, snap, nudge, due, overview = fan(
        lambda: get_profile(user_id),
        lambda: snapshot(user_id, offset),
        lambda: pick_nudge(user_id),
        lambda: due_card_count(user_id),
        lambda: documents_overview(user_id),
    )
    return {
        "profile": profile,
        **snap,
        "nudge": nudge,
        "due_cards": due,
        "materials": overview[:6],
        "doc_count": len(overview),
    }


@router.get("/stats")
def stats(check: bool = False, user_id: str = Depends(current_user), offset: int = Depends(tz_offset)):
    """
    Header chips (streak, XP, level). With check=1 it also looks for newly earned badges, which costs several more
    database calls, so the app asks for that only right after something that can earn one.
    """
    events = activity_events(user_id)
    snap = snapshot(user_id, offset, events)
    if not check:
        return {**snap, "new_badges": []}
    badges = logic.evaluate_badges(badge_values(user_id, offset, events, snap))
    return {**snap, "new_badges": sync_badges(user_id, badges)}


# ---------- analytics ----------


@router.get("/analytics")
def analytics(days: int = 30, user_id: str = Depends(current_user)):
    days = max(1, min(days, 400))
    since = datetime.now(timezone.utc) - timedelta(days=days)
    events, attempts, docs_rows, mastery, cards = par(
        lambda: activity_rows(user_id, since),
        lambda: sb.table("attempts").select("quiz_id,score,total,seconds,created_at").eq("user_id", user_id)
        .gte("created_at", since.isoformat()).order("created_at").execute().data,
        lambda: sb.table("documents").select("id,title,subject").eq("user_id", user_id).execute().data,
        lambda: sb.table("topic_mastery").select("topic,correct,total,updated_at,document_id").eq("user_id", user_id).execute().data,
        lambda: sb.table("flashcards").select("interval_days,due_at").eq("user_id", user_id).execute().data,
    )
    docs = {d["id"]: d for d in docs_rows}
    topics = []
    for m in mastery:
        if not m["total"]:
            continue
        doc = docs.get(m["document_id"], {})
        topics.append(
            {
                "topic": m["topic"],
                "pct": round(100 * m["correct"] / m["total"]),
                "answered": m["total"],
                "updated_at": m["updated_at"],
                "document_id": m["document_id"],
                "subject": doc.get("subject", "General"),
                "doc_title": doc.get("title", ""),
            }
        )
    topics.sort(key=lambda t: t["pct"])

    now = datetime.now(timezone.utc).isoformat()
    return {
        "days": days,
        "events": [{"t": e["created_at"], "kind": e["kind"], "xp": e["xp"], "minutes": float(e["minutes"])} for e in events],
        "attempts": [{"t": a["created_at"], "score": a["score"], "total": a["total"], "seconds": a["seconds"]} for a in attempts],
        "topics": topics,
        "cards": {
            "total": len(cards),
            "mastered": sum(1 for c in cards if c["interval_days"] >= 7),
            "due": sum(1 for c in cards if c["due_at"] <= now),
        },
    }


@router.post("/remediation")
def remediation(user_id: str = Depends(current_user), lang: str = Depends(user_lang)):
    rows = sb.table("topic_mastery").select("topic,correct,total,document_id").eq("user_id", user_id).execute().data
    weak = sorted(
        (r for r in rows if r["total"] and r["correct"] / r["total"] < 0.75),
        key=lambda r: r["correct"] / r["total"],
    )[:4]
    if not weak:
        raise HTTPException(400, "No weak topics yet. Take a quiz first and your plan will be built from the misses.")
    docs = {
        d["id"]: d
        for d in sb.table("documents").select("id,title,content").eq("user_id", user_id)
        .in_("id", list({r["document_id"] for r in weak if r["document_id"]})).execute().data
    }
    context = "\n\n".join(
        f"Topic: {r['topic']} ({round(100 * r['correct'] / r['total'])}% correct over {r['total']} questions)\n"
        f"Source notes excerpt:\n{docs.get(r['document_id'], {}).get('content', '')[:2500]}"
        for r in weak
    )
    plan = llm.complete_text(
        "You are a study coach. Write a short remediation plan as Markdown: one '## Focus areas' line per weak "
        "topic with the specific confusion to fix, then '## 3-day plan' with concrete 15-25 minute tasks per day "
        "(re-read a section, flashcards, a targeted quiz). Base it only on the supplied notes. No emoji." + lang_note(lang),
        context,
        3000,
    )
    return {"plan": plan, "topics": [r["topic"] for r in weak]}


# ---------- data export and account deletion ----------


@router.get("/export")
def export_data(user_id: str = Depends(current_user)):
    def rows(table: str, cols: str):
        return sb.table(table).select(cols).eq("user_id", user_id).execute().data

    return {
        "profile": get_profile(user_id),
        "documents": rows("documents", "id,title,subject,blurb,content,created_at"),
        "summaries": rows("summaries", "document_id,level,content,created_at"),
        "quizzes": rows("quizzes", "id,document_id,title,questions,created_at"),
        "attempts": rows("attempts", "quiz_id,score,total,seconds,created_at"),
        "flashcards": rows("flashcards", "document_id,topic,front,back,interval_days,reviews"),
        "topic_mastery": rows("topic_mastery", "topic,correct,total,updated_at"),
        "activity": rows("activity", "kind,xp,minutes,created_at"),
    }


@router.delete("/account")
def delete_account(user_id: str = Depends(current_user)):
    # Every table cascades from auth.users, so removing the user removes all study data.
    sb.auth.admin.delete_user(user_id)
    return {"ok": True}
