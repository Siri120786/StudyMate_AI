# Demo script (about 10 minutes)

The demo account already contains the output of every feature, so nothing has to be generated live and the free AI limit cannot interrupt you.

## Before the evaluation

1. In Supabase, run `supabase/schema.sql` (once).
2. From the `app` folder with the backend venv active: `python scripts/seed_demo.py`
   (add `--no-audio` if you do not want to spend voice quota; the audio overview will then be missing).
3. Your sign-in details are in `backend/.demo-account.txt` (email and password). The seed can be run again at any time to put the account back exactly as it was.
4. Start the app (or open the live URL), sign in once and click through the pages so the browser has loaded them.
5. Do not use the AI buttons on stage. Everything below is already saved.

## The walk-through

| Minute | Show | Say |
|---|---|---|
| 0:00 | **Dashboard.** Level 5, a 15-day streak, daily XP bar, today's three challenges, the Biology exam countdown. | "StudyMate turns a student's own notes into a full study kit and tracks mastery. This student has been using it for two weeks." |
| 1:00 | **Library, then Photosynthesis.** Switch **Beginner, Intermediate, Advanced**. | "Same notes, three depths. Beginner is only the key points; Advanced is exam depth. The AI was told to use only the uploaded notes." |
| 2:00 | **Topic by topic** toggle, open *The Calvin cycle*. Click a highlighted passage in the **Highlights** tab. | "Students can study the whole lesson or one topic at a time. Highlights and notes are saved." |
| 3:00 | **Audio overview** card, press play. | "Two hosts discuss the topic like a podcast, with a transcript." |
| 3:45 | **Flashcards.** Flip one, show the four buttons with the next review time. Open **Manage cards** and **Export**. | "Spaced repetition: harder cards return sooner. Cards can be edited and exported to Anki, CSV or PDF." |
| 4:45 | **Quizzes.** Open the mock exam results, then the full-lesson quiz. | "Four question types, a timed mock exam, and written answers marked by the AI on meaning, not wording." |
| 5:45 | Quiz results: **Results by topic**, the weak topic with its three buttons. | "Weak topics are flagged and the student is sent back to read it, then try that topic again." |
| 6:30 | **Mind map** and **Cheat sheet** tabs. **Explain** tab (show only the screen; do not submit). | "A one-page map, a printable revision sheet, and a mode where the student teaches the topic back, by voice if they like." |
| 7:15 | **Planner.** | "From the exam date it builds today's list: cards due, weak topics first, then unread topics." |
| 7:45 | **Achievements**, then **Study groups**. | "Levels, badges, streak freezes, daily challenges, and a weekly leaderboard with friends." |
| 8:30 | Language button: switch to **Hindi** or **Telugu**. Open the summary: Hindi and Telugu versions are already saved. | "Six languages for the interface, and the AI writes in the chosen language." |
| 9:00 | **Settings.** Text size, the easier-to-read font, reminders, export my data. | "Accessibility and privacy controls, including a full data export and account deletion." |
| 9:30 | Open the share page `/s/demo-photosynthesis` in a private window. | "A read-only link a friend can open and copy into their own library." |

## If something goes wrong

- **A page shows an error:** reload once. Pages retry on their own, and the browser never waits more than 15 seconds.
- **"You are going a little fast":** that is the rate limiter working. Wait the number of seconds it says.
- **Audio will not play:** it may not have been recorded (voice quota). Say so and skip to flashcards.
- **No internet:** the app shell still opens (installed app), but sign-in and data need a connection.

## Questions you are likely to get, and honest answers

- **How do you stop the AI making things up?** Every prompt says to use only the supplied notes. We measured it: [`EVALUATION.md`](EVALUATION.md) reports how much of the generated text is supported by the notes. It still can be wrong, which the app says on the landing page and in the Terms.
- **What if a student spams the AI?** Per-user limits (12 a minute, 150 a day) return a friendly wait message; tested.
- **Is my data private?** Other students cannot read it: server-side checks plus database row-level security. The notes are sent to Google's Gemini API to be summarised, which the Privacy page states.
- **Why FastAPI and Supabase?** Keys must stay on a server; Supabase gives us Postgres, sign-in and storage without running them ourselves. See [`ARCHITECTURE.md`](ARCHITECTURE.md).
- **Is the free tier enough?** Not for a class. Gemini's free quota is small, so the app falls back across models, limits each user, and the demo avoids live generation. Production would need billing enabled.
- **What is not finished?** See [`LIMITATIONS.md`](LIMITATIONS.md). Telling them first works better than being caught.
