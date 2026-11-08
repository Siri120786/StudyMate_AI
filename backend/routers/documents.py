from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field

import llm
import sources
from deps import current_user, own_row, par, sb, user_lang
from limits import limited, limited_ip
from extract import extract_text

router = APIRouter(prefix="/api")

MAX_UPLOAD_BYTES = 12 * 1024 * 1024
LEVELS = ["beginner", "intermediate", "advanced"]


def documents_overview(user_id: str, limit: int | None = None) -> list[dict]:
    """Every document with the study state the Library and Dashboard cards need."""
    docs, summaries, quizzes, attempts, cards = par(
        lambda: sb.table("documents").select("id,title,subject,blurb,created_at").eq("user_id", user_id)
        .order("created_at", desc=True).execute().data,
        lambda: sb.table("summaries").select("document_id,level,topic,created_at").eq("user_id", user_id).execute().data,
        lambda: sb.table("quizzes").select("id,document_id").eq("user_id", user_id).execute().data,
        lambda: sb.table("attempts").select("quiz_id,score,total,created_at").eq("user_id", user_id)
        .order("created_at", desc=True).execute().data,
        lambda: sb.table("flashcards").select("document_id").eq("user_id", user_id).execute().data,
    )

    quiz_doc = {q["id"]: q["document_id"] for q in quizzes}
    out = {d["id"]: {**d, "levels": [], "quiz_count": 0, "card_count": 0, "last_quiz": None, "last_active": d["created_at"]} for d in docs}
    for s in summaries:
        d = out.get(s["document_id"])
        if d:
            if not s["topic"] and s["level"] not in d["levels"]:
                d["levels"].append(s["level"])
            d["last_active"] = max(d["last_active"], s["created_at"])
    for q in quizzes:
        if q["document_id"] in out:
            out[q["document_id"]]["quiz_count"] += 1
    for a in attempts:  # newest first, so the first hit per document is its latest quiz
        d = out.get(quiz_doc.get(a["quiz_id"]))
        if d:
            if d["last_quiz"] is None:
                d["last_quiz"] = {"score": a["score"], "total": a["total"], "at": a["created_at"]}
            d["last_active"] = max(d["last_active"], a["created_at"])
    for c in cards:
        if c["document_id"] in out:
            out[c["document_id"]]["card_count"] += 1

    rows = sorted(out.values(), key=lambda d: d["last_active"], reverse=True)
    for d in rows:
        d["levels"].sort(key=LEVELS.index)
    return rows[:limit] if limit else rows


def store_document(user_id: str, title: str, subject: str, content: str) -> dict:
    """Label the notes (best effort) and save them."""
    blurb = ""
    try:  # labels are nice-to-have: fall back quietly if the model call fails
        meta = llm.describe_document(content)
        title = title or meta["title"]
        subject = subject or meta["subject"]
        blurb = meta["blurb"]
    except Exception:
        pass
    row = sb.table("documents").insert(
        {
            "user_id": user_id,
            "title": (title or "Untitled notes")[:120],
            "subject": (subject or "General")[:60],
            "blurb": blurb[:240],
            "content": content,
        }
    ).execute().data[0]
    return {"id": row["id"], "title": row["title"], "subject": row["subject"]}


class LinkIn(BaseModel):
    url: str = Field(min_length=8, max_length=600)
    title: str = ""
    subject: str = ""


@router.post("/documents/link")
def create_from_link(body: LinkIn, user_id: str = Depends(current_user), _rl: str = Depends(limited("upload"))):
    """Import a web page, or the captions of a YouTube video."""
    url = body.url.strip()
    vid = sources.youtube_id(url)
    title, content = sources.youtube(vid) if vid else sources.fetch_page(url)
    if len(content) < 200:
        raise HTTPException(400, "Not enough readable text at that link (need roughly 200 characters).")
    return store_document(user_id, body.title.strip() or title, body.subject.strip(), content[:200_000])


@router.post("/documents")
async def create_document(
    title: str = Form(""),
    subject: str = Form(""),
    text: str = Form(""),
    file: UploadFile | None = File(default=None),
    user_id: str = Depends(current_user), _rl: str = Depends(limited("upload")),):
    if file is not None:
        raw = await file.read()
        if len(raw) > MAX_UPLOAD_BYTES:
            raise HTTPException(413, "File too large (12 MB max)")
        content = extract_text(file.filename or "notes.txt", raw)
        title = title or Path(file.filename or "").stem
    else:
        content = text.strip()
        if len(content) < 200:
            raise HTTPException(400, "Paste at least ~200 characters of notes to study from.")

    return store_document(user_id, title, subject, content)


@router.get("/documents")
def list_documents(user_id: str = Depends(current_user)):
    return documents_overview(user_id)


@router.get("/documents/{doc_id}")
def get_document(doc_id: str, user_id: str = Depends(current_user), lang: str = Depends(user_lang)):
    doc = own_row("documents", doc_id, user_id)
    summaries, quizzes, mastery = par(
        lambda: sb.table("summaries").select("level,topic,content").eq("document_id", doc_id).eq("lang", lang).execute().data,
        lambda: sb.table("quizzes").select("id,title,scope,topic,created_at").eq("document_id", doc_id)
        .order("created_at", desc=True).execute().data,
        lambda: sb.table("topic_mastery").select("correct,total").eq("user_id", user_id).eq("document_id", doc_id).execute().data,
    )
    topic_summaries: dict[str, dict[str, str]] = {}
    for s in summaries:
        if s["topic"]:
            topic_summaries.setdefault(s["topic"], {})[s["level"]] = s["content"]
    answered = sum(m["total"] for m in mastery)
    return {
        "id": doc["id"],
        "title": doc["title"],
        "subject": doc["subject"],
        "blurb": doc["blurb"],
        "chars": len(doc["content"]),
        "summaries": {s["level"]: s["content"] for s in summaries if not s["topic"]},
        "topic_summaries": topic_summaries,
        "topics": [{"title": t["title"], "blurb": t["blurb"]} for t in doc["topics"]],
        "quizzes": quizzes,
        "mastery_pct": round(100 * sum(m["correct"] for m in mastery) / answered) if answered else None,
    }


def ensure_outline(doc: dict) -> list[dict]:
    """Break the notes into topics once, then reuse the saved outline."""
    if doc["topics"]:
        return doc["topics"]
    try:
        topics = llm.generate_outline(doc["content"])
    except Exception as exc:
        raise HTTPException(502, f"Could not map the notes into topics: {exc}")
    sb.table("documents").update({"topics": topics}).eq("id", doc["id"]).execute()
    return topics


@router.post("/documents/{doc_id}/outline")
def build_outline(doc_id: str, user_id: str = Depends(current_user), _rl: str = Depends(limited("ai"))):
    doc = own_row("documents", doc_id, user_id)
    topics = ensure_outline(doc)
    return {"topics": [{"title": t["title"], "blurb": t["blurb"]} for t in topics]}


@router.get("/documents/{doc_id}/notes")
def read_notes(doc_id: str, topic: str = "", user_id: str = Depends(current_user)):
    """The original notes, optionally cut down to one topic so a student can reread just that part."""
    doc = own_row("documents", doc_id, user_id)
    text, sliced = doc["content"], False
    found = sorted((t["offset"], t["title"]) for t in doc["topics"] if t.get("offset", -1) >= 0)
    if topic and len(found) >= max(2, len(doc["topics"]) // 2):
        for i, (start, title) in enumerate(found):
            if title == topic:
                end = found[i + 1][0] if i + 1 < len(found) else len(text)
                text, sliced = text[start:end].strip(), True
                break
    return {"topic": topic if sliced else "", "text": text, "sliced": sliced}


class DocPatch(BaseModel):
    title: str | None = None
    subject: str | None = None


@router.patch("/documents/{doc_id}")
def patch_document(doc_id: str, body: DocPatch, user_id: str = Depends(current_user)):
    own_row("documents", doc_id, user_id)
    changes = {k: v.strip()[:120] for k, v in body.model_dump().items() if v and v.strip()}
    if changes:
        sb.table("documents").update(changes).eq("id", doc_id).execute()
    return {"ok": True}


@router.delete("/documents/{doc_id}")
def delete_document(doc_id: str, user_id: str = Depends(current_user)):
    own_row("documents", doc_id, user_id)
    files = [f"{user_id}/{p['id']}.wav" for p in sb.table("podcasts").select("id").eq("document_id", doc_id).execute().data]
    sb.table("documents").delete().eq("id", doc_id).execute()
    if files:
        try:
            sb.storage.from_("podcasts").remove(files)
        except Exception:
            pass  # orphaned audio is harmless; the metadata row is already gone
    return {"ok": True}
