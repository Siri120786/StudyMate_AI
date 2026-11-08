import os
import sys
from pathlib import Path

# The app needs these at import time. Dummy values are fine: these tests never reach Supabase or Gemini.
os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "sb_secret_dummydummydummydummydummydummy")
os.environ.setdefault("GEMINI_API_KEY", "dummy")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

import limits
import security
from deps import current_user


# ---------- rate limiter ----------


def test_per_minute_limit_then_recovers():
    lim = limits.Limiter({"t": (3, 100)})
    assert [lim.hit("u", "t", now=100 + i) for i in range(3)] == [0, 0, 0]
    wait = lim.hit("u", "t", now=103)
    assert 1 <= wait <= 60
    assert lim.hit("u", "t", now=100 + 61) == 0  # the window has slid past the first hits


def test_daily_limit():
    lim = limits.Limiter({"t": (1000, 5)})
    for i in range(5):
        assert lim.hit("u", "t", now=i * 100) == 0
    assert lim.hit("u", "t", now=600) > 0
    assert lim.hit("u", "t", now=limits.DAY + 10) == 0  # a day later the first hit has expired


def test_users_and_buckets_are_counted_separately():
    lim = limits.Limiter({"a": (1, 10), "b": (1, 10)})
    assert lim.hit("u1", "a", now=0) == 0
    assert lim.hit("u1", "a", now=1) > 0
    assert lim.hit("u2", "a", now=1) == 0
    assert lim.hit("u1", "b", now=1) == 0


def test_endpoint_answers_429_with_retry_after():
    app = FastAPI()
    app.dependency_overrides[current_user] = lambda: "student-1"

    @app.post("/ai")
    def ai(_rl: str = Depends(limits.limited("ai"))):
        return {"ok": True}

    limits.limiter = limits.Limiter()  # fresh counters for this test
    client = TestClient(app)
    codes = [client.post("/ai").status_code for _ in range(14)]
    assert codes[:12] == [200] * 12 and codes[12:] == [429, 429]
    r = client.post("/ai")
    assert r.status_code == 429 and int(r.headers["Retry-After"]) >= 1 and "wait" in r.json()["detail"]


def test_public_limit_is_per_address():
    app = FastAPI()

    @app.get("/pub")
    def pub(_rl: str = Depends(limits.limited_ip("public"))):
        return {}

    limits.limiter = limits.Limiter({"public": (2, 10)})
    client = TestClient(app)
    h1, h2 = {"x-forwarded-for": "1.1.1.1"}, {"x-forwarded-for": "2.2.2.2, 10.0.0.1"}
    assert [client.get("/pub", headers=h1).status_code for _ in range(3)] == [200, 200, 429]
    assert client.get("/pub", headers=h2).status_code == 200


# ---------- headers and CSP ----------

INDEX = '<html><head><script>try{localStorage.getItem("x")}catch(e){}</script><script type="module" src="/assets/a.js"></script></head></html>'


def test_csp_allows_only_our_script_and_the_supabase_host():
    csp = security.csp_for(INDEX, "https://abc.supabase.co")
    script_src = next(p for p in csp.split("; ") if p.startswith("script-src"))
    assert "'unsafe-inline'" not in script_src and "'unsafe-eval'" not in script_src
    assert script_src.count("sha256-") == 1  # only the inline theme script, not the external module
    assert "https://abc.supabase.co" in csp and "wss://abc.supabase.co" in csp
    assert "frame-ancestors 'none'" in csp and "object-src 'none'" in csp


def test_inline_script_hash_matches_the_browsers_rule():
    import base64, hashlib

    body = 'try{localStorage.getItem("x")}catch(e){}'
    expected = "'sha256-" + base64.b64encode(hashlib.sha256(body.encode()).digest()).decode() + "'"
    assert security.inline_script_hashes(INDEX) == [expected]


def test_hsts_only_over_https():
    assert "Strict-Transport-Security" not in security.security_headers(None, https=False)
    assert "Strict-Transport-Security" in security.security_headers(None, https=True)


def test_health_endpoint_sends_security_headers():
    import main

    client = TestClient(main.app)
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.headers["X-Content-Type-Options"] == "nosniff" and r.headers["X-Frame-Options"] == "DENY"
    assert "microphone=(self)" in r.headers["Permissions-Policy"]
    assert "Strict-Transport-Security" not in r.headers
    assert "Strict-Transport-Security" in client.get("/api/health", headers={"x-forwarded-proto": "https"}).headers


# ---------- no endpoint is public by accident ----------

PUBLIC = {"/api/health", "/api/shared/{token}"}  # the share page is public on purpose; limited per address


def _calls(dependant):
    for d in dependant.dependencies:
        yield d.call
        yield from _calls(d)


def test_every_api_route_requires_sign_in_except_the_known_public_ones():
    import main

    open_routes = []
    for route in main.app.routes:
        path = getattr(route, "path", "")
        if path.startswith("/api") and path not in PUBLIC and current_user not in set(_calls(route.dependant)):
            open_routes.append((sorted(route.methods), path))
    assert open_routes == [], f"these API routes do not check who is calling: {open_routes}"


def test_public_share_routes_are_rate_limited():
    import main

    for route in main.app.routes:
        if getattr(route, "path", "") == "/api/shared/{token}":
            assert any(getattr(c, "__name__", "") == "dep" for c in _calls(route.dependant))


def test_every_ai_and_upload_route_is_rate_limited():
    import main

    expected = {
        "/api/documents/{doc_id}/summary", "/api/chat", "/api/documents/{doc_id}/flashcards", "/api/documents/{doc_id}/quiz",
        "/api/quizzes/mixed", "/api/quizzes/{quiz_id}/attempt", "/api/documents/{doc_id}/explain", "/api/documents/{doc_id}/mindmap",
        "/api/documents/{doc_id}/cheatsheet", "/api/documents/{doc_id}/podcast", "/api/documents", "/api/documents/link",
        "/api/documents/{doc_id}/outline", "/api/shared/{token}/copy",
    }
    unlimited = []
    for route in main.app.routes:
        path = getattr(route, "path", "")
        if path in expected and "POST" in (route.methods or set()):
            names = [getattr(c, "__qualname__", "") for c in _calls(route.dependant)]
            if not any("limited" in n for n in names):
                unlimited.append(path)
    assert unlimited == []
