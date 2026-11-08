"""Pure study logic with no database or network access, so it can be tested on its own.

Spaced repetition (SM-2), levels, streak freezes, badges, daily challenges and the exam study plan.
"""
import math
import re
import unicodedata
from difflib import SequenceMatcher
from datetime import date, timedelta

# ---------- spaced repetition (SM-2) ----------

QUALITY = {"again": 1, "hard": 3, "good": 4, "easy": 5}
RATING_XP = {"again": 0, "hard": 1, "good": 2, "easy": 3}
MASTERED_DAYS = 7
MAX_INTERVAL = 365


def sm2(ease: float, streak: int, interval: int, rating: str) -> dict:
    """Next schedule for a card. `streak` is consecutive successful reviews, `interval` is the current gap in days."""
    q = QUALITY[rating]
    if q < 3:
        return {"ease": round(max(1.3, ease - 0.2), 2), "streak": 0, "interval": 0, "lapse": True}
    ease = max(1.3, ease + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
    streak += 1
    if streak == 1:
        days = {"hard": 1, "good": 2, "easy": 4}[rating]
    elif streak == 2:
        days = {"hard": 3, "good": 6, "easy": 8}[rating]
    else:
        factor = {"hard": 1.2, "good": ease, "easy": ease * 1.3}[rating]
        days = max(interval + 1, round(interval * factor))
    return {"ease": round(ease, 2), "streak": streak, "interval": min(MAX_INTERVAL, days), "lapse": False}


def preview_intervals(ease: float, streak: int, interval: int) -> dict:
    """Days until the card returns for each button, so the UI can show them. 0 means ten minutes."""
    return {r: sm2(ease, streak, interval, r)["interval"] for r in QUALITY}


# ---------- levels ----------


def level_info(xp: int) -> dict:
    """Level n starts at 50 * (n - 1)^2 XP, so early levels come quickly and later ones slow down."""
    xp = max(0, xp)
    level = int(math.sqrt(xp / 50)) + 1
    base, nxt = 50 * (level - 1) ** 2, 50 * level**2
    return {"level": level, "xp_into": xp - base, "xp_span": nxt - base}


def freeze_budget(level: int) -> int:
    """How many single missed days a streak can survive: one to start, one more every third level."""
    return 1 + level // 3


# ---------- streaks ----------


def streak_with_freezes(days: set[date], today: date, budget: int) -> tuple[int, int]:
    """Current streak (days actually studied) and how many freezes it used. A freeze bridges one missed day."""
    cursor = today if today in days else today - timedelta(days=1)  # today is still open, so it is never a miss
    streak, left = 0, budget
    while True:
        if cursor in days:
            streak += 1
        elif left > 0 and (cursor - timedelta(days=1)) in days:
            left -= 1
        else:
            break
        cursor -= timedelta(days=1)
    return streak, budget - left


def best_streak(days: set[date]) -> int:
    best = run = 0
    prev = None
    for d in sorted(days):
        run = run + 1 if prev and (d - prev).days == 1 else 1
        best = max(best, run)
        prev = d
    return best


# ---------- badges ----------

# value keys are filled in by the router from the database; names and descriptions live in the frontend.
BADGES = [
    ("first_upload", "upload_file", "docs", 1),
    ("library_5", "collections_bookmark", "docs", 5),
    ("first_summary", "article", "summaries", 1),
    ("first_quiz", "quiz", "quizzes", 1),
    ("quiz_10", "workspace_premium", "quizzes", 10),
    ("perfect_score", "stars", "perfect", 1),
    ("cards_50", "style", "reviews", 50),
    ("cards_250", "library_books", "reviews", 250),
    ("streak_3", "local_fire_department", "best_streak", 3),
    ("streak_7", "whatshot", "best_streak", 7),
    ("streak_30", "military_tech", "best_streak", 30),
    ("focus_first", "timer", "focus_sessions", 1),
    ("focus_5h", "hourglass_top", "focus_minutes", 300),
    ("mastery_1", "psychology", "mastered_topics", 1),
    ("mastery_5", "school", "mastered_topics", 5),
    ("level_5", "trending_up", "level", 5),
    ("early_bird", "wb_twilight", "early", 3),
    ("night_owl", "bedtime", "late", 3),
    ("exam_planned", "event", "exams", 1),
]


def evaluate_badges(values: dict) -> list[dict]:
    return [
        {"id": bid, "icon": icon, "value": min(values.get(key, 0), target), "target": target, "earned": values.get(key, 0) >= target}
        for bid, icon, key, target in BADGES
    ]


# ---------- daily challenges ----------

# (key, activity kind it counts, unit goal, bonus XP)
CHALLENGES = [
    ("cards", "flashcard", 10, 15),
    ("quiz", "quiz", 1, 20),
    ("focus", "focus_minutes", 25, 25),
    ("summary", "summary", 1, 10),
]


def todays_challenges(day: date) -> list[tuple]:
    """Three of the four challenges each day; the one left out rotates so the set changes daily."""
    skip = day.toordinal() % len(CHALLENGES)
    return [c for i, c in enumerate(CHALLENGES) if i != skip]


# ---------- exam study plan ----------

READ_MIN, CHECK_MIN, MOCK_MIN = 10, 8, 30
WEAK_BELOW = 70


def build_plan(exam: dict, docs: list[dict], today: date) -> dict:
    """
    Turn an exam date plus the student's progress into today's tasks.

    docs: [{id, title, topics:[{title}], summarized:set[str], whole_summary:bool, mastery:{topic:(correct,total)},
            cards:int, due:int}]
    Every topic has two steps (read it, then check it with a quiz); each document with cards adds a review step.
    """
    days_left = (exam["exam_date"] - today).days
    items = []  # every step with its done flag, used for the progress bar
    for d in docs:
        for t in d["topics"]:
            title = t["title"]
            read_done = d["whole_summary"] or title in d["summarized"]
            c, n = d["mastery"].get(title, (0, 0))
            weak = n > 0 and 100 * c / n < WEAK_BELOW
            checked = n >= 2 and not weak
            items.append({"kind": "read", "doc": d["id"], "doc_title": d["title"], "topic": title, "done": read_done, "minutes": READ_MIN})
            items.append({"kind": "check", "doc": d["id"], "doc_title": d["title"], "topic": title, "done": checked, "minutes": CHECK_MIN, "weak": weak})
        if d["cards"] == 0:
            items.append({"kind": "make_cards", "doc": d["id"], "doc_title": d["title"], "topic": "", "done": False, "minutes": 2})
        else:
            items.append({"kind": "cards", "doc": d["id"], "doc_title": d["title"], "topic": "", "done": d["due"] == 0, "minutes": min(15, max(2, math.ceil(d["due"] / 4))), "due": d["due"]})

    pending = [i for i in items if not i["done"]]
    total, done = len(items), len(items) - len(pending)

    # order: cards due now, weak topics, unread topics (in notes order), unchecked topics
    def rank(i):
        if i["kind"] in ("cards", "make_cards"):
            return 0
        if i["kind"] == "check" and i.get("weak"):
            return 1
        return 2 if i["kind"] == "read" else 3

    pending.sort(key=rank)  # stable, so topics keep their order within a rank
    work = [i for i in pending if i["kind"] not in ("cards", "make_cards")]
    cards = [i for i in pending if i["kind"] in ("cards", "make_cards")]
    if days_left <= 0:
        quota = len([i for i in work if i.get("weak")]) or 2  # exam day: only patch weak spots
    else:
        quota = min(8, max(2, math.ceil(len(work) / max(1, days_left))))
    today_tasks = cards + work[:quota]
    if 0 <= days_left <= 3 and docs and not work[quota:]:
        today_tasks.append({"kind": "mock", "doc": docs[0]["id"], "doc_title": docs[0]["title"], "topic": "", "done": False, "minutes": MOCK_MIN})
    return {
        "days_left": days_left,
        "progress": round(100 * done / total) if total else 0,
        "remaining": len(pending),
        "tasks": today_tasks,
        "minutes": sum(t["minutes"] for t in today_tasks),
    }


# ---------- quiz answers ----------

QUESTION_TYPES = ("mcq", "tf", "fill", "short")
SECONDS_PER = {"mcq": 60, "tf": 30, "fill": 60, "short": 150}


def normalize(text: str) -> str:
    """Lowercase, drop punctuation and English articles so 'The Calvin cycle.' matches 'calvin cycle'."""
    text = unicodedata.normalize("NFKC", text or "").lower()
    text = re.sub(r"[^\w\s]", " ", text)
    return " ".join(w for w in text.split() if w not in ("a", "an", "the"))


def fill_correct(student: str, answer: str) -> bool:
    a, b = normalize(student), normalize(answer)
    if not a or not b:
        return False
    return a == b or SequenceMatcher(None, a, b).ratio() >= 0.88  # tolerate a typo


def overlap_correct(student: str, model_answer: str) -> bool:
    """Fallback grader for short answers when the AI is unavailable: does it mention most of the key words?"""
    key = {w for w in normalize(model_answer).split() if len(w) > 3}
    got = set(normalize(student).split())
    return bool(key) and len(key & got) / len(key) >= 0.5


def quiz_time_limit(types: list[str]) -> int:
    """Seconds allowed for a mock exam with these question types."""
    return sum(SECONDS_PER.get(t, 60) for t in types)


# ---------- search over the student's own notes ----------

STOP_WORDS = frozenset(
    "a an and are as at be by for from how i in is it of on or that the this to was what when where which who why with you your do does did can could should would me my about tell explain".split()
)
_SPLIT = re.compile(r"[\s.,;:!?()\[\]{}\"'“”‘’\-–—/\|*#>_=+~`]+")


def tokens(text: str) -> list[str]:
    """Lowercased words. Splitting on punctuation instead of word characters keeps Hindi, Telugu and other scripts intact."""
    return [w for w in _SPLIT.split(unicodedata.normalize("NFKC", text or "").lower()) if len(w) > 1 and w not in STOP_WORDS]


def split_passages(text: str, size: int = 900) -> list[str]:
    out, cur = [], ""
    for para in re.split(r"\n\s*\n|\n", text):
        para = para.strip()
        if not para:
            continue
        if cur and len(cur) + len(para) > size:
            out.append(cur)
            cur = ""
        cur = f"{cur}\n{para}".strip()
        while len(cur) > size * 1.6:  # one huge paragraph
            out.append(cur[:size])
            cur = cur[size:]
    if cur:
        out.append(cur)
    return out


def rank_passages(query: str, docs: list[dict], k: int = 6, size: int = 900) -> list[dict]:
    """BM25 ranking of note passages for a question. docs: [{id, title, content}]. Returns the best k with score > 0."""
    q = set(tokens(query))
    if not q:
        return []
    corpus = [(d, p) for d in docs for p in split_passages(d["content"], size)]
    if not corpus:
        return []
    words = [tokens(p) for _, p in corpus]
    avg = sum(len(w) for w in words) / len(words) or 1
    df = {t: sum(1 for w in words if t in w) for t in q}
    scored = []
    for (d, p), w in zip(corpus, words):
        score = 0.0
        for t in q:
            tf = w.count(t)
            if tf:
                idf = math.log(1 + (len(corpus) - df[t] + 0.5) / (df[t] + 0.5))
                score += idf * tf * 2.2 / (tf + 1.2 * (0.25 + 0.75 * len(w) / avg))
        if score > 0:
            scored.append({"doc": d["id"], "title": d["title"], "text": p, "score": round(score, 3)})
    scored.sort(key=lambda r: r["score"], reverse=True)
    return scored[:k]


# ---------- study groups ----------


def week_start(today: date) -> date:
    """Monday of the week containing `today`; the group leaderboard resets then."""
    return today - timedelta(days=today.weekday())
