import os
import sys
from pathlib import Path

os.environ.setdefault("GEMINI_API_KEY", "dummy")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest

import llm


class Busy(Exception):
    def __init__(self, code):
        self.code = code


TOPICS = [{"title": "A", "blurb": "", "offset": 0}, {"title": "B", "blurb": "", "offset": 600}]


@pytest.mark.parametrize("size", [120, 320, 1500, 6000])
def test_each_level_is_longer_than_the_one_before_and_never_longer_than_the_notes(size):
    notes = "word " * size
    a, b, c = (llm.target_words(notes, lvl, TOPICS, "") for lvl in ("beginner", "intermediate", "advanced"))
    assert a < b < c
    if size >= 320:
        assert c <= size  # asking for more words than the notes contain is what forces padding


def test_a_topic_summary_is_sized_by_that_topics_own_text():
    notes = "short " * 100 + "long " * 900  # topic A is 100 words, topic B 900 (A starts at 0, B at 600 characters)
    small = llm.target_words(notes, "intermediate", TOPICS, "A")
    big = llm.target_words(notes, "intermediate", TOPICS, "B")
    assert small < big


def test_the_prompt_carries_the_length_and_no_fixed_per_topic_counts():
    msg = llm.summary_messages("word " * 320, "advanced", TOPICS, "", "en")[0]["content"]
    assert "about 290 words in total" in msg and "fewer words rather than add" in msg
    assert "words per topic" not in " ".join(llm.LEVEL_PROMPTS.values())


def test_fallback_moves_to_the_next_model_when_one_is_overloaded(monkeypatch):
    tried = []

    def call(model):
        tried.append(model)
        if len(tried) < 3:
            raise Busy(503)
        return "ok"

    assert llm.with_fallback(call) == "ok"
    assert tried == [llm.MODEL, *llm.FALLBACK_MODELS][:3]


def test_fallback_does_not_hide_real_errors(monkeypatch):
    def call(model):
        raise Busy(400)  # a bad request will fail on every model, so do not try them all

    with pytest.raises(Busy):
        llm.with_fallback(call)


def test_fallback_gives_up_with_a_plain_message_when_every_model_is_busy():
    seen = []

    def call(model):
        seen.append(model)
        raise Busy(429)

    with pytest.raises(RuntimeError, match="very busy"):
        llm.with_fallback(call)
    assert len(seen) == 1 + len(llm.FALLBACK_MODELS)


def test_fallback_stops_trying_after_the_deadline(monkeypatch):
    clock = iter([0] + [200] * 12)  # first call is the start time, every later call is 200 s on
    monkeypatch.setattr(llm.time, "time", lambda: next(clock))
    seen = []

    def call(model):
        seen.append(model)
        raise Busy(503)

    with pytest.raises(RuntimeError, match="very busy"):
        llm.with_fallback(call)
    assert len(seen) == 1  # the second attempt is skipped because 200 s have passed


def test_the_sdk_is_set_to_fail_fast_instead_of_retrying_silently():
    assert llm.HTTP.retry_options.attempts == 1 and llm.HTTP.timeout <= 60_000
