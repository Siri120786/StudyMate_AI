"""Checks the hand-written demo content against the app's own rules, with no database or network."""
import re
import sys
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(ROOT / "scripts"))

import demo_data as D
import logic

TODAY = date(2026, 11, 5)
TITLES = {d["key"]: [t["title"] for t in d["topics"]] for d in D.DOCS}
KEYS = {d["key"] for d in D.DOCS}


def test_topic_offsets_point_at_each_heading_in_order():
    for d in D.DOCS:
        offsets = [t["offset"] for t in d["topics"]]
        assert offsets == sorted(offsets) and len(set(offsets)) == len(offsets)
        for t in d["topics"]:
            assert d["content"][t["offset"]:].startswith("## ")
        assert len(d["content"]) > 200  # the app refuses shorter notes


def test_summaries_reference_real_topics_levels_and_languages():
    for key, level, topic, lang, text in D.SUMMARIES:
        assert key in KEYS and level in ("beginner", "intermediate", "advanced") and lang in {"en", "hi", "te"}
        assert topic == "" or topic in TITLES[key]
        assert text.strip() and "—" not in text  # no em dashes in anything the evaluator reads
    pairs = [(k, lvl, topic, lang) for k, lvl, topic, lang, _ in D.SUMMARIES]
    assert len(pairs) == len(set(pairs)), "the database allows one summary per document, level, topic and language"
    levels = {lvl: text for k, lvl, topic, lang, text in D.SUMMARIES if k == "photo" and not topic and lang == "en"}
    assert len(levels["beginner"]) < len(levels["intermediate"]) < len(levels["advanced"])  # the tiers really differ


def test_flashcards_fit_the_app_limits_and_the_review_schedule():
    for key, topic, front, back, (interval, ease, streak, lapses, reviews, due_in) in D.CARDS:
        assert key in KEYS and topic in TITLES[key]
        assert 0 < len(front) <= 400 and 0 < len(back) <= 800
        assert ease >= 1.3 and interval >= 0 and streak >= 0 and lapses >= 0 and reviews >= streak and due_in >= 0
        assert not (interval == 0 and streak > 0)  # a reset card has no streak
    due_now = sum(1 for c in D.CARDS if c[4][5] == 0)
    assert 4 <= due_now <= 10  # some due, some not
    assert any(c[4][0] >= logic.MASTERED_DAYS for c in D.CARDS)  # some mastered


def test_every_quiz_question_obeys_the_generators_rules():
    for q in D.QUIZZES:
        allowed = {t for k in q["docs"] for t in TITLES[k]}
        assert q["scope"] in ("lesson", "topic", "mixed") and q["mode"] in ("practice", "exam")
        assert q["scope"] != "mixed" or len(q["docs"]) > 1
        for x in q["questions"]:
            assert x["type"] in logic.QUESTION_TYPES and x["topic"] in allowed
            assert x["question"].strip() and x["explanation"].strip()
            if x["type"] == "mcq":
                assert len(x["options"]) == 4 and 0 <= x["correct_index"] <= 3 and len(set(x["options"])) == 4
            elif x["type"] == "tf":
                assert x["options"] == [] and x["correct_index"] in (0, 1)
            else:
                assert x["options"] == [] and x["answer"].strip()
            if x["type"] == "fill":
                assert "_____" in x["question"]
            if q["mode"] == "exam":
                assert x["hint"] == ""
    lesson = next(q for q in D.QUIZZES if q["key"] == "lesson")
    assert {x["type"] for x in lesson["questions"]} == set(logic.QUESTION_TYPES)  # shows all four types


def test_fill_answers_are_accepted_by_the_real_checker():
    for q in D.QUIZZES:
        for x in q["questions"]:
            if x["type"] == "fill":
                assert logic.fill_correct(x["answer"], x["answer"])


def test_attempts_are_consistent_with_their_quizzes():
    quizzes = {q["key"]: q for q in D.QUIZZES}
    for key, days_ago, wrong, seconds in D.ATTEMPTS:
        n = len(quizzes[key]["questions"])
        assert key in quizzes and 0 <= days_ago <= 15 and all(0 <= i < n for i in wrong) and seconds > 0
        answers = D.answers_for(quizzes[key]["questions"], wrong)
        assert len(answers) == n
        for i, (q, a) in enumerate(zip(quizzes[key]["questions"], answers)):
            if q["type"] in ("mcq", "tf"):
                assert (a == q["correct_index"]) == (i not in wrong)
    weak = {}
    for key, _, wrong, _ in D.ATTEMPTS:
        for i, q in enumerate(quizzes[key]["questions"]):
            c, n = weak.get(q["topic"], (0, 0))
            weak[q["topic"]] = (c + int(i not in wrong), n + 1)
    assert any(c / n < logic.WEAK_BELOW / 100 for c, n in weak.values())  # something for the planner to flag as weak


def test_activity_history_gives_a_believable_profile():
    events = D.activity_events(TODAY)
    assert {e["kind"] for e in events} <= D.ACTIVITY_KINDS
    assert all(0 <= e["days_ago"] <= 15 and e["xp"] >= 0 for e in events)
    xp = sum(e["xp"] for e in events)
    assert logic.level_info(xp)["level"] >= 5

    days = {TODAY - timedelta(days=e["days_ago"]) for e in events}
    streak, used = logic.streak_with_freezes(days, TODAY, logic.freeze_budget(logic.level_info(xp)["level"]))
    assert streak >= 12 and used == 1  # the quiet day shows a streak freeze at work
    assert logic.best_streak(days) == 12

    today = [e for e in events if e["days_ago"] == 0]
    assert sum(e["kind"] == "flashcard" for e in today) >= 10  # today's "review 10 flashcards" challenge is claimable
    assert any(e["kind"] == "summary" for e in today) and sum(e["minutes"] for e in today if e["kind"] == "focus") >= 25


def test_badges_show_a_mix_of_earned_and_locked():
    events = D.activity_events(TODAY)
    xp = sum(e["xp"] for e in events)
    days = {TODAY - timedelta(days=e["days_ago"]) for e in events}
    values = {
        "docs": len(D.DOCS), "summaries": sum(e["kind"] == "summary" for e in events), "quizzes": len(D.ATTEMPTS), "perfect": 0,
        "reviews": sum(e["kind"] == "flashcard" for e in events), "best_streak": logic.best_streak(days),
        "focus_sessions": sum(e["kind"] == "focus" for e in events), "focus_minutes": sum(e["minutes"] for e in events if e["kind"] == "focus"),
        "mastered_topics": 0, "level": logic.level_info(xp)["level"], "early": 0, "late": 0, "exams": len(D.EXAMS),
    }
    badges = {b["id"]: b for b in logic.evaluate_badges(values)}
    for earned in ("first_upload", "first_summary", "first_quiz", "cards_50", "streak_7", "focus_first", "level_5", "exam_planned"):
        assert badges[earned]["earned"], earned
    for locked in ("library_5", "quiz_10", "perfect_score", "streak_30", "focus_5h"):
        assert not badges[locked]["earned"], locked  # something left to aim for


def test_highlights_sit_inside_one_plain_paragraph_so_they_paint_inline():
    for key, level, topic, text, note in D.HIGHLIGHTS:
        body = next(t for k, lv, tp, lang, t in D.SUMMARIES if (k, lv, tp, lang) == (key, level, topic, "en"))
        assert text in body and "**" not in text and "\n" not in text
        i = body.index(text)
        before, after = body[:i], body[i + len(text):]
        # not inside a bold span: an even number of ** markers before the text
        assert before.count("**") % 2 == 0
        assert len(note) <= 500 and len(text) <= 600


def test_podcast_script_is_a_two_host_conversation():
    assert len(D.PODCAST_SCRIPT) >= 8
    assert {s for s, _, _ in D.PODCAST_SCRIPT} == {"Alex", "Sam"}
    assert all(0 < len(t) <= 400 for _, _, t in D.PODCAST_SCRIPT)
    assert all(a[0] != b[0] for a, b in zip(D.PODCAST_SCRIPT, D.PODCAST_SCRIPT[1:]))  # hosts take turns


def test_exams_group_and_friends():
    assert all(e["in_days"] > 0 and e["docs"] and set(e["docs"]) <= KEYS for e in D.EXAMS)
    assert len(D.GROUP["code"]) == 6 and D.GROUP["code"].isalnum() and "0" not in D.GROUP["code"] and "O" not in D.GROUP["code"]
    assert D.friend_events(95) and sum(e["xp"] for e in D.friend_events(95)) == 95
    assert len({D.DEMO["email"], *[f["email"] for f in D.FRIENDS]}) == 3


def test_no_em_dashes_or_emoji_in_demo_text():
    import json

    blob = json.dumps([D.DOCS, D.SUMMARIES, D.CARDS, D.QUIZZES, D.MINDMAP, D.CHEATSHEET, D.PODCAST_SCRIPT], ensure_ascii=False)
    assert "—" not in blob
    assert not re.search("[\U0001F300-\U0001FAFF☀-➿]", blob)
