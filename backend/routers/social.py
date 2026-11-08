import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

import logic
from deps import current_user, own_row, par, sb, today_local, tz_offset
from limits import limited, limited_ip
from routers.documents import store_document

router = APIRouter(prefix="/api")

CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O or 1/I, so codes survive being read aloud
MAX_GROUPS = 5
MAX_MEMBERS = 30


# ---------- share links ----------


def active_share(doc_id: str) -> dict | None:
    rows = sb.table("shares").select("token,created_at").eq("document_id", doc_id).eq("revoked", False).limit(1).execute().data
    return rows[0] if rows else None


@router.get("/documents/{doc_id}/share")
def get_share(doc_id: str, user_id: str = Depends(current_user)):
    own_row("documents", doc_id, user_id)
    share = active_share(doc_id)
    return {"token": share["token"] if share else None}


@router.post("/documents/{doc_id}/share")
def create_share(doc_id: str, user_id: str = Depends(current_user)):
    own_row("documents", doc_id, user_id)
    share = active_share(doc_id)
    if not share:
        token = secrets.token_urlsafe(16)
        sb.table("shares").insert({"token": token, "user_id": user_id, "document_id": doc_id}).execute()
        return {"token": token}
    return {"token": share["token"]}


@router.delete("/documents/{doc_id}/share")
def revoke_share(doc_id: str, user_id: str = Depends(current_user)):
    own_row("documents", doc_id, user_id)
    sb.table("shares").update({"revoked": True}).eq("document_id", doc_id).eq("user_id", user_id).execute()
    return {"ok": True}


def shared_doc(token: str) -> dict:
    rows = sb.table("shares").select("document_id").eq("token", token).eq("revoked", False).limit(1).execute().data
    if not rows:
        raise HTTPException(404, "This link is no longer shared")
    docs = sb.table("documents").select("*").eq("id", rows[0]["document_id"]).limit(1).execute().data
    if not docs:
        raise HTTPException(404, "This link is no longer shared")
    return docs[0]


@router.get("/shared/{token}")
def read_shared(token: str, _rl: str = Depends(limited_ip("public"))):
    """Public and read-only: the title, a summary and the flashcards. The full notes are only copied on import."""
    doc = shared_doc(token)
    summaries = sb.table("summaries").select("level,lang,content").eq("document_id", doc["id"]).eq("topic", "").execute().data
    best = next((s for lvl in ("intermediate", "beginner", "advanced") for s in summaries if s["level"] == lvl), None)
    cards = sb.table("flashcards").select("front,back,topic").eq("document_id", doc["id"]).order("created_at").limit(100).execute().data
    return {
        "title": doc["title"],
        "subject": doc["subject"],
        "blurb": doc["blurb"],
        "summary": best["content"] if best else "",
        "cards": cards,
    }


@router.post("/shared/{token}/copy")
def copy_shared(token: str, user_id: str = Depends(current_user), _rl: str = Depends(limited("upload"))):
    doc = shared_doc(token)
    return store_document(user_id, doc["title"], doc["subject"], doc["content"])


# ---------- study groups ----------


class GroupIn(BaseModel):
    name: str = Field(min_length=2, max_length=50)


class JoinIn(BaseModel):
    code: str = Field(min_length=4, max_length=12)


def memberships(user_id: str) -> list[str]:
    return [m["group_id"] for m in sb.table("group_members").select("group_id").eq("user_id", user_id).execute().data]


@router.post("/groups")
def create_group(body: GroupIn, user_id: str = Depends(current_user)):
    if len(memberships(user_id)) >= MAX_GROUPS:
        raise HTTPException(400, f"You can be in up to {MAX_GROUPS} groups")
    for _ in range(8):
        code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(6))
        if not sb.table("study_groups").select("id").eq("code", code).execute().data:
            break
    row = sb.table("study_groups").insert({"name": body.name.strip(), "code": code, "owner_id": user_id}).execute().data[0]
    sb.table("group_members").insert({"group_id": row["id"], "user_id": user_id}).execute()
    return {"id": row["id"], "code": code}


@router.post("/groups/join")
def join_group(body: JoinIn, user_id: str = Depends(current_user)):
    rows = sb.table("study_groups").select("id,name").eq("code", body.code.strip().upper()).limit(1).execute().data
    if not rows:
        raise HTTPException(404, "No group has that code")
    gid = rows[0]["id"]
    if gid in memberships(user_id):
        return {"id": gid, "name": rows[0]["name"]}
    if len(memberships(user_id)) >= MAX_GROUPS:
        raise HTTPException(400, f"You can be in up to {MAX_GROUPS} groups")
    count = sb.table("group_members").select("user_id", count="exact").eq("group_id", gid).execute().count or 0
    if count >= MAX_MEMBERS:
        raise HTTPException(400, "That group is full")
    sb.table("group_members").insert({"group_id": gid, "user_id": user_id}).execute()
    return {"id": gid, "name": rows[0]["name"]}


@router.get("/groups")
def my_groups(user_id: str = Depends(current_user), offset: int = Depends(tz_offset)):
    """Each group with this week's XP leaderboard. Members see each other's display name and weekly XP, nothing else."""
    ids = memberships(user_id)
    if not ids:
        return []
    groups, members = par(
        lambda: sb.table("study_groups").select("id,name,code,owner_id").in_("id", ids).execute().data,
        lambda: sb.table("group_members").select("group_id,user_id").in_("group_id", ids).execute().data,
    )
    everyone = list({m["user_id"] for m in members})
    start_local = datetime.combine(logic.week_start(today_local(offset)), datetime.min.time())
    since = (start_local + timedelta(minutes=offset)).replace(tzinfo=timezone.utc).isoformat()
    name_rows, activity = par(
        lambda: sb.table("profiles").select("user_id,display_name").in_("user_id", everyone).execute().data,
        lambda: sb.table("activity").select("user_id,xp,minutes").in_("user_id", everyone).gte("created_at", since).execute().data,
    )
    names = {p["user_id"]: p["display_name"] for p in name_rows}
    xp: dict[str, int] = {}
    minutes: dict[str, float] = {}
    for e in activity:
        xp[e["user_id"]] = xp.get(e["user_id"], 0) + e["xp"]
        minutes[e["user_id"]] = minutes.get(e["user_id"], 0) + float(e["minutes"])
    out = []
    for g in groups:
        rows = [
            {
                "name": names.get(m["user_id"]) or "Student",
                "xp": xp.get(m["user_id"], 0),
                "minutes": round(minutes.get(m["user_id"], 0)),
                "you": m["user_id"] == user_id,
            }
            for m in members
            if m["group_id"] == g["id"]
        ]
        rows.sort(key=lambda r: r["xp"], reverse=True)
        out.append({"id": g["id"], "name": g["name"], "code": g["code"], "owner": g["owner_id"] == user_id, "members": rows})
    return out


@router.delete("/groups/{group_id}/leave")
def leave_group(group_id: str, user_id: str = Depends(current_user)):
    if group_id not in memberships(user_id):
        raise HTTPException(404, "You are not in that group")
    sb.table("group_members").delete().eq("group_id", group_id).eq("user_id", user_id).execute()
    left = sb.table("group_members").select("user_id", count="exact").eq("group_id", group_id).execute().count or 0
    if left == 0:
        sb.table("study_groups").delete().eq("id", group_id).execute()
    return {"ok": True}
