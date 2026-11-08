import { L } from "./i18n";

// id -> [name, how to earn it]. The server decides who has earned what; these are only the words.
export const BADGE_TEXT = {
  first_upload: [L("First notes"), L("Upload your first notes.")],
  library_5: [L("Growing library"), L("Add 5 sets of notes.")],
  first_summary: [L("First summary"), L("Read your first summary.")],
  first_quiz: [L("Quiz starter"), L("Finish your first quiz.")],
  quiz_10: [L("Quiz regular"), L("Finish 10 quizzes.")],
  perfect_score: [L("Perfect score"), L("Get every question right in a quiz.")],
  cards_50: [L("Card sharp"), L("Review 50 flashcards.")],
  cards_250: [L("Memory machine"), L("Review 250 flashcards.")],
  streak_3: [L("Three in a row"), L("Study 3 days in a row.")],
  streak_7: [L("Week streak"), L("Study 7 days in a row.")],
  streak_30: [L("Month streak"), L("Study 30 days in a row.")],
  focus_first: [L("Deep work"), L("Finish a focus session.")],
  focus_5h: [L("Five hours focused"), L("Focus for 5 hours in total.")],
  mastery_1: [L("Topic mastered"), L("Score 90% on a topic across 5 or more questions.")],
  mastery_5: [L("Five topics mastered"), L("Master 5 topics.")],
  level_5: [L("Level 5"), L("Reach level 5.")],
  early_bird: [L("Early bird"), L("Study before 8am on 3 different days.")],
  night_owl: [L("Night owl"), L("Study after 10pm on 3 different days.")],
  exam_planned: [L("Planner"), L("Add an exam to your planner.")],
};

// key -> label template shown for each daily challenge
export const CHALLENGE_TEXT = {
  cards: L("Review {n} flashcards"),
  quiz: L("Finish {n} quiz"),
  focus: L("Focus for {n} minutes"),
  summary: L("Read {n} summary"),
};
