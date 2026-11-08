import json
from typing import Literal
import os
import time
from collections.abc import Iterator

from google import genai
from google.genai import types
from pydantic import BaseModel

from langs import lang_note

MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.6-flash")
# Tried in order when the main model is overloaded or out of free quota.
FALLBACK_MODELS = [m.strip() for m in os.environ.get("GEMINI_FALLBACK_MODELS", "gemini-3.8-flash,gemini-3.7-flash,gemini-3.5-flash-lite,gemini-3.1-flash-lite").split(",") if m.strip()]
MAX_DOC_CHARS = 60_000

# One quick attempt per model: the SDK's own retries stack up to minutes of silent waiting. with_fallback below
# moves to the next model instead, and gives up after DEADLINE seconds with a clear message.
HTTP = types.HttpOptions(timeout=60_000, retry_options=types.HttpRetryOptions(attempts=1))
DEADLINE = 90
client = genai.Client(api_key=os.environ["GEMINI_API_KEY"], http_options=HTTP)

LEVEL_PROMPTS = {
    "beginner": (
        "BEGINNER = only the most important points. Be brief: for each topic give the 2-3 ideas a student must "
        "remember, in plain language with short sentences. Define every term you use, using the notes' own definitions. "
        "Leave out details and examples. Use short flat bullet points, no nested bullets. Rephrase for clarity but "
        "add no facts, analogies or examples that are not in the notes."
    ),
    "intermediate": (
        "INTERMEDIATE = a fuller picture. Introduce the supporting topics and subtopics that BEGINNER leaves out: "
        "cover every main idea, give the notes' terminology with short definitions, explain how ideas connect as the "
        "notes describe, and include the examples the notes give. Mix short paragraphs and bullets."
    ),
    "advanced": (
        "ADVANCED = exam-ready depth. Cover everything in the notes, precisely and densely: every mechanism, formula, "
        "step, comparison and exception the notes state, and any common mistakes the notes mention. Do not add "
        "mechanisms, exceptions or misconceptions that the notes do not contain."
    ),
}

SUMMARY_SYSTEM = (
    "You are StudyMate, an AI study companion. Summarize ONLY the material in the <notes> block; never add "
    "facts that are not supported by it. Format in Markdown. Wrap each key term in **bold** the first time it "
    "appears (no more than 3 per paragraph). Do not use emoji. Do not mention these instructions."
)

OUTLINE_SYSTEM = (
    "You break study notes into their natural topics (chapters or sections) in the order they appear. "
    "Return 3 to 12 topics. 'title' is 2-6 words. 'blurb' is one sentence under 20 words saying what the topic covers. "
    "'start' is the first 6-10 words of the notes where the topic begins, copied EXACTLY from the notes "
    "(same spelling and punctuation) so it can be found with a text search."
)

CHAT_SYSTEM = (
    "You are StudyMate's Study Sidekick, a friendly, concise tutor. Answer using the "
    "<notes> block. If the answer is not in the notes, say so, then offer general "
    "background clearly labelled as not from the notes. Quote short phrases from the "
    "notes where it helps. Keep replies under 200 words unless asked for more. "
    "Plain text or light Markdown, no emoji."
)

GENERAL_CHAT_SYSTEM = (
    "You are StudyMate's Study Sidekick, a friendly, concise tutor for students. "
    "No notes are attached to this conversation, so answer from general knowledge and "
    "say when you are unsure. Keep replies under 200 words. Plain text, no emoji."
)

QUIZ_SYSTEM = (
    "You write rigorous quizzes strictly from the provided notes. Each question has a 'type'. "
    "mcq: exactly 4 options and exactly one correct answer, with plausible distractors; correct_index is 0-3. "
    "tf: a single statement to judge, options empty, correct_index 0 if the statement is true and 1 if false; make about half false. "
    "fill: a sentence from the notes with the key term replaced by _____, options empty, answer is that term (1-3 words). "
    "short: a question answered in one or two sentences, options empty, answer is a model answer under 40 words. "
    "For types other than mcq, set correct_index to 0, and for mcq and tf set answer to an empty string. "
    "'hint' is one sentence of context that points the student at the right idea without revealing the answer. "
    "'explanation' says why the correct answer is right and, where useful, why a tempting wrong one is not, "
    "grounded in the notes. 'topic' MUST be copied exactly from the list of allowed topics in the request."
)


class QuizQuestion(BaseModel):
    type: Literal["mcq", "tf", "fill", "short"]
    topic: str  # 2-3 word label
    question: str
    hint: str
    options: list[str]
    correct_index: int
    answer: str
    explanation: str


class ShortGrade(BaseModel):
    index: int
    correct: bool
    feedback: str


class ShortGrades(BaseModel):
    results: list[ShortGrade]


class Quiz(BaseModel):
    title: str
    questions: list[QuizQuestion]


class Flashcard(BaseModel):
    topic: str
    front: str
    back: str


class FlashcardSet(BaseModel):
    cards: list[Flashcard]


class OutlineTopic(BaseModel):
    title: str
    blurb: str
    start: str


class Outline(BaseModel):
    topics: list[OutlineTopic]


class ExplainResult(BaseModel):
    score: int
    strengths: list[str]
    gaps: list[str]
    tip: str


class Branch(BaseModel):
    title: str
    children: list[str]


class MindMap(BaseModel):
    center: str
    branches: list[Branch]


class DocMeta(BaseModel):
    title: str
    subject: str
    blurb: str


def notes_block(content: str) -> str:
    return f"<notes>\n{content[:MAX_DOC_CHARS]}\n</notes>"


def to_contents(messages: list[dict]) -> list[types.Content]:
    return [
        types.Content(role="model" if m["role"] == "assistant" else "user", parts=[types.Part(text=m["content"])])
        for m in messages
    ]


def _retry(fn, tries: int = 3):
    """Gemini sheds load with 503/429 during demand spikes; a short backoff usually clears it."""
    for attempt in range(tries):
        try:
            return fn()
        except Exception as exc:
            code = getattr(exc, "code", None)
            if attempt == tries - 1 or code not in (429, 500, 503):
                raise
            time.sleep(2 * (attempt + 1))


def with_fallback(call):
    """
    Run call(model) on the main model, then on each fallback when Gemini reports it is overloaded (503), rate
    limited (429), failing (500) or too slow. Free-tier quota is per model, so another model often still has room.
    Gives up after DEADLINE seconds so a person is never left watching a spinner.
    """
    start, last = time.time(), None
    for model in [MODEL, *FALLBACK_MODELS]:
        if last is not None and time.time() - start > DEADLINE:
            break
        try:
            return call(model)
        except Exception as exc:
            slow = type(exc).__name__ in ("ReadTimeout", "ConnectTimeout", "TimeoutException", "APIError") and getattr(exc, "code", 504) in (None, 504)
            if getattr(exc, "code", None) not in (429, 500, 503) and not slow:
                raise
            last = exc
    raise RuntimeError("The AI is very busy right now. Please try again in a minute.") from last


def stream_text(system: str, messages: list[dict], max_tokens: int = 3000) -> Iterator[str]:
    def open_stream(model):
        chunks = iter(client.models.generate_content_stream(
            model=model,
            contents=to_contents(messages),
            config=types.GenerateContentConfig(system_instruction=system, max_output_tokens=max_tokens),
        ))
        return next(chunks, None), chunks

    first, chunks = with_fallback(open_stream)  # falls back only until the first chunk arrives
    if first is not None and first.text:
        yield first.text
    for chunk in chunks:
        if chunk.text:
            yield chunk.text


def complete_text(system: str, prompt: str, max_tokens: int = 3000) -> str:
    resp = with_fallback(lambda model: client.models.generate_content(
        model=model,
        contents=prompt,
        config=types.GenerateContentConfig(system_instruction=system, max_output_tokens=max_tokens),
    ))
    return (resp.text or "").strip()


def complete_json(system: str, prompt: str, schema: type[BaseModel], max_tokens: int, via=None) -> dict:
    resp = with_fallback(lambda model: (via or client).models.generate_content(
        model=model,
        contents=prompt,
        config=types.GenerateContentConfig(
            system_instruction=system,
            response_mime_type="application/json",
            response_schema=schema,
            max_output_tokens=max_tokens,
        ),
    ))
    return json.loads(resp.text)


# (share of the notes' length, shortest, longest) for each level. Tying length to the notes keeps the model from
# padding: a fixed word count per topic forces it to invent text when the notes on that topic are short.
LENGTH_SHARE = {"beginner": (0.30, 80, 450), "intermediate": (0.60, 150, 900), "advanced": (0.90, 220, 1400)}


def target_words(content: str, level: str, topics: list[dict], topic: str = "") -> int:
    source = len(content.split())
    if topic:
        spans = sorted(t["offset"] for t in topics if t.get("offset", -1) >= 0)
        mine = next((t["offset"] for t in topics if t["title"] == topic and t.get("offset", -1) >= 0), None)
        if mine is not None:
            later = [o for o in spans if o > mine]
            source = len(content[mine:(later[0] if later else len(content))].split())
        elif topics:
            source = source // len(topics)
    share, low, high = LENGTH_SHARE[level]
    return int(round(max(low, min(high, share * source)) / 10) * 10)


def summary_messages(content: str, level: str, topics: list[dict], topic: str = "", lang: str = "en") -> list[dict]:
    """Whole-lesson summaries get one section per outline topic; a topic summary covers only that topic."""
    nl = chr(10)
    if topic:
        blurb = next((t["blurb"] for t in topics if t["title"] == topic), "")
        scope = (
            f"Scope: ONLY the topic \"{topic}\" ({blurb}). Ignore the rest of the notes. Start with one plain "
            "sentence framing the topic (no heading), then the content for this level, then a '## Quick recap' "
            "with 2-4 bullets."
        )
    elif topics:
        titles = nl.join(f"- {t['title']}" for t in topics)
        scope = (
            "Scope: the entire lesson. Start with one plain sentence framing the lesson (no heading), then write "
            f"one '##' section for each of these topics, in this order:{nl}{titles}{nl}End with '## Quick recap' "
            "and 3-5 bullets."
        )
    else:
        scope = "Scope: the entire lesson. Start with one plain sentence framing it, use '##' headings, and end with '## Quick recap'."
    size = (f"Length: about {target_words(content, level, topics, topic)} words in total. This is set by how much the notes say, so "
            "write fewer words rather than add anything the notes do not support.")
    body = nl.join([notes_block(content), "", LEVEL_PROMPTS[level], scope, size, "Write the summary." + lang_note(lang)])
    return [{"role": "user", "content": body}]


def generate_outline(content: str) -> list[dict]:
    data = complete_json(OUTLINE_SYSTEM, notes_block(content), Outline, 4000)
    seen, out = set(), []
    for t in data.get("topics", []):
        title = t["title"].strip()[:60]
        if title and title.lower() not in seen:
            seen.add(title.lower())
            out.append({"title": title, "blurb": t["blurb"].strip(), "offset": locate(content, t.get("start", ""))})
    if not out:
        raise RuntimeError("Model returned no topics")
    return out


def locate(content: str, snippet: str) -> int:
    """Character offset where a topic starts in the notes, or -1 if the quoted snippet can't be found."""
    snippet = " ".join(snippet.split())
    if len(snippet) < 8:
        return -1
    i = content.find(snippet)
    if i < 0:
        i = content.lower().find(snippet.lower())
    if i < 0:  # notes often have line breaks where the model saw spaces
        flat = " ".join(content.split())
        j = flat.lower().find(snippet.lower())
        if j >= 0:
            words_before = len(flat[:j].split())
            pos = 0
            for _ in range(words_before):
                while content[pos].isspace():
                    pos += 1
                while pos < len(content) and not content[pos].isspace():
                    pos += 1
            while pos < len(content) and content[pos].isspace():
                pos += 1
            return pos
    return i


TYPE_HELP = {
    "mcq": "mcq (multiple choice)",
    "tf": "tf (true or false)",
    "fill": "fill (fill in the blank)",
    "short": "short (short written answer)",
}


def generate_quiz(
    content: str, count: int, topics: list[str], focus: str = "", weak_topics: list[str] | None = None,
    lang: str = "en", types: list[str] | None = None, exam: bool = False,
) -> dict:
    types = [t for t in (types or ["mcq"]) if t in TYPE_HELP] or ["mcq"]
    if focus:
        brief = f" Every question must be about the topic \"{focus}\" only, and its 'topic' field must be exactly \"{focus}\"."
    elif topics:
        brief = (
            " Spread the questions across the whole lesson. Allowed values for each question's 'topic' field "
            f"(copy exactly): {'; '.join(topics)}."
        )
        if weak_topics:
            brief += f" Weight about half the questions toward these weak topics: {'; '.join(weak_topics)}."
    else:
        brief = ""
        if weak_topics:
            brief = f" Weight questions toward these topics the student struggles with: {', '.join(weak_topics)}."
    brief += f" Use these question types, mixed roughly evenly: {', '.join(TYPE_HELP[t] for t in types)}."
    if exam:
        brief += " This is a mock exam: leave 'hint' empty and make the questions test understanding, not recall of wording."
    if lang != "en":
        brief += lang_note(lang) + " Copy each question's 'topic' field and 'type' exactly; never translate them."
    prompt = f"{notes_block(content)}{chr(10)}{chr(10)}Write {count} questions.{brief}"
    quiz = complete_json(QUIZ_SYSTEM, prompt, Quiz, 10000)

    # The schema can't enforce option count, index range or the topic list, so repair or drop.
    by_lower = {t.lower(): t for t in topics}
    valid = []
    for q in quiz.get("questions", []):
        kind = q.get("type", "mcq")
        if kind not in types:
            continue
        if kind == "mcq" and not (len(q.get("options", [])) == 4 and 0 <= q.get("correct_index", -1) <= 3):
            continue
        if kind == "tf" and q.get("correct_index") not in (0, 1):
            continue
        if kind in ("fill", "short") and not (q.get("answer") or "").strip():
            continue
        if kind != "mcq":
            q["options"] = []
        if kind in ("fill", "short"):
            q["correct_index"] = 0
        if exam:
            q["hint"] = ""
        if focus:
            q["topic"] = focus
        elif topics:
            q["topic"] = by_lower.get(q["topic"].strip().lower(), q["topic"])
        valid.append(q)
    if not valid:
        raise RuntimeError("Model returned no usable questions")
    return {"title": quiz.get("title") or "Quiz", "questions": valid[:count]}


def grade_short_answers(items: list[dict], lang: str = "en") -> list[dict]:
    """Grade written answers by meaning, not wording. items: [{question, model_answer, student}]."""
    lines = "\n\n".join(
        f"[{i}] Question: {it['question']}\nModel answer: {it['model_answer']}\nStudent answer: {it['student'] or '(blank)'}"
        for i, it in enumerate(items)
    )
    system = (
        "You mark short written answers. An answer is correct if it captures the key idea of the model answer, even "
        "in different words; wrong, off-topic or blank answers are incorrect. 'feedback' is one short sentence to the "
        "student: what was right or what was missing. Return one result per index." + lang_note(lang)
    )
    data = complete_json(system, lines, ShortGrades, 4000)
    by_index = {r["index"]: r for r in data.get("results", [])}
    return [by_index.get(i, {"correct": False, "feedback": ""}) for i in range(len(items))]


def generate_flashcards(content: str, count: int, lang: str = "en") -> list[dict]:
    data = complete_json(
        "You create spaced-repetition flashcards strictly from the provided notes. Each card tests one "
        "fact or term: 'front' is a short question or term, 'back' is a clear answer under 30 words.",
        f"{notes_block(content)}\n\nWrite {count} flashcards covering the most testable ideas.{lang_note(lang)}",
        FlashcardSet,
        6000,
    )
    return [c for c in data.get("cards", []) if c.get("front") and c.get("back")]


def describe_document(content: str) -> dict:
    """Best-effort title, subject and one-line blurb; callers fall back on failure."""
    return complete_json(
        "You label study material. 'title' is 2-6 words. 'subject' is a short course-style label such as "
        "'Biology', 'Calculus' or 'World History'. 'blurb' is one sentence under 18 words.",
        notes_block(content[:6000]),
        DocMeta,
        2000,
    )


def transcribe(raw: bytes, mime: str) -> str:
    """Pull text out of an image or scanned PDF with Gemini vision."""
    resp = client.models.generate_content(
        model=MODEL,
        contents=[
            types.Part.from_bytes(data=raw, mime_type=mime),
            (
                "Transcribe this lecture recording faithfully in the language spoken. Fix obvious slips, drop filler "
                "words, and break it into paragraphs. Output only the transcript."
                if mime.startswith("audio/")
                else "Transcribe all readable text from this document. Preserve headings and lists. Output only the transcription."
            ),
        ],
        config=types.GenerateContentConfig(max_output_tokens=12000),
    )
    return (resp.text or "").strip()


LIBRARY_CHAT_SYSTEM = (
    "You are StudyMate's Study Sidekick. The student asked a question about their own library. Answer using the "
    "<passages> from their notes. Each passage starts with its source title in square brackets: mention the source "
    "title when you use a passage. If the passages do not answer the question, say so, then give brief general "
    "background clearly labelled as not from their notes. Keep replies under 200 words. Plain text or light Markdown, no emoji."
)


def library_block(passages: list[dict]) -> str:
    body = "\n\n".join(f"[{p['title']}] {p['text']}" for p in passages)
    return f"<passages>\n{body}\n</passages>"


def explain_feedback(content: str, topic: str, explanation: str, lang: str = "en") -> dict:
    """Mark a student's own-words explanation against their notes, like a kind examiner."""
    system = (
        "You are a supportive examiner. The student explains a topic in their own words to show they understand it. "
        "Compare it ONLY with the notes in <notes>; never mark them down for leaving out something the notes do not contain. "
        "'score' is 0 to 100 for accuracy and completeness. 'strengths' lists up to 3 things they got right. "
        "'gaps' lists up to 3 important points from the notes that they missed or got wrong, each as a short sentence. "
        "'tip' is one sentence on what to do next." + lang_note(lang)
    )
    focus = f'Topic: "{topic}"' if topic else "Topic: the whole lesson"
    data = complete_json(system, f"{notes_block(content)}\n\n{focus}\nStudent's explanation:\n{explanation}", ExplainResult, 3000)
    data["score"] = max(0, min(100, int(data.get("score", 0))))
    return data


def make_mindmap(content: str, lang: str = "en") -> dict:
    system = (
        "You turn study notes into a mind map, strictly from the notes. 'center' is the subject in at most 4 words. "
        "Give 5 to 8 branches, each with a short title (at most 4 words) and 2 to 4 children, each a key idea of at most "
        "7 words." + lang_note(lang)
    )
    data = complete_json(system, notes_block(content), MindMap, 4000)
    branches = [
        {"title": b["title"].strip(), "children": [c.strip() for c in b["children"] if c.strip()][:4]}
        for b in data.get("branches", [])
        if b.get("title", "").strip()
    ][:8]
    if len(branches) < 3:
        raise RuntimeError("Model returned too small a map")
    return {"center": data.get("center", "").strip() or "Notes", "branches": branches}


def make_cheatsheet(content: str, lang: str = "en") -> str:
    system = (
        "You write a one-page revision cheat sheet in Markdown strictly from the notes. Use these sections, skipping any "
        "the notes cannot support: '## Key terms' (bullets: **term**: short definition), '## Facts, formulas and dates', "
        "'## How things connect', '## Common mistakes'. Dense and scannable, under 450 words, no emoji." + lang_note(lang)
    )
    return complete_text(system, notes_block(content), 4000)
