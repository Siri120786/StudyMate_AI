# Test report

What was tested, how, with what result, and what was not.

Run everything: `cd backend && python -m pytest tests -q`. The same suite, the frontend build and the Docker image build run in GitHub Actions on every push (`.github/workflows/ci.yml`).

## Automated tests: 89 passing

| File | Tests | What it proves |
|---|---|---|
| `test_logic.py` | 20 | Spaced repetition (growth, reset on Again, ease floor, interval cap), levels, streak freezes (bridges one gap, never two), badges, daily challenges, the exam planner (ordering, quota, mock exam, exam day), note search (English, Hindi, Telugu) |
| `test_sources_and_grading.py` | 14 | Fill-in-the-blank checking (typos, articles, other scripts), the short-answer fallback grader, the mock-exam clock, YouTube link parsing, refusal of private network addresses, article extraction |
| `test_security.py` | 12 | Rate limiter (minute and day windows, per user, per address, 429 with `Retry-After`), CSP contents and hashes, security headers, **every API route requires sign-in except two**, every AI and upload route is rate limited |
| `test_auth_speed.py` | 11 | Tokens verified locally in under 0.1 s; expired, wrong-audience, wrong-issuer and forged tokens refused; fallback to Supabase only when keys are unavailable; parallel query helpers; the database client's timeout is short |
| `test_upload.py` | 5 | Text and file uploads through the multipart parser, size limit, unsupported file type, upload flood limit |
| `test_llm_behaviour.py` | 11 | Summary length follows the notes' size and levels always grow; model fallback order, no retry of real errors, plain give-up message, 90 s deadline |
| `test_demo_data.py` | 12 | The demo account's hand-written content obeys the app's own rules (quiz question shapes, topic names, schedules, highlight placement, streak and level) |
| `test_eval_metrics.py` | 4 | The AI-evaluation metrics themselves |

## Other checks that were run

- **Dependency scan:** `pip-audit` and `npm audit`. They found 4 vulnerable Python packages (including the web framework, the upload parser and the PDF reader) and 2 in the router; all were upgraded and re-scanned clean. The full suite was re-run on the new versions.
- **AI evaluation:** see [`EVALUATION.md`](EVALUATION.md). One failed check led to a prompt fix.
- **Browser checks** against a stand-in backend: every new screen (planner, achievements, focus timer, flashcards with four ratings, the four quiz types with the mock-exam countdown and results, mind map, cheat sheet, explain it back, highlights painted into a summary, groups, the share page, library search, reading-comfort settings, Tamil interface).

## Measured speed

Measured, not estimated. Conditions are given because they matter.

| Measurement | Result |
|---|---|
| One database query to Supabase from the author's machine | 220 to 500 ms |
| Six queries one after another / the same six in parallel | 1.33 s / 0.51 s |
| Checking a login with Supabase on every request (before) | about 1.5 s |
| Checking a login locally (after) | under 0.1 s (a test enforces it) |
| `localhost` versus `127.0.0.1` for the dev proxy | 0.52 s versus 0.31 s per request on this Windows machine |
| Database client timeout (before / after) | 120 s / 12 s |
| First download (gzipped) | about 160 KB, down from one 1 MB script |
| Full page load, production build, stand-in backend delayed 300 ms per request | Dashboard 0.70 s, Library 0.93 s, Document 1.06 s, Analytics 0.59 s, Planner 1.01 s |
| Moving between pages inside the app | page frame in 40 to 100 ms; data about 350 ms later (one network round trip); a repeat visit within 15 s is instant |

All pages in the stand-in test finished under the 2-second goal. The same goal was then checked against the **real backend and real Supabase** with the seeded demo account (`python scripts/bench.py`, each page's requests sent together, 5 runs, 2026-11-06):

| Page | Requests | Median (ms) | Worst (ms) |
|---|---|---|---|
| Dashboard | 5 | 685 | 1125 |
| Library | 1 | 513 | 1538 |
| Document summary | 3 | 810 | 819 |
| Flashcards | 1 | 820 | 850 |
| Quizzes list | 1 | 409 | 413 |
| Quiz | 1 | 414 | 501 |
| Analytics | 1 | 478 | 510 |
| Planner | 1 | 407 | 515 |
| Achievements | 2 | 892 | 1430 |
| Study groups | 1 | 1275 | 1564 |
| Mind map | 1 | 819 | 955 |
| Cheat sheet | 1 | 830 | 924 |
| Library search | 1 | 410 | 672 |

Every page stayed under 2 seconds. These are API times; add the browser's own rendering (tens of milliseconds) and, on a first visit, the page's code download. The run also confirmed that every read endpoint works on live data. Write flows (uploading, generating, submitting a quiz) were not part of the benchmark.

## Defects that testing found (and fixed)

| Found by | Defect |
|---|---|
| Measuring | Every request waited about 1.5 s to check the login. |
| Measuring | The database client would wait 2 minutes on a stalled connection, which looks like a page that never loads. |
| Live benchmark | Running the parallel database queries over the library's shared HTTP/2 connection made requests fail with socket errors on Windows (23 of 60 dropped in a stress test), and its default setting serialised them (60 queries took 10.8 s). A pooled HTTP/1.1 client does the same 60 in 1.7 s with no failures, so the backend now uses that. |
| Measuring | The 1 MB single script, and all five translations bundled into it. |
| Measuring | The dev proxy added 0.2 s per request by trying IPv6 first. |
| Dependency scan | Four outdated Python packages and the router had known vulnerabilities. |
| AI evaluation | Advanced summaries could be shorter than Intermediate, and short notes were padded with invented wording. |
| AI evaluation | A silent retry loop turned an overloaded model into a 192 s wait. |
| Demo-content test | The demo group code used a letter the app never generates. |
| Browser check (a screenshot) | Icons flashed their text names (such as "local_fire_department") before the icon font loaded. |

## Not tested

Listed in [`LIMITATIONS.md`](LIMITATIONS.md): the live database behaviour of the newer features, the AWS and Render deployments, the Docker image build, the service worker, notifications and speech input, and real-network page speed.
