"""Languages the app can write study material in. The UI languages live in the frontend."""

LANGS = {"en": "English", "hi": "Hindi", "te": "Telugu", "ta": "Tamil", "kn": "Kannada", "ml": "Malayalam"}


def lang_note(lang: str) -> str:
    """Instruction appended to prompts so generated material comes out in the student's language."""
    if lang == "en" or lang not in LANGS:
        return ""
    return (
        f" Write everything the student will read in {LANGS[lang]}, naturally and not word for word. "
        "Keep widely used English technical terms recognisable, and put the English term in brackets the first "
        "time it appears. Do not translate field names or fixed labels that the instructions say to copy exactly."
    )
