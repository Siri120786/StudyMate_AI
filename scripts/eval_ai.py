"""Measure how trustworthy StudyMate's AI output is, on notes whose content is known.

    python scripts/eval_ai.py                 # run every check, write docs/evaluation-results.json
    python scripts/eval_ai.py --only quiz     # one check

The notes are the Photosynthesis text in scripts/demo_data.py. Because we know exactly what they say, we can
test whether what the model writes is supported by them. These are simple lexical and behavioural checks, not
a replacement for a human reading the output, and the report says so.
"""
import argparse
import json
import re
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

# ---------------------------------------------------------------- pure metrics (unit tested)


def words(text: str) -> list[str]:
    text = re.sub(r"[*#>_`]|\n", " ", text or "")
    return [w for w in re.split(r"[^A-Za-z0-9]+", text.lower()) if len(w) > 3]


def stem(w: str) -> str:
    return w[:5]  # crude, but it lets "photosynthesis" and "photosynthetic" count as the same word


def grounding(generated: str, notes: str) -> float:
    """Share of the generated text's content words (by stem) that also appear in the notes. 1.0 means fully covered."""
    known = {stem(w) for w in words(notes)}
    got = [stem(w) for w in words(generated)]
    return round(sum(w in known for w in got) / len(got), 3) if got else 0.0


def script_share(text: str, lo: int, hi: int) -> float:
    """Share of letters that fall in a Unicode block, e.g. Devanagari 0x0900 to 0x097F."""
    letters = [c for c in text if c.isalpha()]
    return round(sum(lo <= ord(c) <= hi for c in letters) / len(letters), 3) if letters else 0.0


def ratio(n: int, d: int) -> float:
    return round(n / d, 3) if d else 0.0


# ---------------------------------------------------------------- checks that call the model


def timed(fn):
    t = time.perf_counter()
    out = fn()
    return out, round(time.perf_counter() - t, 1)


def check_outline(notes):
    import llm

    topics, secs = timed(lambda: llm.generate_outline(notes))
    offs = [t["offset"] for t in topics]
    return {
        "topics": len(topics),
        "all_located_in_notes": ratio(sum(o >= 0 for o in offs), len(offs)),
        "in_reading_order": offs == sorted(offs),
        "pass": 3 <= len(topics) <= 8 and all(o >= 0 for o in offs) and offs == sorted(offs),
        "seconds": secs,
    }, topics


def check_summaries(notes, topics):
    import llm

    out, lengths = {}, {}
    for level in ("beginner", "intermediate", "advanced"):
        msg = llm.summary_messages(notes, level, topics, "", "en")
        text, secs = timed(lambda: "".join(llm.stream_text(llm.SUMMARY_SYSTEM, msg, 8000)))
        lengths[level] = len(text.split())
        out[level] = {"words": lengths[level], "grounding": grounding(text, notes), "has_recap": "## Quick recap" in text, "seconds": secs}
    out["tiers_grow"] = lengths["beginner"] < lengths["intermediate"] < lengths["advanced"]
    out["pass"] = out["tiers_grow"] and all(out[l]["grounding"] >= 0.85 and out[l]["has_recap"] for l in ("beginner", "intermediate", "advanced"))
    return out


def check_quiz(notes, topics):
    import llm
    import logic

    titles = [t["title"] for t in topics]
    quiz, secs = timed(lambda: llm.generate_quiz(notes, 10, titles, types=["mcq", "tf", "fill", "short"]))
    qs = quiz["questions"]
    kinds = {q["type"] for q in qs}
    answer_ok = explain_ok = on_topic = 0
    checked = 0
    for q in qs:
        on_topic += q["topic"] in titles
        explain_ok += grounding(q["explanation"], notes) >= 0.7
        if q["type"] == "mcq":
            checked += 1
            answer_ok += grounding(q["options"][q["correct_index"]], notes) >= 0.7
        elif q["type"] in ("fill", "short"):
            checked += 1
            answer_ok += grounding(q["answer"], notes) >= 0.7
    fill_ok = [logic.fill_correct(q["answer"], q["answer"]) for q in qs if q["type"] == "fill"]
    res = {
        "questions_returned": len(qs),
        "question_types_present": sorted(kinds),
        "answers_supported_by_notes": ratio(answer_ok, checked),
        "explanations_supported_by_notes": ratio(explain_ok, len(qs)),
        "topics_match_outline": ratio(on_topic, len(qs)),
        "seconds": secs,
    }
    res["pass"] = len(qs) >= 8 and len(kinds) >= 3 and res["answers_supported_by_notes"] >= 0.85 and res["topics_match_outline"] == 1.0 and all(fill_ok)
    return res


def check_flashcards(notes):
    import llm

    cards, secs = timed(lambda: llm.generate_flashcards(notes, 10))
    fronts = [c["front"].strip().lower() for c in cards]
    g = [grounding(c["back"], notes) for c in cards]
    res = {"cards": len(cards), "answers_supported_by_notes": round(sum(g) / len(g), 3) if g else 0, "duplicate_fronts": len(fronts) - len(set(fronts)), "seconds": secs}
    res["pass"] = len(cards) >= 8 and res["answers_supported_by_notes"] >= 0.85 and res["duplicate_fronts"] == 0
    return res


GOOD = ("In the light reactions chlorophyll in the thylakoid membranes absorbs light and splits water, releasing oxygen and making ATP and NADPH. "
        "The Calvin cycle in the stroma then uses those to fix carbon dioxide with RuBisCO into G3P, which becomes glucose. Light, carbon dioxide and temperature can limit the rate.")
POOR = "Photosynthesis is when plants eat soil and drink water to grow big. It happens mostly at night when it is cool."


def check_explain(notes):
    import llm

    (good, s1), (poor, s2) = timed(lambda: llm.explain_feedback(notes, "", GOOD, "en")), timed(lambda: llm.explain_feedback(notes, "", POOR, "en"))
    res = {"good_explanation_score": good["score"], "wrong_explanation_score": poor["score"], "gap_between": good["score"] - poor["score"], "seconds": round(s1 + s2, 1)}
    res["pass"] = good["score"] >= 60 and poor["score"] <= 40 and res["gap_between"] >= 25
    return res


def check_short_answer_marking():
    import llm

    items = [
        {"question": "Where does the Calvin cycle take place?", "model_answer": "In the stroma of the chloroplast.", "student": "It happens in the stroma inside the chloroplast", "expect": True},
        {"question": "What does RuBisCO do?", "model_answer": "It fixes carbon dioxide onto RuBP.", "student": "It attaches carbon dioxide to the five carbon sugar", "expect": True},
        {"question": "Where does the Calvin cycle take place?", "model_answer": "In the stroma of the chloroplast.", "student": "In the thylakoid membrane", "expect": False},
        {"question": "What does RuBisCO do?", "model_answer": "It fixes carbon dioxide onto RuBP.", "student": "It makes oxygen from water", "expect": False},
        {"question": "Name one limiting factor.", "model_answer": "Light intensity, carbon dioxide or temperature.", "student": "", "expect": False},
    ]
    graded, secs = timed(lambda: llm.grade_short_answers([{k: v for k, v in i.items() if k != "expect"} for i in items], "en"))
    right = sum(bool(g["correct"]) == i["expect"] for g, i in zip(graded, items))
    res = {"answers_marked_correctly": f"{right}/{len(items)}", "seconds": secs, "pass": right >= 4}
    return res


def check_hindi(notes, topics):
    import llm

    msg = llm.summary_messages(notes, "beginner", topics, "", "hi")
    text, secs = timed(lambda: "".join(llm.stream_text(llm.SUMMARY_SYSTEM, msg, 8000)))
    share = script_share(text, 0x0900, 0x097F)
    return {"devanagari_share_of_letters": share, "words": len(text.split()), "seconds": secs, "pass": share >= 0.6}


CHECKS = ["outline", "summaries", "quiz", "flashcards", "explain", "marking", "hindi"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", choices=CHECKS)
    args = ap.parse_args()
    from dotenv import load_dotenv

    load_dotenv(ROOT / "backend" / ".env")
    import demo_data

    notes = demo_data.PHOTO_NOTES
    results, topics = {}, None
    want = [args.only] if args.only else CHECKS
    for name in want:
        print(f"running {name}...", flush=True)
        try:
            if name == "outline":
                results[name], topics = check_outline(notes)
            else:
                if topics is None:
                    topics = demo_data.PHOTO_TOPICS
                results[name] = {
                    "summaries": lambda: check_summaries(notes, topics), "quiz": lambda: check_quiz(notes, topics),
                    "flashcards": lambda: check_flashcards(notes), "explain": lambda: check_explain(notes),
                    "marking": check_short_answer_marking, "hindi": lambda: check_hindi(notes, topics),
                }[name]()
        except Exception as exc:  # a busy model must not hide the other results
            results[name] = {"pass": False, "error": f"{type(exc).__name__}: {str(exc)[:160]}"}
        print("  ", json.dumps(results[name], ensure_ascii=False), flush=True)
    out = ROOT / "docs"
    out.mkdir(exist_ok=True)
    target = out / "evaluation-results.json"
    if args.only and target.exists():  # keep the other checks' last results when only one is rerun
        results = {**json.loads(target.read_text(encoding="utf8"))["results"], **results}
    target.write_text(json.dumps({"ran": time.strftime("%Y-%m-%d %H:%M"), "results": results}, indent=2, ensure_ascii=False), encoding="utf8")
    passed = sum(1 for r in results.values() if r.get("pass"))
    print(f"\n{passed}/{len(results)} checks passed")


if __name__ == "__main__":
    main()
