"""Create the demo account with every feature already filled in, so StudyMate can be shown without any AI calls.

Run from the app folder with the backend venv active, after supabase/schema.sql has been run:

    python scripts/seed_demo.py              # (re)create the demo account and its friends
    python scripts/seed_demo.py --no-audio   # skip recording the audio overview (it uses the Gemini voice quota)
    python scripts/seed_demo.py --dry-run    # check the content only; touches nothing

Running it again resets the demo account to this exact state. The sign-in details are written to
backend/.demo-account.txt (not printed, and ignored by git).
"""
import argparse
import json
import secrets
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import demo_data as D  # noqa: E402

CREDENTIALS = ROOT / "backend" / ".demo-account.txt"
HOME_OFFSET_MIN = 330  # the demo student lives in India (UTC+5:30), so "today" and the streak line up for them
NEEDED = ["profiles", "documents", "summaries", "flashcards", "quizzes", "attempts", "topic_mastery", "activity", "podcasts",
          "exams", "badges", "challenge_claims", "extras", "annotations", "shares", "study_groups", "group_members"]
NEEDED_COLUMNS = [("summaries", "lang"), ("flashcards", "ease"), ("quizzes", "mode"), ("documents", "topics"), ("podcasts", "lang")]


def home_today(now: datetime):
    return (now + timedelta(minutes=HOME_OFFSET_MIN)).date()


def moment(now: datetime, days_ago: int, minute: int) -> datetime:
    """A UTC time on a given home-time day. `minute` is minutes after 08:00 home time, never later than now."""
    local_midnight = datetime.combine(home_today(now) - timedelta(days=days_ago), datetime.min.time(), tzinfo=timezone.utc)
    utc = local_midnight + timedelta(minutes=480 + minute - HOME_OFFSET_MIN)
    return min(utc, now - timedelta(minutes=1))


def check_schema(sb) -> list[str]:
    missing = []
    for t in NEEDED:
        try:
            sb.table(t).select("*").limit(1).execute()
        except Exception:
            missing.append(t)
    for t, c in NEEDED_COLUMNS:
        if t not in missing:
            try:
                sb.table(t).select(c).limit(1).execute()
            except Exception:
                missing.append(f"{t}.{c}")
    return missing


def recreate_user(sb, email: str, password: str, name: str) -> str:
    for u in sb.auth.admin.list_users(page=1, per_page=200):
        if u.email == email:
            sb.auth.admin.delete_user(u.id)  # cascades to everything that belonged to it
    return sb.auth.admin.create_user({"email": email, "password": password, "email_confirm": True, "user_metadata": {"name": name}}).user.id


def insert(sb, table: str, rows: list[dict] | dict):
    return sb.table(table).insert(rows).execute().data


def seed(audio: bool) -> None:
    from dotenv import load_dotenv

    load_dotenv(ROOT / "backend" / ".env")  # the keys the backend modules read when they are imported
    from deps import sb
    import logic

    missing = check_schema(sb)
    if missing:
        sys.exit("The database is missing: " + ", ".join(missing) + "\nRun supabase/schema.sql in the Supabase SQL editor, then run this again.")

    now = datetime.now(timezone.utc)
    today = home_today(now)
    password = CREDENTIALS.read_text().split("password:")[-1].strip() if CREDENTIALS.exists() and "password:" in CREDENTIALS.read_text() else secrets.token_urlsafe(14)

    print("Creating users...")
    uid = recreate_user(sb, D.DEMO["email"], password, D.DEMO["name"])
    friends = [(f, recreate_user(sb, f["email"], secrets.token_urlsafe(24), f["name"])) for f in D.FRIENDS]  # nobody can sign in as these

    sb.table("profiles").upsert({"user_id": uid, "display_name": D.DEMO["name"], "daily_goal_xp": D.DEMO["goal"], "subjects": D.DEMO["subjects"], "onboarded": True}).execute()
    for f, fid in friends:
        sb.table("profiles").upsert({"user_id": fid, "display_name": f["name"], "daily_goal_xp": 100, "subjects": [], "onboarded": True}).execute()

    print("Notes, summaries and flashcards...")
    doc_id = {}
    for d in D.DOCS:
        row = insert(sb, "documents", {"user_id": uid, "title": d["title"], "subject": d["subject"], "blurb": d["blurb"], "content": d["content"],
                                       "topics": d["topics"], "created_at": moment(now, d["days_ago"], 0).isoformat()})[0]
        doc_id[d["key"]] = row["id"]
    insert(sb, "summaries", [
        {"document_id": doc_id[k], "user_id": uid, "level": lvl, "topic": topic, "lang": lang, "content": text,
         "created_at": moment(now, 8, 30).isoformat()}
        for k, lvl, topic, lang, text in D.SUMMARIES
    ])
    cards = []
    for i, (k, topic, front, back, (interval, ease, streak, lapses, reviews, due_in)) in enumerate(D.CARDS):
        due = now + timedelta(days=due_in) if due_in > 0 else now - timedelta(hours=2 + i % 5)
        cards.append({"document_id": doc_id[k], "user_id": uid, "topic": topic, "front": front, "back": back,
                      "interval_days": interval, "ease": ease, "streak": streak, "lapses": lapses, "reviews": reviews,
                      "due_at": due.isoformat(), "last_reviewed": (now - timedelta(days=max(interval, 1))).isoformat() if reviews else None})
    insert(sb, "flashcards", cards)

    print("Quizzes, attempts and mastery...")
    quiz_id, quiz = {}, {q["key"]: q for q in D.QUIZZES}
    for q in D.QUIZZES:
        limit = logic.quiz_time_limit([x["type"] for x in q["questions"]]) if q["mode"] == "exam" else 0
        first = doc_id[q["docs"][0]]
        row = insert(sb, "quizzes", {"document_id": first, "document_ids": [doc_id[k] for k in q["docs"]] if len(q["docs"]) > 1 else [],
                                     "user_id": uid, "title": q["title"], "questions": q["questions"], "scope": q["scope"], "topic": q["topic"],
                                     "mode": q["mode"], "time_limit_sec": limit, "created_at": moment(now, 12, 0).isoformat()})[0]
        quiz_id[q["key"]] = row["id"]
    mastery: dict[str, list] = {}
    for key, days_ago, wrong, seconds in D.ATTEMPTS:
        qs = quiz[key]["questions"]
        score = len(qs) - len(wrong)
        when = moment(now, days_ago, 120)
        insert(sb, "attempts", {"quiz_id": quiz_id[key], "user_id": uid, "answers": D.answers_for(qs, wrong), "score": score, "total": len(qs),
                                "xp": 10 * score, "seconds": seconds, "created_at": when.isoformat()})
        for i, q in enumerate(qs):
            m = mastery.setdefault(q["topic"], [0, 0, doc_id[quiz[key]["docs"][0]], when])
            m[0] += int(i not in wrong)
            m[1] += 1
            m[3] = max(m[3], when)
    for topic, (c, n, did, when) in mastery.items():
        sb.table("topic_mastery").upsert({"user_id": uid, "topic": topic, "correct": c, "total": n, "document_id": did, "updated_at": when.isoformat()}).execute()

    print("Activity history...")
    events = D.activity_events(today)
    rows = [{"user_id": uid, "kind": e["kind"], "xp": e["xp"], "minutes": e["minutes"], "document_id": doc_id["photo"] if e["days_ago"] % 3 else doc_id["newton"],
             "created_at": moment(now, e["days_ago"], e["minute"] - 300).isoformat()} for e in events]
    for i in range(0, len(rows), 150):
        insert(sb, "activity", rows[i:i + 150])

    print("Mind map, cheat sheet, highlights, planner, sharing and group...")
    insert(sb, "extras", [
        {"document_id": doc_id["photo"], "user_id": uid, "kind": "mindmap", "lang": "en", "content": json.dumps(D.MINDMAP, ensure_ascii=False)},
        {"document_id": doc_id["photo"], "user_id": uid, "kind": "cheatsheet", "lang": "en", "content": D.CHEATSHEET},
    ])
    insert(sb, "annotations", [{"user_id": uid, "document_id": doc_id[k], "level": lvl, "topic": topic, "text": text, "note": note}
                               for k, lvl, topic, text, note in D.HIGHLIGHTS])
    insert(sb, "exams", [{"user_id": uid, "name": e["name"], "exam_date": (today + timedelta(days=e["in_days"])).isoformat(),
                          "document_ids": [doc_id[k] for k in e["docs"]]} for e in D.EXAMS])
    insert(sb, "shares", {"token": D.SHARE_TOKEN, "user_id": uid, "document_id": doc_id["photo"]})
    sb.table("study_groups").delete().eq("code", D.GROUP["code"]).execute()
    group = insert(sb, "study_groups", {"name": D.GROUP["name"], "code": D.GROUP["code"], "owner_id": uid})[0]
    insert(sb, "group_members", [{"group_id": group["id"], "user_id": u} for u in [uid] + [fid for _, fid in friends]])
    week_events = []
    for f, fid in friends:
        for k, ev in enumerate(D.friend_events(f["xp"])):
            week_events.append({"user_id": fid, **ev, "created_at": (now - timedelta(minutes=20 + 7 * k)).isoformat()})
    insert(sb, "activity", week_events)

    # one of today's challenges is already claimed, one is ready to claim, and one is still open
    claim = next((c for c in logic.todays_challenges(today) if c[0] in ("summary", "focus")), None)
    if claim:
        insert(sb, "challenge_claims", {"user_id": uid, "day": today.isoformat(), "key": claim[0]})
        insert(sb, "activity", {"user_id": uid, "kind": "bonus", "xp": claim[3], "minutes": 0, "created_at": (now - timedelta(minutes=30)).isoformat()})

    print("Badges...")
    from routers import gamify

    snap = gamify.snapshot(uid, -HOME_OFFSET_MIN)
    earned = [b["id"] for b in logic.evaluate_badges(gamify.badge_values(uid, -HOME_OFFSET_MIN, gamify.events_of(uid), snap)) if b["earned"]]
    insert(sb, "badges", [{"user_id": uid, "badge": b, "seen": True} for b in earned])  # seen, so no pop-ups during the demo

    if audio:
        print("Recording the audio overview (a few Gemini voice calls)...")
        try:
            import audio as voice
            from routers.podcast import _bucket

            turns = [{"speaker": s, "style": st, "text": t} for s, st, t in D.PODCAST_SCRIPT]
            wav = voice.synthesize(turns)
            pod = insert(sb, "podcasts", {"document_id": doc_id["photo"], "user_id": uid, "topic": "", "level": "intermediate", "lang": "en",
                                          "status": "generating", "title": "Photosynthesis in five minutes", "script": turns})[0]
            _bucket().upload(f"{uid}/{pod['id']}.wav", wav, {"content-type": "audio/wav", "upsert": "true"})
            sb.table("podcasts").update({"status": "ready", "seconds": voice.seconds_of(wav)}).eq("id", pod["id"]).execute()
            print(f"  audio overview ready ({voice.seconds_of(wav)} s)")
        except Exception as exc:
            print(f"  could not record the audio overview ({type(exc).__name__}: {str(exc)[:100]}). Everything else is in place; rerun later without --no-audio.")

    CREDENTIALS.write_text(f"email: {D.DEMO['email']}\npassword: {password}\nshare link: /s/{D.SHARE_TOKEN}\ngroup code: {D.GROUP['code']}\n", encoding="utf8")
    print(f"\nDemo account ready: {D.DEMO['email']}")
    print(f"Sign-in details are in {CREDENTIALS}")
    print(f"Badges earned: {len(earned)}   XP: {snap['xp_total']}   Level: {snap['level']}   Streak: {snap['streak']} days")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-audio", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    if args.dry_run:
        print("Content checks run in: python -m pytest backend/tests/test_demo_data.py")
        events = D.activity_events(datetime.now(timezone.utc).date())
        print(f"{len(D.DOCS)} documents, {len(D.SUMMARIES)} summaries, {len(D.CARDS)} flashcards, {len(D.QUIZZES)} quizzes, {len(events)} activity events")
        return
    seed(audio=not args.no_audio)


if __name__ == "__main__":
    main()
