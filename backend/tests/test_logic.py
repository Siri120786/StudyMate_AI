import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import logic as L


def test_sm2_good_path_grows():
    ease, streak, interval = 2.5, 0, 0
    seen = []
    for _ in range(5):
        r = L.sm2(ease, streak, interval, "good")
        ease, streak, interval = r["ease"], r["streak"], r["interval"]
        seen.append(interval)
    assert seen[:2] == [2, 6]
    assert seen == sorted(seen) and seen[-1] > 30


def test_sm2_again_resets_and_lowers_ease():
    r = L.sm2(2.5, 4, 40, "again")
    assert r["interval"] == 0 and r["streak"] == 0 and r["ease"] == 2.3 and r["lapse"]


def test_sm2_ease_floor_and_cap():
    ease = 1.35
    for _ in range(10):
        ease = L.sm2(ease, 3, 10, "hard")["ease"]
    assert ease >= 1.3
    assert L.sm2(2.5, 9, 360, "easy")["interval"] == 365


def test_sm2_hard_is_shorter_than_easy():
    p = L.preview_intervals(2.5, 3, 10)
    assert p["again"] == 0 < p["hard"] < p["good"] < p["easy"]


def test_levels():
    assert L.level_info(0) == {"level": 1, "xp_into": 0, "xp_span": 50}
    assert L.level_info(50)["level"] == 2
    assert L.level_info(199)["level"] == 2 and L.level_info(200)["level"] == 3
    assert L.freeze_budget(1) == 1 and L.freeze_budget(3) == 2


def d(n, today=date(2026, 11, 10)):
    return today - timedelta(days=n)


def test_streak_plain_and_pending_today():
    days = {d(1), d(2), d(3)}
    assert L.streak_with_freezes(days, d(0), 0) == (3, 0)  # today still open
    assert L.streak_with_freezes(days | {d(0)}, d(0), 0) == (4, 0)


def test_streak_freeze_bridges_one_gap_only():
    days = {d(0), d(1), d(3), d(4)}  # day 2 missed
    assert L.streak_with_freezes(days, d(0), 0) == (2, 0)
    assert L.streak_with_freezes(days, d(0), 1) == (4, 1)
    two_gaps = {d(0), d(2), d(4)}
    assert L.streak_with_freezes(two_gaps, d(0), 1) == (2, 1)
    assert L.streak_with_freezes(two_gaps, d(0), 2) == (3, 2)


def test_streak_two_day_gap_breaks_even_with_freezes():
    assert L.streak_with_freezes({d(0), d(3)}, d(0), 5)[0] == 1


def test_best_streak():
    assert L.best_streak({d(0), d(1), d(2), d(5), d(6)}) == 3
    assert L.best_streak(set()) == 0


def test_badges_progress_and_earned():
    out = {b["id"]: b for b in L.evaluate_badges({"docs": 2, "quizzes": 10, "best_streak": 7})}
    assert out["first_upload"]["earned"] and not out["library_5"]["earned"]
    assert out["library_5"]["value"] == 2 and out["library_5"]["target"] == 5
    assert out["quiz_10"]["earned"] and out["streak_7"]["earned"] and not out["streak_30"]["earned"]
    assert out["streak_7"]["value"] == 7


def test_three_challenges_a_day_and_rotation():
    seen = set()
    for i in range(4):
        today = L.todays_challenges(date(2026, 11, 10) + timedelta(days=i))
        assert len(today) == 3
        seen.add(tuple(c[0] for c in today))
    assert len(seen) == 4


def doc(id_, topics, **kw):
    base = dict(id=id_, title=id_, topics=[{"title": t} for t in topics], summarized=set(), whole_summary=False, mastery={}, cards=0, due=0)
    base.update(kw)
    return base


def test_plan_orders_cards_then_weak_then_unread():
    exam = {"exam_date": date(2026, 11, 20)}
    docs = [doc("bio", ["Cells", "Genes", "Evolution"], cards=20, due=8, summarized={"Cells"}, mastery={"Cells": (1, 5)})]
    plan = L.build_plan(exam, docs, date(2026, 11, 10))
    kinds = [(t["kind"], t["topic"]) for t in plan["tasks"]]
    assert kinds[0][0] == "cards"
    assert kinds[1] == ("check", "Cells")  # weak topic comes before unread ones
    assert ("read", "Genes") in kinds
    assert plan["days_left"] == 10 and 0 <= plan["progress"] <= 100


def test_plan_quota_scales_with_days_left():
    docs = [doc("a", [f"T{i}" for i in range(10)])]
    far = L.build_plan({"exam_date": date(2026, 12, 10)}, docs, date(2026, 11, 10))
    near = L.build_plan({"exam_date": date(2026, 11, 12)}, docs, date(2026, 11, 10))
    assert len(near["tasks"]) > len(far["tasks"]) and len(far["tasks"]) >= 2


def test_plan_progress_hits_100_when_everything_done():
    docs = [doc("a", ["X"], summarized={"X"}, mastery={"X": (4, 5)}, cards=5, due=0)]
    plan = L.build_plan({"exam_date": date(2026, 11, 20)}, docs, date(2026, 11, 10))
    assert plan["progress"] == 100 and plan["remaining"] == 0 and plan["tasks"] == []


def test_plan_mock_exam_in_last_days_and_exam_day():
    docs = [doc("a", ["X"], summarized={"X"}, mastery={"X": (4, 5)}, cards=5, due=0)]
    last = L.build_plan({"exam_date": date(2026, 11, 12)}, docs, date(2026, 11, 10))
    assert [t["kind"] for t in last["tasks"]] == ["mock"]
    assert L.build_plan({"exam_date": date(2026, 11, 12)}, [], date(2026, 11, 10))["tasks"] == []
    today = L.build_plan({"exam_date": date(2026, 11, 10)}, [doc("a", ["X", "Y"], mastery={"X": (0, 4)})], date(2026, 11, 10))
    assert today["days_left"] == 0 and any(t["topic"] == "X" for t in today["tasks"])


def test_plan_whole_summary_counts_every_topic_as_read():
    docs = [doc("a", ["X", "Y"], whole_summary=True)]
    plan = L.build_plan({"exam_date": date(2026, 11, 20)}, docs, date(2026, 11, 10))
    assert all(t["kind"] != "read" for t in plan["tasks"])


def test_search_ranks_the_matching_passage_first():
    docs = [
        {"id": "bio", "title": "Biology", "content": "Cells are the basic unit of life.\n\nMitochondria produce ATP through respiration.\n\nPlants use chloroplasts for photosynthesis."},
        {"id": "geo", "title": "Geography", "content": "Alluvial soil is formed by rivers.\n\nBlack soil is good for cotton."},
    ]
    top = L.rank_passages("How do mitochondria make ATP?", docs, k=2)
    assert top[0]["doc"] == "bio" and "Mitochondria" in top[0]["text"]
    assert L.rank_passages("what is the", docs) == []  # only stop words
    assert L.rank_passages("quantum chromodynamics", docs) == []  # nothing matches


def test_search_works_for_indic_scripts():
    docs = [{"id": "a", "title": "T", "content": "प्रकाश संश्लेषण पौधों में होता है।\n\nमाइटोकॉन्ड्रिया ऊर्जा बनाता है।"}, {"id": "b", "title": "U", "content": "తెలుగు కవిత్వం చాలా పాతది."}]
    assert L.rank_passages("प्रकाश संश्लेषण", docs)[0]["doc"] == "a"
    assert L.rank_passages("కవిత్వం", docs)[0]["doc"] == "b"


def test_passages_respect_the_size_limit():
    big = "word " * 1000
    parts = L.split_passages(big, 900)
    assert len(parts) > 1 and all(len(p) <= 1500 for p in parts)


def test_week_start_is_monday():
    assert L.week_start(date(2026, 11, 4)) == date(2026, 11, 2)  # a Wednesday
    assert L.week_start(date(2026, 11, 2)) == date(2026, 11, 2)
    assert L.week_start(date(2026, 11, 8)) == date(2026, 11, 2)  # Sunday
