import os
import sys
import time
from pathlib import Path

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "sb_secret_dummydummydummydummydummydummy")
os.environ.setdefault("GEMINI_API_KEY", "dummy")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi import HTTPException

import deps

URL = deps.SUPABASE_URL
KEY = ec.generate_private_key(ec.SECP256R1())


class StubKeys:
    """Stands in for the Supabase public-key set, so no network is needed."""

    def __init__(self, fail=False):
        self.fail, self.calls = fail, 0

    def get_signing_key_from_jwt(self, token):
        self.calls += 1
        if self.fail:
            raise jwt.PyJWKClientError("keys unreachable")
        return type("K", (), {"key": KEY.public_key()})()


def token(**over):
    claims = {"sub": "user-123", "aud": "authenticated", "iss": f"{URL}/auth/v1", "exp": int(time.time()) + 3600, **over}
    return jwt.encode(claims, KEY, algorithm="ES256", headers={"kid": "k1"})


def test_a_valid_token_is_verified_locally(monkeypatch):
    stub = StubKeys()
    monkeypatch.setattr(deps, "_jwks", stub)
    monkeypatch.setattr(deps.sb.auth, "get_user", lambda t: pytest.fail("must not call Supabase for a valid token"))
    t0 = time.perf_counter()
    assert deps.verify_token(token()) == "user-123"
    assert time.perf_counter() - t0 < 0.1  # was about 1.5 seconds with a network check


@pytest.mark.parametrize("bad", [{"exp": 1}, {"aud": "someone-else"}, {"iss": "https://evil.example/auth/v1"}])
def test_expired_or_foreign_tokens_are_refused(monkeypatch, bad):
    monkeypatch.setattr(deps, "_jwks", StubKeys())
    monkeypatch.setattr(deps.sb.auth, "get_user", lambda t: pytest.fail("a bad token must not fall back"))
    with pytest.raises(HTTPException) as e:
        deps.verify_token(token(**bad))
    assert e.value.status_code == 401


def test_a_token_signed_with_another_key_is_refused(monkeypatch):
    monkeypatch.setattr(deps, "_jwks", StubKeys())
    other = ec.generate_private_key(ec.SECP256R1())
    forged = jwt.encode({"sub": "attacker", "aud": "authenticated", "iss": f"{URL}/auth/v1", "exp": int(time.time()) + 3600}, other, algorithm="ES256")
    with pytest.raises(HTTPException) as e:
        deps.verify_token(forged)
    assert e.value.status_code == 401


def test_when_keys_are_unavailable_it_asks_supabase_once_then_remembers(monkeypatch):
    monkeypatch.setattr(deps, "_jwks", StubKeys(fail=True))
    deps._checked.clear()
    calls = []

    def fake_get_user(t):
        calls.append(t)
        return type("R", (), {"user": type("U", (), {"id": "user-9"})()})()

    monkeypatch.setattr(deps.sb.auth, "get_user", fake_get_user)
    assert deps.verify_token("opaque-token") == "user-9"
    assert deps.verify_token("opaque-token") == "user-9"
    assert len(calls) == 1


def test_missing_or_malformed_header_is_refused():
    for header in (None, "", "Basic abc", "Bearer"):
        with pytest.raises(HTTPException) as e:
            deps.current_user(header)
        assert e.value.status_code == 401


def test_par_runs_calls_side_by_side():
    t0 = time.perf_counter()
    out = deps.par(*[(lambda i=i: (time.sleep(0.3), i)[1]) for i in range(5)])
    elapsed = time.perf_counter() - t0
    assert out == [0, 1, 2, 3, 4]  # order is kept
    assert elapsed < 0.9  # five 0.3 s calls one after another would take 1.5 s


def test_fan_can_wrap_helpers_that_use_par():
    def helper(n):
        return sum(deps.par(*[(lambda k=k: (time.sleep(0.2), k)[1]) for k in range(n)]))

    t0 = time.perf_counter()
    assert deps.fan(lambda: helper(3), lambda: helper(4)) == [3, 6]
    assert time.perf_counter() - t0 < 0.7  # nested fan-out must neither deadlock nor serialise


def test_par_passes_errors_through():
    with pytest.raises(ZeroDivisionError):
        deps.par(lambda: 1, lambda: 1 / 0)


def test_the_database_client_is_pooled_http1_and_gives_up_quickly():
    c = deps._http
    assert c.timeout.read <= 30 and c.timeout.connect <= 10  # the library default waits 120 s
    assert not getattr(c._transport._pool, "_http2", False)  # shared HTTP/2 drops concurrent queries on Windows
    assert c._transport._pool._max_connections >= 32  # room for the parallel queries each page makes
