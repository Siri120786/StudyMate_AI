# StudyMate AI

Turn notes into 3-tier summaries, flashcards and quizzes, then track mastery. Built from the Google Stitch "Lumina Academic" screens.

**Stack:** React + Vite + Tailwind v4 · FastAPI (SSE streaming) · Google Gemini · Supabase (auth, Postgres, RLS) · Docker · AWS App Runner or Render

## Features

- Landing page, sign up, log in, password reset, 3-step onboarding
- Upload PDF, DOCX, EPUB, TXT, images (scans are read with Gemini vision) or paste text
- Streamed summaries at Beginner / Intermediate / Advanced, key-term chips, audio briefing
- AI flashcards with Hard / Good / Easy spaced repetition (1, 3, 7 days)
- Quizzes with a timer, keyboard answers, flagging, autosave, and AI explanations per question
- Study Sidekick chat grounded in the open document
- Analytics: study volume, accuracy, retention, weekly activity, peak focus window, topic mastery, AI remediation plan
- XP, daily goal, streaks, light and dark themes, settings, data export, account deletion

## Run locally

1. Create a Supabase project and run `supabase/schema.sql` in the SQL editor. It is idempotent, so run it again after pulling updates.
2. Copy `backend/.env.example` to `backend/.env` and `frontend/.env.example` to `frontend/.env`, then fill in the keys.
3. Backend:
   ```bash
   cd backend && python -m venv .venv && .venv\Scripts\activate && pip install -r requirements.txt
   uvicorn main:app --reload --port 8000
   ```
4. Frontend: `cd frontend && npm install && npm run dev` then open http://localhost:5173

## Docker

```bash
docker build -t studymate --build-arg VITE_SUPABASE_URL=... --build-arg VITE_SUPABASE_ANON_KEY=... .
docker run -p 8080:8080 -e GEMINI_API_KEY=... -e SUPABASE_URL=... -e SUPABASE_SERVICE_KEY=... studymate
```

## Security model

- The browser holds only the Supabase publishable (anon) key; RLS limits it to reading the user's own rows.
- All writes and every Gemini call go through FastAPI, which verifies the Supabase JWT.
- `GEMINI_API_KEY` and `SUPABASE_SERVICE_KEY` are runtime env vars only.
- Quiz answers and explanations are withheld from the client until an attempt is submitted.

## Layout

```
backend/   main.py, deps.py, llm.py, extract.py, routers/{documents,study,progress}.py
frontend/  src/{pages,components,lib}
supabase/  schema.sql
```

## Languages

The interface and the AI output can be switched between English, Hindi, Telugu, Tamil, Kannada and Malayalam from the language button in the top bar.

- **UI text:** every string goes through `tr("English text")` (`frontend/src/lib/i18n.jsx`). The English text is the key, so a missing translation falls back to English. Each language is its own file in `frontend/src/lib/strings/`, downloaded only when that language is chosen.
- **Add or refresh translations:** run `python scripts/translate_ui.py` with the backend venv active (`pip install deep-translator`). It finds every `tr()` string, translates what is missing with the free Google Translate library, and rewrites the JSON files in `frontend/src/lib/strings/`; `--build` just rebuilds them from the cache. To add a language, add it to `LANGS` in `i18n.jsx`, `backend/langs.py` and `scripts/translate_ui.py`, then rerun the script.
- **AI content:** the browser sends the chosen language in an `X-Lang` header. Summaries, chat, flashcards, quizzes, the remediation plan and the audio overview are written in that language. Summaries and podcasts are stored per language.
- **Not translated:** the Privacy and Terms pages stay in English. Machine translations should be checked by a native speaker before a public launch.

## More study tools

- **Exam planner:** add an exam date and the notes it covers. `backend/logic.py` (`build_plan`) turns your progress into today's tasks: cards due, weak topics first, then unread topics, with a timed mock exam in the last three days.
- **Spaced repetition:** flashcards use SM-2 with four ratings (Again, Hard, Good, Easy). A missed card returns within ten minutes. You can add, edit and delete cards, and export them as an Anki text file, CSV, or a printable PDF.
- **Quiz types:** multiple choice, true or false, fill in the blank, and short written answers graded by the AI (with a keyword fallback if the AI is busy). Mock exams are timed, hide hints and submit themselves. Mixed quizzes pull from several documents.
- **Import:** PDF, DOCX, EPUB, TXT, images (including a camera shot of handwritten notes), audio recordings (transcribed), web pages and YouTube videos with captions. Web imports refuse private network addresses and identify honestly as `StudyMateBot`, so some sites will refuse them.
- **Export:** summaries as Markdown or through the browser's print dialog (Save as PDF works for every language).
- **Focus timer, levels and badges:** a Pomodoro timer earns 1 XP per minute, levels follow `50 * (n - 1)^2` XP, streak freezes cover a missed day, and three daily challenges pay bonus XP. Badges and level are worked out from your activity, so nothing has to be backfilled.

Run the backend tests with `python -m pytest backend/tests` (the study logic is plain Python with no database).

## Even more tools

- **Explain it back:** write or speak (browser speech recognition, in the chosen language) an explanation of a topic. The AI marks it only against your own notes: a score, what you got right, and what to add.
- **Mind map and cheat sheet:** generated from the notes, saved per language, and printable.
- **Highlights and notes:** select text in a summary to highlight it and add a note. Highlights that sit inside one paragraph are painted back into the summary; all of them are listed in the Highlights tab.
- **Ask your library:** with no document open, the Sidekick answers from the best matching passages across all your notes (BM25 ranking in `backend/logic.py`, no embeddings needed). The Library search box also searches inside notes.
- **Share links:** a document can be shared through an unguessable link that shows its summary and flashcards read-only and lets a friend copy the notes into their own library. Turn the link off at any time.
- **Study groups:** create a group, share its 6-letter code, and compare this week's XP. Members see only each other's display name and weekly XP.
- **Install as an app (PWA):** the manifest and service worker keep the app shell available offline. The service worker never caches `/api`, so signed-in data stays off the device.
- **Reading comfort:** text size, an easier-to-read font (Atkinson Hyperlegible), looser spacing and a fewer-animations mode; read-aloud for summaries; an optional daily reminder that works while the app is open or installed.
- **Model fallback:** if the main Gemini model is overloaded or out of free quota, requests move to the models in `GEMINI_FALLBACK_MODELS` automatically.

## Deploying

See `deploy/README.md` for AWS App Runner (`deploy/deploy.sh`) and Render (`render.yaml`). `.github/workflows/ci.yml` runs the backend tests, the frontend build and the Docker image build on every push.


## Demo account

`python scripts/seed_demo.py` (after running `supabase/schema.sql`) creates a demo student with every feature already filled in: three summary levels, topic summaries, Hindi and Telugu summaries, flashcards at different review stages, four quizzes with attempts, a mock exam, a weak topic, a mind map, a cheat sheet, highlights, an exam plan, a share link, a study group with two friends, a 15-day streak with a streak freeze, XP, level and badges, and a recorded audio overview. All of it is written by hand in `scripts/demo_data.py`, so showing it never calls the AI and never touches the free quota. Sign-in details go to `backend/.demo-account.txt` (git-ignored). Run it again to reset the account. `docs/DEMO_SCRIPT.md` is a ten-minute walk-through.

## Speed

Aim: every page shows its content within two seconds. What made the difference:

- Login tokens are verified locally against Supabase's public key (it used to cost about 1.5 s on every request).
- Independent database queries run in parallel, and the database client gives up after 12 s instead of 2 minutes.
- The browser remembers reads for 15 s, shares identical in-flight requests, times out after 15 s and retries once.
- Pages load on demand; the first download is about 160 KB gzipped, and each translation is a separate file.
- The dev proxy uses `127.0.0.1` rather than `localhost`, which saved about 0.2 s per request on Windows.

`python scripts/bench.py` signs in as the demo account and times every page's requests against a running backend, failing if any exceeds 2 s.

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): diagrams, data model, design choices
- [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md): what could go wrong, defences, open gaps
- [`docs/EVALUATION.md`](docs/EVALUATION.md): how faithful the AI output is, measured
- [`docs/TEST_REPORT.md`](docs/TEST_REPORT.md): every test, results, and what was not tested
- [`docs/USER_GUIDE.md`](docs/USER_GUIDE.md), [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md), [`docs/LIMITATIONS.md`](docs/LIMITATIONS.md)
- [`deploy/README.md`](deploy/README.md): deploying to AWS App Runner or Render (free plan), with cost and sleep warnings
