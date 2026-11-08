from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

import logic
from deps import current_user, own_row, par, sb, today_local, tz_offset

router = APIRouter(prefix="/api")


class ExamIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    exam_date: date
    document_ids: list[str] = Field(default_factory=list, max_length=30)


@router.post("/exams")
def add_exam(body: ExamIn, user_id: str = Depends(current_user), offset: int = Depends(tz_offset)):
    if body.exam_date < today_local(offset):
        raise HTTPException(400, "Pick a date that has not passed")
    mine = {d["id"] for d in sb.table("documents").select("id").eq("user_id", user_id).execute().data}
    ids = [i for i in body.document_ids if i in mine]  # ignore ids that are not this user's documents
    row = sb.table("exams").insert(
        {"user_id": user_id, "name": body.name.strip(), "exam_date": body.exam_date.isoformat(), "document_ids": ids}
    ).execute().data[0]
    return {"id": row["id"]}


@router.delete("/exams/{exam_id}")
def remove_exam(exam_id: str, user_id: str = Depends(current_user)):
    own_row("exams", exam_id, user_id)
    sb.table("exams").delete().eq("id", exam_id).execute()
    return {"ok": True}


def build_progress(docs: list[dict], summaries: list[dict], mastery: list[dict], cards: list[dict]) -> dict[str, dict]:
    out = {
        d["id"]: {
            "id": d["id"], "title": d["title"], "topics": d["topics"] or [{"title": d["title"]}],
            "summarized": set(), "whole_summary": False, "mastery": {}, "cards": 0, "due": 0,
        }
        for d in docs
    }
    for s in summaries:
        d = out.get(s["document_id"])
        if d:
            if s["topic"]:
                d["summarized"].add(s["topic"])
            else:
                d["whole_summary"] = True
    for m in mastery:
        d = out.get(m["document_id"])
        if d:
            d["mastery"][m["topic"]] = (m["correct"], m["total"])
    now = datetime.now(timezone.utc).isoformat()
    for c in cards:
        d = out.get(c["document_id"])
        if d:
            d["cards"] += 1
            d["due"] += int(c["due_at"] <= now)
    return out


@router.get("/planner")
def planner(user_id: str = Depends(current_user), offset: int = Depends(tz_offset)):
    today = today_local(offset)
    exams, docs_rows, summaries, mastery, cards = par(
        lambda: sb.table("exams").select("*").eq("user_id", user_id).gte("exam_date", today.isoformat()).order("exam_date").execute().data,
        lambda: sb.table("documents").select("id,title,topics").eq("user_id", user_id).execute().data,
        lambda: sb.table("summaries").select("document_id,topic").eq("user_id", user_id).execute().data,
        lambda: sb.table("topic_mastery").select("document_id,topic,correct,total").eq("user_id", user_id).execute().data,
        lambda: sb.table("flashcards").select("document_id,due_at").eq("user_id", user_id).execute().data,
    )
    docs = build_progress(docs_rows, summaries, mastery, cards)
    out = []
    for e in exams:
        chosen = [docs[i] for i in e["document_ids"] if i in docs] or list(docs.values())
        plan = logic.build_plan({"exam_date": date.fromisoformat(e["exam_date"])}, chosen, today)
        out.append(
            {
                "id": e["id"],
                "name": e["name"],
                "exam_date": e["exam_date"],
                "doc_count": len(chosen),
                "document_ids": e["document_ids"],
                **plan,
            }
        )
    return {"exams": out, "minutes_today": sum(x["minutes"] for x in out)}
