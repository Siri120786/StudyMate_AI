# AI evaluation

Does StudyMate's AI stay faithful to the student's notes? This report answers with measurements, including the one that failed.

Run it yourself: `python scripts/eval_ai.py` (about 8 Gemini calls). Raw numbers are written to `docs/evaluation-results.json`.

## How it works

The notes are the Photosynthesis text used by the demo account (`scripts/demo_data.py`, about 320 words, written for this project). Because we know exactly what they say, we can check whether what the model writes is supported by them.

**Grounding** is the share of the generated text's content words (matched by their first five letters) that also appear in the notes. It is a crude, lexical measure: it catches invented material but also penalises honest paraphrase and added explanation, so a score around 0.8 to 0.9 is healthy for summaries and near 1.0 is expected for quiz answers, which should be quoted from the notes.

## Results from the first run (2026-11-04)

| Check | Result | Verdict |
|---|---|---|
| **Outline:** 5 topics found, every one located in the notes, in reading order | 5 of 5 | Pass |
| **Quiz:** 10 questions, all four types present | answers supported by the notes 100%, explanations 80%, topics match the outline 100% | Pass |
| **Flashcards:** 10 cards | answers supported by the notes 92%, no duplicate fronts | Pass |
| **Explain it back:** a correct explanation versus a wrong one ("plants eat soil") | scored 78 versus 0 | Pass |
| **Marking written answers:** 3 paraphrased or wrong answers, one blank, one correct paraphrase | 5 of 5 marked as expected | Pass |
| **Hindi output:** beginner summary requested in Hindi | 72% of letters in Devanagari (the rest are English technical terms in brackets, as instructed) | Pass |
| **Summary levels:** Beginner 307 words, Intermediate 768, Advanced 710 | Advanced was shorter than Intermediate; grounding was 0.84, 0.73 and 0.71 | **Fail** |

## The failure, and what it showed

The tiers did not grow: Advanced came out shorter than Intermediate, and the two higher levels contained a lot of wording that is not in the notes (grounding 0.73 and 0.71, against 0.84 for Beginner).

The cause was in the prompts. They asked for fixed lengths per topic (for example "350 to 500 words per topic" for Advanced). The sample notes say only about 80 words on each topic, so the model had to either stretch or invent. That is exactly the behaviour the app is meant to avoid, and it would have shown up on any short notes.

**The fix:** the target length is now computed from the notes themselves (Beginner about 30% of the source, Intermediate 60%, Advanced 90%, with sensible floors and ceilings), and the prompt says to write fewer words rather than add anything the notes do not support. For the 320-word sample that is about 100, 190 and 290 words: always increasing, never longer than the source. Unit tests (`backend/tests/test_llm_behaviour.py`) lock in that each level is longer than the one before and never exceeds the notes.

## After the fix: two more runs of the summary check

The bar stayed at 0.85 throughout. It was not lowered to get a pass.

| Run | Beginner | Intermediate | Advanced | Levels grow? | Verdict |
|---|---|---|---|---|---|
| 1. Original prompts | 307 words, grounding 0.84 | 768 words, 0.73 | 710 words, 0.71 | No | Fail |
| 2. Length now tied to the notes | 99 words, 0.80 | 190 words, 0.84 | 261 words, 0.75 | Yes | Fail (grounding below 0.85) |
| 3. Prompts also stop asking for anything beyond the notes | 155 words, 0.89 | 188 words, 0.86 | 191 words, 0.87 | Yes | **Pass** |

Run 2 fixed the length problem but grounding was still low, which pointed back at the prompts. Two of them invited material that is not in the notes: Beginner said to use "an everyday analogy", and Advanced asked for "edge cases, trade-offs and common misconceptions". With only the notes to draw on, the model had to supply those itself. Run 3 removed both and told the model to add no facts, analogies or exceptions the notes do not contain. Grounding rose on every level.

**The honest trade-off:** with notes this short (about 320 words) there is little more to say at higher levels, so Intermediate and Advanced come out almost the same length (188 versus 191 words) and differ mainly in depth and structure. Beginner is also longer than its 100-word target. On longer notes the length targets separate the levels clearly (a test checks that 1,500 words of notes give targets of 450, 900 and 1,350 words), but that has not been measured with the AI on a long document. A longer sample is the obvious next improvement to this evaluation.

The other six checks were last run before this prompt change. The quiz, flashcard, explain, marking and Hindi checks do not use the summary prompts, so they are unaffected; the Hindi check does (it asks for a Beginner summary in Hindi), so it was re-run after the change and passed (67% of letters in Devanagari).

## A second finding: slow responses

The first run showed an outline call taking 192 seconds. The AI library was retrying silently with long waits while the model was overloaded. That is exactly what a person would experience as a page that loads forever. The app now allows each model one quick attempt (60 seconds at most), moves to the next fallback model, and gives up after 90 seconds in total with a plain message ("The AI is very busy right now. Please try again in a minute."). Tests cover the fallback order, refusing to retry real errors, and the deadline.

## What this does not prove

- It tests one set of notes in one subject. It says nothing about maths-heavy, diagram-heavy or very long material.
- Grounding is lexical. A summary can reuse the notes' words and still say something false. A person should read AI output that matters for an exam.
- Model behaviour changes as Google updates models. The script exists so this can be re-measured.
- The Hindi check measures script, not translation quality; a native speaker should review.
