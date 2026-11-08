from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

import logic
from deps import activity_events, award, current_user, local_date, par, parse_ts, sb, today_local, tz_offset

router = APIRouter(prefix="/api")

FOCUS_XP_CAP = 60


def events_of(user_id: str) -> list[dict]:
    return activity_events(user_id)


def snapshot(user_id: str, offset: int, events: list[dict] | None = None) -> dict:
    """XP, level, streak and streak-freeze numbers shared by the header chips and the dashboard."""
    events = events if events is not None else events_of(user_id)
    today = today_local(offset)
    xp_total = sum(e["xp"] for e in events)
    lvl = logic.level_info(xp_total)
    budget = logic.freeze_budget(lvl["level"])
    days = {local_date(e["created_at"], offset) for e in events}
    streak, used = logic.streak_with_freezes(days, today, budget)
    return {
        "xp_total": xp_total,
        "xp_today": sum(e["xp"] for e in events if local_date(e["created_at"], offset) == today),
        "streak": streak,
        "freezes_left": budget - used,
        "freezes_budget": budget,
        **lvl,
    }


def badge_values(user_id: str, offset: int, events: list[dict], snap: dict) -> dict:
    count = lambda kind: sum(1 for e in events if e["kind"] == kind)
    attempts, mastery, docs, exams = par(
        lambda: sb.table("attempts").select("score,total").eq("user_id", user_id).execute().data,
        lambda: sb.table("topic_mastery").select("correct,total").eq("user_id", user_id).execute().data,
        lambda: sb.table("documents").select("id", count="exact").eq("user_id", user_id).execute().count or 0,
        lambda: sb.table("exams").select("id", count="exact").eq("user_id", user_id).execute().count or 0,
    )
    hour = lambda e: (parse_ts(e["created_at"]) - timedelta(minutes=offset)).hour
    days_of = lambda pred: len({local_date(e["created_at"], offset) for e in events if pred(e)})
    return {
        "docs": docs,
        "summaries": count("summary"),
        "quizzes": len(attempts),
        "perfect": sum(1 for a in attempts if a["total"] and a["score"] == a["total"]),
        "reviews": count("flashcard"),
        "best_streak": max(snap["streak"], logic.best_streak({local_date(e["created_at"], offset) for e in events})),
        "focus_sessions": count("focus"),
        "focus_minutes": sum(float(e["minutes"]) for e in events if e["kind"] == "focus"),
        "mastered_topics": sum(1 for m in mastery if m["total"] >= 5 and m["correct"] / m["total"] >= 0.9),
        "level": snap["level"],
        "early": days_of(lambda e: e["kind"] != "bonus" and hour(e) < 8),
        "late": days_of(lambda e: e["kind"] != "bonus" and hour(e) >= 22),
        "exams": exams,
    }


def sync_badges(user_id: str, badges: list[dict]) -> list[str]:
    """Record badges earned for the first time and return the ones the student has not been told about yet."""
    have = {r["badge"]: r["seen"] for r in sb.table("badges").select("badge,seen").eq("user_id", user_id).execute().data}
    earned = [b["id"] for b in badges if b["earned"]]
    fresh = [b for b in earned if b not in have]
    if fresh:
        sb.table("badges").insert([{"user_id": user_id, "badge": b} for b in fresh]).execute()
    unseen = fresh + [b for b in earned if b in have and not have[b]]
    if unseen:
        sb.table("badges").update({"seen": True}).eq("user_id", user_id).in_("badge", unseen).execute()
    return unseen


@router.get("/achievements")
def achievements(user_id: str = Depends(current_user), offset: int = Depends(tz_offset)):
    events = events_of(user_id)
    snap = snapshot(user_id, offset, events)
    badges = logic.evaluate_badges(badge_values(user_id, offset, events, snap))
    sync_badges(user_id, badges)
    return {**snap, "badges": badges}


# ---------- daily challenges ----------


def progress_today(events: list[dict], offset: int) -> dict:
    today = today_local(offset)
    mine = [e for e in events if local_date(e["created_at"], offset) == today]
    return {
        "flashcard": sum(1 for e in mine if e["kind"] == "flashcard"),
        "quiz": sum(1 for e in mine if e["kind"] == "quiz"),
        "summary": sum(1 for e in mine if e["kind"] == "summary"),
        "focus_minutes": int(sum(float(e["minutes"]) for e in mine if e["kind"] == "focus")),
    }


@router.get("/challenges")
def challenges(user_id: str = Depends(current_user), offset: int = Depends(tz_offset)):
    today = today_local(offset)
    done = progress_today(events_of(user_id), offset)
    claimed = {r["key"] for r in sb.table("challenge_claims").select("key").eq("user_id", user_id).eq("day", today.isoformat()).execute().data}
    return [
        {
            "key": key,
            "goal": goal,
            "progress": min(done[counts], goal),
            "complete": done[counts] >= goal,
            "claimed": key in claimed,
            "bonus": bonus,
        }
        for key, counts, goal, bonus in logic.todays_challenges(today)
    ]


@router.post("/challenges/{key}/claim")
def claim_challenge(key: str, user_id: str = Depends(current_user), offset: int = Depends(tz_offset)):
    today = today_local(offset)
    match = next((c for c in logic.todays_challenges(today) if c[0] == key), None)
    if not match:
        raise HTTPException(404, "That challenge is not active today")
    _, counts, goal, bonus = match
    if progress_today(events_of(user_id), offset)[counts] < goal:
        raise HTTPException(400, "Finish the challenge first")
    exists = sb.table("challenge_claims").select("key").eq("user_id", user_id).eq("day", today.isoformat()).eq("key", key).execute().data
    if exists:
        raise HTTPException(409, "Already claimed")
    sb.table("challenge_claims").insert({"user_id": user_id, "day": today.isoformat(), "key": key}).execute()
    award(user_id, "bonus", bonus)
    return {"xp": bonus}


# ---------- focus timer ----------


class FocusIn(BaseModel):
    minutes: int = Field(ge=5, le=120)
    document_id: str | None = None


@router.post("/focus")
def finish_focus(body: FocusIn, user_id: str = Depends(current_user)):
    """Called when a focus block completes. One XP per minute, capped so one long block cannot farm points."""
    xp = min(body.minutes, FOCUS_XP_CAP)
    award(user_id, "focus", xp, minutes=body.minutes, document_id=body.document_id)
    return {"xp": xp}
