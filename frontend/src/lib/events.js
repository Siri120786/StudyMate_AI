/** Tell the study cat something happened: "cheer" for a win, "focus" while a timer runs, "badge" for an achievement. */
export const pet = (kind, message = "") => window.dispatchEvent(new CustomEvent("studycat", { detail: { kind, message } }));
