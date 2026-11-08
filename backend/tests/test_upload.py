import os
import sys
from pathlib import Path

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "sb_secret_dummydummydummydummydummydummy")
os.environ.setdefault("GEMINI_API_KEY", "dummy")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient

import limits
import main
from deps import current_user
from routers import documents

NOTES = ("Photosynthesis is the process by which green plants make food using sunlight, water and carbon dioxide. " * 4).encode()


def client(monkeypatch):
    limits.limiter = limits.Limiter()
    main.app.dependency_overrides[current_user] = lambda: "student-1"
    saved = {}

    def fake_store(user_id, title, subject, content):  # no database in tests
        saved.update(user=user_id, title=title, subject=subject, content=content)
        return {"id": "doc-1", "title": title or "Untitled", "subject": subject or "General"}

    monkeypatch.setattr(documents, "store_document", fake_store)
    return TestClient(main.app), saved


def test_text_upload_goes_through_the_multipart_parser(monkeypatch):
    c, saved = client(monkeypatch)
    r = c.post("/api/documents", data={"title": "Plants", "subject": "Biology", "text": NOTES.decode()})
    main.app.dependency_overrides.clear()
    assert r.status_code == 200 and r.json()["id"] == "doc-1"
    assert saved["user"] == "student-1" and saved["subject"] == "Biology" and "Photosynthesis" in saved["content"]


def test_file_upload_is_read_and_stored(monkeypatch):
    c, saved = client(monkeypatch)
    r = c.post("/api/documents", files={"file": ("plants.txt", NOTES, "text/plain")})
    main.app.dependency_overrides.clear()
    assert r.status_code == 200
    assert saved["title"] == "plants" and "sunlight" in saved["content"]


def test_short_text_and_oversize_files_are_refused(monkeypatch):
    c, _ = client(monkeypatch)
    assert c.post("/api/documents", data={"text": "too short"}).status_code == 400
    big = b"x" * (documents.MAX_UPLOAD_BYTES + 1)
    r = c.post("/api/documents", files={"file": ("big.txt", big, "text/plain")})
    main.app.dependency_overrides.clear()
    assert r.status_code == 413


def test_unsupported_file_type_is_refused(monkeypatch):
    c, _ = client(monkeypatch)
    r = c.post("/api/documents", files={"file": ("virus.exe", b"MZ" + b"0" * 400, "application/octet-stream")})
    main.app.dependency_overrides.clear()
    assert r.status_code == 400 and "Unsupported" in r.json()["detail"]


def test_upload_rate_limit_stops_a_flood(monkeypatch):
    c, _ = client(monkeypatch)
    codes = [c.post("/api/documents", data={"text": NOTES.decode()}).status_code for _ in range(8)]
    main.app.dependency_overrides.clear()
    assert codes[:6] == [200] * 6 and codes[6:] == [429, 429]
