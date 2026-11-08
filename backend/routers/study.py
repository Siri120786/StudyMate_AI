from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

import llm
import logic
from routers.documents import ensure_outline
from deps import award, current_user, own_row, par, sb, sse, tz_offset, user_lang
from limits import limited, limited_ip
from langs import lang_note
from routers.gamify import snapshot

router = APIRouter(prefix="/api")

XP_PER_CORRECT = 10
XP_SUMMARY = 5
WEAK_BELOW = 0.7  # a topic scoring under this in a quiz counts as weak


# ---------- summary (streamed) ----------


@router.post("/documents/{doc_id}/summary")
def summarize(doc_id: str, level: str = "intermediate", topic: str = "", user_id: str = Depends(current_user), lang: str = Depends(user_lang), _rl: str = Depends(limited("ai"))):
    if level not in llm.LEVEL_PROMPTS:
        raise HTTPException(400, "level must be beginner, intermediate or advanced")
    doc = own_row("documents", doc_id, user_id)
    topics = ensure_outline(doc)
    if topic and topic not in {t["title"] for t in topics}:
        raise HTTPException(400, "Unknown topic")
    first_time = not (
        sb.table("summaries").select("id").eq("document_id", doc_id).eq("level", level).eq("topic", topic).eq("lang", lang).limit(1).execute().data
    )

    def save(full: str):
        sb.table("summaries").upsert(
            {"document_id": doc_id, "user_id": user_id, "level": level, "topic": topic, "lang": lang, "content": full},
            on_conflict="document_id,level,topic,lang",
        ).execute()
        if first_time:  # regenerating must not farm XP
            award(user_id, "summary", XP_SUMMARY, minutes=max(1, len(full.split()) / 200), document_id=doc_id)

    messages = llm.summary_messages(doc["content"], level, topics, topic, lang)
    return sse(llm.stream_text(llm.SUMMARY_SYSTEM, messages, max_tokens=8000 if topic else 14000), on_done=save)


# ---------- chat (streamed) ----------


class ChatTurn(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    document_id: str | None = None
    messages: list[ChatTurn]


@router.post("/chat")
def chat(req: ChatRequest, user_id: str = Depends(current_user), lang: str = Depends(user_lang), _rl: str = Depends(limited("ai"))):
    history = [{"role": m.role, "content": m.content} for m in req.messages[-12:] if m.role in ("user", "assistant")]
    if not history or history[0]["role"] != "user":
        raise HTTPException(400, "Conversation must start with a user message")
    if req.document_id:
        doc = own_row("documents", req.document_id, user_id)
        system = f"{llm.CHAT_SYSTEM}\n\n{llm.notes_block(doc['content'])}"
    else:
        docs = sb.table("documents").select("id,title,content").eq("user_id", user_id).execute().data
        passages = logic.rank_passages(history[-1]["content"], docs, k=6)
        if passages:
            system = f"{llm.LIBRARY_CHAT_SYSTEM}\n\n{llm.library_block(passages)}"
        else:
            system = llm.GENERAL_CHAT_SYSTEM
    system += lang_note(lang) + " If the student writes in another language, answer in that language."
    return sse(llm.stream_text(system, history, max_tokens=2000))


# ---------- flashcards ----------


class CardRequest(BaseModel):
    count: int = 12
    replace: bool = False


CARD_COLS = "id,topic,front,back,interval_days,reviews,due_at,ease,streak"


def with_preview(card: dict) -> dict:
    """Attach the days each rating button would schedule, so the UI can show them on the buttons."""
    return {**card, "next": logic.preview_intervals(card["ease"], card["streak"], card["interval_days"])}


@router.get("/documents/{doc_id}/flashcards")
def list_cards(doc_id: str, user_id: str = Depends(current_user)):
    own_row("documents", doc_id, user_id)
    cards = (
        sb.table("flashcards").select(CARD_COLS).eq("document_id", doc_id).eq("user_id", user_id)
        .order("created_at").execute().data
    )
    now = datetime.now(timezone.utc).isoformat()
    return {"cards": [with_preview(c) for c in cards], "due": sum(1 for c in cards if c["due_at"] <= now)}


@router.post("/documents/{doc_id}/flashcards")
def generate_cards(doc_id: str, req: CardRequest, user_id: str = Depends(current_user), lang: str = Depends(user_lang), _rl: str = Depends(limited("ai"))):
    doc = own_row("documents", doc_id, user_id)
    if req.replace:
        sb.table("flashcards").delete().eq("document_id", doc_id).eq("user_id", user_id).execute()
    try:
        cards = llm.generate_flashcards(doc["content"], max(6, min(req.count, 25)), lang)
    except Exception as exc:
        raise HTTPException(502, f"Flashcard generation failed: {exc}")
    if not cards:
        raise HTTPException(502, "Model returned no flashcards. Try again.")
    sb.table("flashcards").insert(
        [{"document_id": doc_id, "user_id": user_id, "topic": c["topic"][:60], "front": c["front"], "back": c["back"]} for c in cards]
    ).execute()
    return list_cards(doc_id, user_id)


class ReviewRequest(BaseModel):
    rating: str


@router.post("/flashcards/{card_id}/review")
def review_card(card_id: str, req: ReviewRequest, user_id: str = Depends(current_user)):
    if req.rating not in logic.QUALITY:
        raise HTTPException(400, "rating must be again, hard, good or easy")
    card = own_row("flashcards", card_id, user_id)
    nxt = logic.sm2(card["ease"], card["streak"], card["interval_days"], req.rating)
    now = datetime.now(timezone.utc)
    due = now + (timedelta(minutes=10) if nxt["interval"] == 0 else timedelta(days=nxt["interval"]))
    sb.table("flashcards").update(
        {
            "interval_days": nxt["interval"],
            "ease": nxt["ease"],
            "streak": nxt["streak"],
            "lapses": card["lapses"] + int(nxt["lapse"]),
            "reviews": card["reviews"] + 1,
            "due_at": due.isoformat(),
            "last_reviewed": now.isoformat(),
        }
    ).eq("id", card_id).execute()
    xp = logic.RATING_XP[req.rating]
    award(user_id, "flashcard", xp, minutes=0.5, document_id=card["document_id"])
    return {"interval_days": nxt["interval"], "xp": xp}


class CardIn(BaseModel):
    front: str = Field(min_length=1, max_length=400)
    back: str = Field(min_length=1, max_length=800)
    topic: str = Field(default="", max_length=60)


@router.post("/documents/{doc_id}/flashcards/manual")
def add_card(doc_id: str, body: CardIn, user_id: str = Depends(current_user)):
    own_row("documents", doc_id, user_id)
    row = sb.table("flashcards").insert(
        {"document_id": doc_id, "user_id": user_id, "topic": body.topic.strip() or "My card",
         "front": body.front.strip(), "back": body.back.strip()}
    ).execute().data[0]
    return with_preview({k: row[k] for k in CARD_COLS.split(",")})


@router.patch("/flashcards/{card_id}")
def edit_card(card_id: str, body: CardIn, user_id: str = Depends(current_user)):
    own_row("flashcards", card_id, user_id)
    sb.table("flashcards").update(
        {"front": body.front.strip(), "back": body.back.strip(), "topic": body.topic.strip() or "My card"}
    ).eq("id", card_id).execute()
    return {"ok": True}


@router.delete("/flashcards/{card_id}")
def delete_card(card_id: str, user_id: str = Depends(current_user)):
    own_row("flashcards", card_id, user_id)
    sb.table("flashcards").delete().eq("id", card_id).execute()
    return {"ok": True}


# ---------- quizzes ----------


class QuizRequest(BaseModel):
    count: int = 10
    focus_weak: bool = False
    topic: str | None = None
    types: list[str] = Field(default_factory=lambda: ["mcq"])
    exam: bool = False  # mock exam: timed, no hints


class MixedRequest(BaseModel):
    document_ids: list[str] = Field(min_length=2, max_length=8)
    count: int = 12
    types: list[str] = Field(default_factory=lambda: ["mcq"])
    exam: bool = False


def clean_types(types: list[str]) -> list[str]:
    return [t for t in types if t in logic.QUESTION_TYPES] or ["mcq"]


def save_quiz(user_id: str, doc_ids: list[str], title: str, quiz: dict, exam: bool, scope: str, topic: str = "") -> str:
    limit = logic.quiz_time_limit([q["type"] for q in quiz["questions"]]) if exam else 0
    row = sb.table("quizzes").insert(
        {
            "document_id": doc_ids[0],
            "document_ids": doc_ids if len(doc_ids) > 1 else [],
            "user_id": user_id,
            "title": title,
            "questions": quiz["questions"],
            "scope": scope,
            "topic": topic,
            "mode": "exam" if exam else "practice",
            "time_limit_sec": limit,
        }
    ).execute().data[0]
    return row["id"]


@router.post("/documents/{doc_id}/quiz")
def create_quiz(doc_id: str, req: QuizRequest, user_id: str = Depends(current_user), lang: str = Depends(user_lang), _rl: str = Depends(limited("ai"))):
    doc = own_row("documents", doc_id, user_id)
    topics = [t["title"] for t in ensure_outline(doc)]
    count = max(3, min(req.count, 20))
    if req.topic and req.topic not in topics:
        raise HTTPException(400, "Unknown topic")
    weak = []
    if req.focus_weak and not req.topic:
        rows = sb.table("topic_mastery").select("topic,correct,total").eq("user_id", user_id).eq("document_id", doc_id).execute().data
        weak = [r["topic"] for r in rows if r["topic"] in topics and r["total"] >= 1 and r["correct"] / r["total"] < WEAK_BELOW][:5]
    try:
        quiz = llm.generate_quiz(
            doc["content"], count, topics, focus=req.topic or "", weak_topics=weak, lang=lang,
            types=clean_types(req.types), exam=req.exam,
        )
    except Exception as exc:
        raise HTTPException(502, f"Quiz generation failed: {exc}")
    if req.exam:
        title = f"{req.topic}: mock exam" if req.topic else f"{doc['title']}: mock exam"
    else:
        title = f"{req.topic}: topic quiz" if req.topic else f"{doc['title']}: full lesson quiz"
    qid = save_quiz(user_id, [doc_id], title, quiz, req.exam, "topic" if req.topic else "lesson", req.topic or "")
    return {"id": qid}


@router.post("/quizzes/mixed")
def create_mixed_quiz(req: MixedRequest, user_id: str = Depends(current_user), lang: str = Depends(user_lang), _rl: str = Depends(limited("ai"))):
    """One quiz across several documents, for revising a whole subject before an exam."""
    ids = list(dict.fromkeys(req.document_ids))
    if len(ids) < 2:
        raise HTTPException(400, "Pick at least two documents")
    docs = [own_row("documents", i, user_id) for i in ids]
    share = max(2000, llm.MAX_DOC_CHARS // len(docs))
    content = "\n\n".join(f"### {d['title']}\n{d['content'][:share]}" for d in docs)
    topics = list(dict.fromkeys(t["title"] for d in docs for t in d["topics"]))  # only outlines that already exist
    try:
        quiz = llm.generate_quiz(
            content, max(4, min(req.count, 20)), topics, lang=lang, types=clean_types(req.types), exam=req.exam
        )
    except Exception as exc:
        raise HTTPException(502, f"Quiz generation failed: {exc}")
    names = " + ".join(d["title"] for d in docs[:2]) + (f" (+{len(docs) - 2})" if len(docs) > 2 else "")
    title = f"Mixed {'mock exam' if req.exam else 'quiz'}: {names}"
    return {"id": save_quiz(user_id, ids, title, quiz, req.exam, "mixed")}


@router.get("/quizzes")
def list_quizzes(user_id: str = Depends(current_user)):
    quizzes, doc_rows, attempts = par(
        lambda: sb.table("quizzes").select("id,title,document_id,scope,topic,mode,created_at,questions").eq("user_id", user_id)
        .order("created_at", desc=True).execute().data,
        lambda: sb.table("documents").select("id,title,subject").eq("user_id", user_id).execute().data,
        lambda: sb.table("attempts").select("quiz_id,score,total,created_at").eq("user_id", user_id)
        .order("created_at", desc=True).execute().data,
    )
    docs = {d["id"]: d for d in doc_rows}
    latest, counts = {}, {}
    for a in attempts:
        latest.setdefault(a["quiz_id"], a)
        counts[a["quiz_id"]] = counts.get(a["quiz_id"], 0) + 1
    return [
        {
            "id": q["id"],
            "title": q["title"],
            "document_id": q["document_id"],
            "scope": q["scope"],
            "topic": q["topic"],
            "mode": q["mode"],
            "doc_title": docs.get(q["document_id"], {}).get("title", ""),
            "subject": docs.get(q["document_id"], {}).get("subject", ""),
            "question_count": len(q["questions"]),
            "created_at": q["created_at"],
            "attempts": counts.get(q["id"], 0),
            "last": ({"score": latest[q["id"]]["score"], "total": latest[q["id"]]["total"]} if q["id"] in latest else None),
        }
        for q in quizzes
    ]


@router.get("/quizzes/{quiz_id}")
def get_quiz(quiz_id: str, user_id: str = Depends(current_user)):
    """Questions only: answers and explanations are withheld until an attempt is submitted."""
    quiz = own_row("quizzes", quiz_id, user_id)
    return {
        "id": quiz["id"],
        "title": quiz["title"],
        "document_id": quiz["document_id"],
        "mode": quiz["mode"],
        "time_limit_sec": quiz["time_limit_sec"],
        "questions": [
            {
                "type": q.get("type", "mcq"),
                "topic": q["topic"],
                "question": q["question"],
                "hint": "" if quiz["mode"] == "exam" else q.get("hint", ""),
                "options": q.get("options", []),
            }
            for q in quiz["questions"]
        ],
    }


class AttemptRequest(BaseModel):
    answers: list[int | str | None]
    seconds: int = 0


def grade(questions: list[dict], answers: list, lang: str) -> list[dict]:
    """Per question: {ok, feedback}. Choices and fill-ins are checked locally; written answers go to the AI."""
    out, short = [], []
    for i, (q, a) in enumerate(zip(questions, answers)):
        kind = q.get("type", "mcq")
        if kind in ("mcq", "tf"):
            ok = isinstance(a, int) and not isinstance(a, bool) and a == q["correct_index"]
        elif kind == "fill":
            ok = isinstance(a, str) and logic.fill_correct(a, q["answer"])
        else:
            ok = False
            if isinstance(a, str) and a.strip():
                short.append(i)
        out.append({"ok": ok, "feedback": ""})
    if short:
        items = [{"question": questions[i]["question"], "model_answer": questions[i]["answer"], "student": answers[i][:600]} for i in short]
        try:
            graded = llm.grade_short_answers(items, lang)
        except Exception:  # the AI being busy must not lose the student's attempt
            graded = [{"correct": logic.overlap_correct(it["student"], it["model_answer"]), "feedback": ""} for it in items]
        for i, g in zip(short, graded):
            out[i] = {"ok": bool(g["correct"]), "feedback": g.get("feedback", "")}
    return out


@router.post("/quizzes/{quiz_id}/attempt")
def submit_attempt(
    quiz_id: str, req: AttemptRequest, user_id: str = Depends(current_user), offset: int = Depends(tz_offset),
    lang: str = Depends(user_lang), _rl: str = Depends(limited("ai")),):
    quiz = own_row("quizzes", quiz_id, user_id)
    questions = quiz["questions"]
    if len(req.answers) != len(questions):
        raise HTTPException(400, "Answer count does not match question count")

    graded = grade(questions, req.answers, lang)
    review, per_topic = [], {}
    for q, a, g in zip(questions, req.answers, graded):
        review.append(
            {
                **q,
                "type": q.get("type", "mcq"),
                "your_index": a if isinstance(a, int) and not isinstance(a, bool) else None,
                "your_text": a if isinstance(a, str) else "",
                "is_correct": g["ok"],
                "feedback": g["feedback"],
            }
        )
        t = per_topic.setdefault(q["topic"], [0, 0])
        t[0] += int(g["ok"])
        t[1] += 1
    score = sum(r["is_correct"] for r in review)
    xp = score * XP_PER_CORRECT
    seconds = max(0, min(req.seconds, 6 * 3600))

    sb.table("attempts").insert(
        {"quiz_id": quiz_id, "user_id": user_id, "answers": req.answers, "score": score,
         "total": len(questions), "xp": xp, "seconds": seconds}
    ).execute()
    award(user_id, "quiz", xp, minutes=seconds / 60, document_id=quiz["document_id"])

    existing = {
        r["topic"]: r
        for r in sb.table("topic_mastery").select("*").eq("user_id", user_id).in_("topic", list(per_topic)).execute().data
    }
    now = datetime.now(timezone.utc).isoformat()
    for topic, (c, n) in per_topic.items():
        prev = existing.get(topic, {"correct": 0, "total": 0})
        sb.table("topic_mastery").upsert(
            {"user_id": user_id, "topic": topic, "correct": prev["correct"] + c, "total": prev["total"] + n,
             "updated_at": now, "document_id": quiz["document_id"]}
        ).execute()

    return {
        "score": score,
        "total": len(questions),
        "xp": xp,
        "streak": snapshot(user_id, offset)["streak"],
        "review": review,
        "document_id": quiz["document_id"],
        "topics": [
            {"topic": t, "correct": c, "total": n, "weak": c / n < WEAK_BELOW}
            for t, (c, n) in sorted(per_topic.items(), key=lambda kv: kv[1][0] / kv[1][1])
        ],
        "scope": quiz["scope"],
        "quiz_topic": quiz["topic"],
        "mode": quiz["mode"],
    }
