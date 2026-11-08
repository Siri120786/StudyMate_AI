import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

import llm
import logic
from deps import award, current_user, own_row, sb, user_lang
from limits import limited, limited_ip

router = APIRouter(prefix="/api")


# ---------- explain it back ----------


class ExplainIn(BaseModel):
    topic: str = Field(default="", max_length=80)
    explanation: str = Field(min_length=20, max_length=4000)


@router.post("/documents/{doc_id}/explain")
def explain(doc_id: str, body: ExplainIn, user_id: str = Depends(current_user), lang: str = Depends(user_lang), _rl: str = Depends(limited("ai"))):
    doc = own_row("documents", doc_id, user_id)
    try:
        result = llm.explain_feedback(doc["content"], body.topic.strip(), body.explanation.strip(), lang)
    except Exception as exc:
        raise HTTPException(502, f"Could not mark your explanation: {exc}")
    xp = min(15, result["score"] // 7)
    award(user_id, "explain", xp, minutes=2, document_id=doc_id)
    return {**result, "xp": xp}


# ---------- generated extras: mind map and cheat sheet ----------


def cached_extra(doc_id: str, kind: str, lang: str) -> str | None:
    rows = sb.table("extras").select("content").eq("document_id", doc_id).eq("kind", kind).eq("lang", lang).limit(1).execute().data
    return rows[0]["content"] if rows else None


def save_extra(doc_id: str, user_id: str, kind: str, lang: str, content: str) -> None:
    sb.table("extras").upsert(
        {"document_id": doc_id, "user_id": user_id, "kind": kind, "lang": lang, "content": content},
        on_conflict="document_id,kind,lang",
    ).execute()


@router.get("/documents/{doc_id}/mindmap")
def get_mindmap(doc_id: str, user_id: str = Depends(current_user), lang: str = Depends(user_lang)):
    own_row("documents", doc_id, user_id)
    raw = cached_extra(doc_id, "mindmap", lang)
    return {"tree": json.loads(raw) if raw else None}


@router.post("/documents/{doc_id}/mindmap")
def build_mindmap(doc_id: str, user_id: str = Depends(current_user), lang: str = Depends(user_lang), _rl: str = Depends(limited("ai"))):
    doc = own_row("documents", doc_id, user_id)
    try:
        tree = llm.make_mindmap(doc["content"], lang)
    except Exception as exc:
        raise HTTPException(502, f"Mind map failed: {exc}")
    save_extra(doc_id, user_id, "mindmap", lang, json.dumps(tree, ensure_ascii=False))
    return {"tree": tree}


@router.get("/documents/{doc_id}/cheatsheet")
def get_cheatsheet(doc_id: str, user_id: str = Depends(current_user), lang: str = Depends(user_lang)):
    own_row("documents", doc_id, user_id)
    return {"content": cached_extra(doc_id, "cheatsheet", lang)}


@router.post("/documents/{doc_id}/cheatsheet")
def build_cheatsheet(doc_id: str, user_id: str = Depends(current_user), lang: str = Depends(user_lang), _rl: str = Depends(limited("ai"))):
    doc = own_row("documents", doc_id, user_id)
    try:
        text = llm.make_cheatsheet(doc["content"], lang)
    except Exception as exc:
        raise HTTPException(502, f"Cheat sheet failed: {exc}")
    if not text.strip():
        raise HTTPException(502, "The model returned an empty cheat sheet. Try again.")
    save_extra(doc_id, user_id, "cheatsheet", lang, text)
    return {"content": text}


# ---------- search across the library ----------


def my_docs(user_id: str) -> list[dict]:
    return sb.table("documents").select("id,title,content").eq("user_id", user_id).execute().data


@router.get("/search")
def search(q: str, user_id: str = Depends(current_user)):
    """Find the passages in the student's own notes that best match a question or keywords."""
    q = q.strip()[:200]
    if len(q) < 2:
        return {"results": []}
    hits = logic.rank_passages(q, my_docs(user_id), k=8)
    return {"results": [{"doc": h["doc"], "title": h["title"], "text": h["text"][:420], "score": h["score"]} for h in hits]}


# ---------- highlights and notes ----------


class AnnotationIn(BaseModel):
    text: str = Field(min_length=2, max_length=600)
    note: str = Field(default="", max_length=500)
    topic: str = Field(default="", max_length=80)
    level: str = Field(default="", max_length=20)


class NoteIn(BaseModel):
    note: str = Field(default="", max_length=500)


@router.get("/documents/{doc_id}/annotations")
def list_annotations(doc_id: str, user_id: str = Depends(current_user)):
    own_row("documents", doc_id, user_id)
    return sb.table("annotations").select("id,topic,level,text,note,created_at").eq("document_id", doc_id).eq("user_id", user_id).order("created_at").execute().data


@router.post("/documents/{doc_id}/annotations")
def add_annotation(doc_id: str, body: AnnotationIn, user_id: str = Depends(current_user)):
    own_row("documents", doc_id, user_id)
    row = sb.table("annotations").insert(
        {"user_id": user_id, "document_id": doc_id, "text": body.text.strip(), "note": body.note.strip(), "topic": body.topic, "level": body.level}
    ).execute().data[0]
    return {k: row[k] for k in ("id", "topic", "level", "text", "note", "created_at")}


@router.patch("/annotations/{ann_id}")
def edit_annotation(ann_id: str, body: NoteIn, user_id: str = Depends(current_user)):
    own_row("annotations", ann_id, user_id)
    sb.table("annotations").update({"note": body.note.strip()}).eq("id", ann_id).execute()
    return {"ok": True}


@router.delete("/annotations/{ann_id}")
def delete_annotation(ann_id: str, user_id: str = Depends(current_user)):
    own_row("annotations", ann_id, user_id)
    sb.table("annotations").delete().eq("id", ann_id).execute()
    return {"ok": True}
