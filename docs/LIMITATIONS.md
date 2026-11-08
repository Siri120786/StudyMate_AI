# Known limitations

Written down so nobody has to discover them.

## What was not tested, and why

| Area | Status |
|---|---|
| Live database behaviour of the newer features | The read paths are exercised on real data by `scripts/seed_demo.py` and `scripts/bench.py` (all pass). Write paths (uploading, generating, submitting quizzes, creating shares and groups through the app) are covered by unit tests and need a manual click-through. |
| AWS and Render deployment | Scripts, a blueprint and a guide are provided; never run, because they need your own accounts. |
| Docker image build | `Dockerfile` is provided and the GitHub workflow builds it on every push. It was not built on the author's machine because Docker Desktop was not running. |
| Service worker, install prompt, notifications, speech input | Written to the browser standards; the development environment's embedded browser cannot run service workers, so these need a check in Chrome or Edge. |
| Real-network page speed | API times measured against the real backend and database from the author's machine (all pages under 2 s; see the test report). Times from another country or a deployed server will differ. |

## Product limits

- **AI output can be wrong.** It is told to use only the notes and measured against them ([`EVALUATION.md`](EVALUATION.md)), but a human should check anything that matters for an exam.
- **Free Gemini quota is small** (about 20 requests a day per model on the free tier). The app spreads across several models, limits each user, and shows a plain message when the AI is busy, but a whole class would need a paid plan.
- **Web-page import** works only on sites that allow automated reading, and says so when they refuse. YouTube import needs captions. Audio import is capped at 12 MB.
- **Highlights spanning several paragraphs** are saved in the Highlights tab but not painted inline in the summary.
- **Translations:** Hindi, Telugu, Tamil, Kannada and Malayalam interface text was machine translated. Some newer texts are still in English, and a native speaker should review the rest. Privacy and Terms are English only. AI-written content follows the chosen language directly.
- **Reminders** work while the app is open in a tab or installed, not when everything is closed (that would need a push server).
- **Rate limits are per server process**, and a signed-out token stays valid until it expires (one hour).
- **Study groups** have no moderation or chat. They show names and weekly XP only.
- **Teacher or classroom mode** and a standalone desktop pet were deliberately left out.
