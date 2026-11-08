from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Response

import audio
from deps import current_user, own_row, parse_ts, sb, user_lang
from limits import limited, limited_ip
from routers.documents import ensure_outline

router = APIRouter(prefix="/api")

BUCKET = "podcasts"
STALE_AFTER = timedelta(minutes=12)  # a job that long without finishing died with the server
LEVELS = ("beginner", "intermediate", "advanced")


def _bucket():
    try:
        sb.storage.create_bucket(BUCKET, options={"public": False})
    except Exception:
        pass  # already exists
    return sb.storage.from_(BUCKET)


def _view(row: dict | None) -> dict:
    if not row:
        return {"status": "none"}
    status = row["status"]
    if status == "generating" and datetime.now(timezone.utc) - parse_ts(row["created_at"]) > STALE_AFTER:
        status = "failed"
    return {
        "id": row["id"],
        "status": status,
        "title": row["title"],
        "script": row["script"],
        "seconds": row["seconds"],
        "error": row["error"] or ("Generation timed out. Try again." if status == "failed" and row["status"] == "generating" else ""),
    }


def _find(doc_id: str, topic: str, level: str, lang: str) -> dict | None:
    res = sb.table("podcasts").select("*").eq("document_id", doc_id).eq("topic", topic).eq("level", level).eq("lang", lang).limit(1).execute()
    return res.data[0] if res.data else None


def _run(pid: str, user_id: str, doc: dict, topics: list[dict], topic: str, level: str, lang: str):
    """Background job: write the script, perform it, store the audio."""
    try:
        script = audio.write_script(doc["content"], level, topics, topic, lang)
        sb.table("podcasts").update({"title": script["title"], "script": script["turns"]}).eq("id", pid).execute()
        wav = audio.synthesize(script["turns"])
        _bucket().upload(f"{user_id}/{pid}.wav", wav, {"content-type": "audio/wav", "upsert": "true"})
        sb.table("podcasts").update({"status": "ready", "seconds": audio.seconds_of(wav), "error": ""}).eq("id", pid).execute()
    except Exception as exc:
        sb.table("podcasts").update({"status": "failed", "error": f"{type(exc).__name__}: {exc}"[:300]}).eq("id", pid).execute()


@router.get("/documents/{doc_id}/podcast")
def get_podcast(doc_id: str, topic: str = "", level: str = "intermediate", user_id: str = Depends(current_user), lang: str = Depends(user_lang)):
    own_row("documents", doc_id, user_id)
    return _view(_find(doc_id, topic, level, lang))


@router.post("/documents/{doc_id}/podcast")
def make_podcast(
    doc_id: str, tasks: BackgroundTasks, topic: str = "", level: str = "intermediate", regenerate: bool = False,
    user_id: str = Depends(current_user), lang: str = Depends(user_lang), _rl: str = Depends(limited("ai")),):
    if level not in LEVELS:
        raise HTTPException(400, "level must be beginner, intermediate or advanced")
    doc = own_row("documents", doc_id, user_id)
    topics = ensure_outline(doc)
    if topic and topic not in {t["title"] for t in topics}:
        raise HTTPException(400, "Unknown topic")

    row = _find(doc_id, topic, level, lang)
    if row:
        current = _view(row)
        if current["status"] in ("ready", "generating") and not (regenerate and current["status"] == "ready"):
            return current
        sb.table("podcasts").update(
            {"status": "generating", "error": "", "script": [], "created_at": datetime.now(timezone.utc).isoformat()}
        ).eq("id", row["id"]).execute()
        pid = row["id"]
    else:
        pid = sb.table("podcasts").insert(
            {"document_id": doc_id, "user_id": user_id, "topic": topic, "level": level, "lang": lang}
        ).execute().data[0]["id"]
    tasks.add_task(_run, pid, user_id, doc, topics, topic, level, lang)
    return {"id": pid, "status": "generating", "title": "", "script": [], "seconds": 0, "error": ""}


@router.get("/podcasts/{pid}/audio")
def podcast_audio(pid: str, user_id: str = Depends(current_user)):
    row = own_row("podcasts", pid, user_id)
    if row["status"] != "ready":
        raise HTTPException(409, "Audio is not ready yet")
    try:
        data = _bucket().download(f"{user_id}/{pid}.wav")
    except Exception:
        raise HTTPException(404, "Audio file is missing. Regenerate it.")
    return Response(data, media_type="audio/wav", headers={"Cache-Control": "private, max-age=3600"})
