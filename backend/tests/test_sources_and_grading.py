import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import logic as L
import sources
from fastapi import HTTPException


def test_fill_in_blank_forgives_articles_case_punctuation_and_typos():
    assert L.fill_correct("The Calvin cycle.", "calvin cycle")
    assert L.fill_correct("  mitochondria ", "Mitochondria")
    assert L.fill_correct("mitochondrai", "mitochondria")  # one swapped letter
    assert not L.fill_correct("chloroplast", "mitochondria")
    assert not L.fill_correct("", "mitochondria")


def test_fill_in_blank_works_for_non_latin_scripts():
    assert L.fill_correct("కణం", "కణం")
    assert L.fill_correct("प्रकाश संश्लेषण", "प्रकाश संश्लेषण")
    assert not L.fill_correct("कोशिका", "प्रकाश संश्लेषण")


def test_short_answer_fallback_needs_most_key_words():
    model = "Plants convert sunlight, water and carbon dioxide into glucose and oxygen."
    assert L.overlap_correct("They use sunlight, water and carbon dioxide to make glucose and oxygen", model)
    assert not L.overlap_correct("It happens in the roots at night", model)
    assert not L.overlap_correct("", model)


def test_mock_exam_time_limit_sums_by_type():
    assert L.quiz_time_limit(["mcq"] * 10) == 600
    assert L.quiz_time_limit(["mcq", "tf", "fill", "short"]) == 60 + 30 + 60 + 150


def test_youtube_ids():
    assert sources.youtube_id("https://www.youtube.com/watch?v=dQw4w9WgXcQ") == "dQw4w9WgXcQ"
    assert sources.youtube_id("https://youtu.be/dQw4w9WgXcQ?t=10") == "dQw4w9WgXcQ"
    assert sources.youtube_id("https://m.youtube.com/shorts/abcdefghijk") == "abcdefghijk"
    assert sources.youtube_id("https://example.com/watch?v=abc") is None


@pytest.mark.parametrize(
    "url",
    ["http://localhost/x", "http://127.0.0.1:8000/", "http://10.0.0.5/", "http://192.168.1.1/", "http://169.254.169.254/latest/meta-data/", "file:///etc/passwd", "ftp://example.com/x", "not a url"],
)
def test_private_and_odd_addresses_are_refused(url):
    with pytest.raises(HTTPException) as e:
        sources.assert_public(url)
    assert e.value.status_code == 400


def test_parse_html_prefers_article_and_drops_noise():
    html = """<html><head><title>Fallback</title><meta property="og:title" content="Photosynthesis basics"></head>
    <body><nav>Home About</nav><header>Site banner</header>
    <article><h1>Photosynthesis</h1><p>Plants make glucose.</p><script>alert(1)</script><p>Light drives it.</p></article>
    <footer>Copyright</footer></body></html>"""
    title, text = sources.parse_html(html)
    assert title == "Photosynthesis basics"
    assert "Plants make glucose." in text and "Light drives it." in text
    assert "Home About" not in text and "banner" not in text and "alert" not in text and "Copyright" not in text
