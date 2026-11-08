"""Time every page's data requests against a running backend, signed in as the demo account.

    python scripts/bench.py                          # backend on http://127.0.0.1:8000
    python scripts/bench.py https://your-app.example # a deployed copy

A page is as slow as its slowest request, because the app sends a page's requests at the same time, so each page
below is timed that way. The goal is under 2000 ms for every page. Exit status is 1 if any page misses it.
Run `python scripts/seed_demo.py` first so there is data to load.
"""
import json
import re
import statistics
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parent.parent
BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000").rstrip("/")
LIMIT_MS = 2000
RUNS = 5


def env(path: Path, key: str) -> str:
    m = re.search(rf"^{key}=(.+)$", path.read_text(encoding="utf8"), re.M)
    if not m:
        sys.exit(f"{key} not found in {path}")
    return m.group(1).strip()


def sign_in() -> str:
    creds = (ROOT / "backend" / ".demo-account.txt").read_text(encoding="utf8")
    email = re.search(r"email: (.+)", creds).group(1).strip()
    password = re.search(r"password: (.+)", creds).group(1).strip()
    url = env(ROOT / "backend" / ".env", "SUPABASE_URL")
    anon = env(ROOT / "frontend" / ".env", "VITE_SUPABASE_ANON_KEY")
    r = httpx.post(f"{url}/auth/v1/token?grant_type=password", headers={"apikey": anon}, json={"email": email, "password": password}, timeout=20)
    r.raise_for_status()
    return r.json()["access_token"]


def main() -> None:
    token = sign_in()
    client = httpx.Client(base_url=BASE, headers={"Authorization": f"Bearer {token}", "X-Lang": "en", "X-Tz-Offset": "-330"}, timeout=30)
    docs = client.get("/api/documents").json()
    quizzes = client.get("/api/quizzes").json()
    if not docs or not quizzes:
        sys.exit("The demo account has no data. Run scripts/seed_demo.py first.")
    d, q = docs[0]["id"], quizzes[0]["id"]

    pages = {
        "Dashboard": ["/api/profile", "/api/stats", "/api/dashboard", "/api/planner", "/api/challenges"],
        "Library": ["/api/documents"],
        "Document summary": [f"/api/documents/{d}", f"/api/documents/{d}/annotations", f"/api/documents/{d}/podcast?topic=&level=intermediate"],
        "Flashcards": [f"/api/documents/{d}/flashcards"],
        "Quizzes list": ["/api/quizzes"],
        "Quiz": [f"/api/quizzes/{q}"],
        "Analytics": ["/api/analytics?days=60"],
        "Planner": ["/api/planner"],
        "Achievements": ["/api/achievements", "/api/challenges"],
        "Study groups": ["/api/groups"],
        "Mind map": [f"/api/documents/{d}/mindmap"],
        "Cheat sheet": [f"/api/documents/{d}/cheatsheet"],
        "Library search": ["/api/search?q=photosynthesis"],
    }

    def timed(path):
        t = time.perf_counter()
        r = client.get(path)
        r.raise_for_status()
        return (time.perf_counter() - t) * 1000

    rows = []
    with ThreadPoolExecutor(8) as pool:
        for name, paths in pages.items():
            runs = []
            for _ in range(RUNS):
                t = time.perf_counter()
                list(pool.map(timed, paths))  # the app sends these together
                runs.append((time.perf_counter() - t) * 1000)
            rows.append({"page": name, "requests": len(paths), "first_ms": round(runs[0]), "median_ms": round(statistics.median(runs)), "worst_ms": round(max(runs))})

    print(f"{'Page':<20}{'requests':>9}{'first':>8}{'median':>8}{'worst':>8}  (ms)")
    for r in rows:
        flag = "" if r["worst_ms"] <= LIMIT_MS else "  SLOW"
        print(f"{r['page']:<20}{r['requests']:>9}{r['first_ms']:>8}{r['median_ms']:>8}{r['worst_ms']:>8}{flag}")
    out = ROOT / "docs" / "benchmark-results.json"
    out.write_text(json.dumps({"ran": time.strftime("%Y-%m-%d %H:%M"), "base": BASE, "limit_ms": LIMIT_MS, "pages": rows}, indent=2), encoding="utf8")
    slow = [r["page"] for r in rows if r["worst_ms"] > LIMIT_MS]
    print("\nAll pages within 2 seconds." if not slow else f"\nOver 2 seconds: {', '.join(slow)}")
    sys.exit(1 if slow else 0)


if __name__ == "__main__":
    main()
