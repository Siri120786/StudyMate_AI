"""Collect every tr()/trx()/L() string in the frontend and translate it with the free Google Translate library.

Usage (from the app folder, backend venv active, `pip install deep-translator`):
    python scripts/translate_ui.py            # translate whatever is missing, rewrite src/lib/strings/*.json
    python scripts/translate_ui.py bn mr      # only these languages
    python scripts/translate_ui.py --build    # no translating, just rebuild the JSON files from the cache

Progress is cached in scripts/.translations.json, so an interrupted or rate-limited run resumes where it stopped.
Edit that file to fix wording, then run with --build. Machine translations should be reviewed by a native speaker.
"""
import json
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "frontend" / "src"
CACHE = Path(__file__).resolve().parent / ".translations.json"

LANGS = {"hi": "Hindi", "te": "Telugu", "ta": "Tamil", "kn": "Kannada", "ml": "Malayalam"}
# Words the UI shows through tr() that are not literal tr("...") calls in the source.
EXTRA = ["beginner", "intermediate", "advanced", "light", "dark", "Alex", "Sam"]
# Never translated: brand and technical names.
KEEP = {"StudyMate", "StudyMate AI", "XP", "AI", "PDF", "DOCX", "EPUB", "DELETE", "Alex", "Sam"}
KEEP_WORDS = ["StudyMate AI", "StudyMate", "DOCX", "EPUB", "PDF", "XP"]
PER_SECOND = 3  # Google allows roughly 5 requests a second; stay under it


def literals(expr: str):
    for m in re.finditer(r'"((?:[^"\\]|\\.)*)"', expr):
        try:
            yield json.loads(f'"{m.group(1)}"')
        except json.JSONDecodeError:
            pass


def extract() -> list[str]:
    found: dict[str, None] = {}
    for path in sorted(SRC.rglob("*.js*")):
        if path.name == "strings.js" or "strings" in path.parts:
            continue
        text = path.read_text(encoding="utf8")
        for m in re.finditer(r"\b(?:tr|trx|L)\(", text):
            i, depth, j = m.end(), 1, m.end()
            in_str = None
            while j < len(text) and depth:
                c = text[j]
                if in_str:
                    if c == "\\":
                        j += 1
                    elif c == in_str:
                        in_str = None
                elif c in "\"'`":
                    in_str = c
                elif c in "([{":
                    depth += 1
                elif c in ")]}":
                    depth -= 1
                elif c == "," and depth == 1:
                    break
                j += 1
            for lit in literals(text[i:j]):
                if re.search(r"[A-Za-z]{2}", lit) and lit not in KEEP:
                    found.setdefault(lit)
    for e in EXTRA:
        found.setdefault(e)
    return list(found)


def protect(text: str):
    """Swap {placeholders} and brand names for neutral tokens Google leaves alone; returns (masked, tokens)."""
    tokens: list[str] = []

    def mask(m):
        tokens.append(m.group(0))
        return f"[{len(tokens) - 1}]"

    pattern = r"\{\w+\}|" + "|".join(re.escape(w) for w in KEEP_WORDS)
    return re.sub(pattern, mask, text), tokens


def restore(text: str, tokens: list[str]):
    for i, tok in enumerate(tokens):
        text = re.sub(rf"\[\s*{i}\s*\]", lambda _m, t=tok: t, text)
    return text


_last = [0.0]


def google(lang: str, text: str) -> str:
    from deep_translator import GoogleTranslator

    wait = 1 / PER_SECOND - (time.time() - _last[0])
    if wait > 0:
        time.sleep(wait)
    _last[0] = time.time()
    return GoogleTranslator(source="en", target=lang).translate(text)


def translate_one(lang: str, text: str) -> str | None:
    masked, tokens = protect(text)
    for attempt in range(6):
        try:
            out = google(lang, masked)
        except Exception as exc:
            if "too many" in str(exc).lower() or "429" in str(exc):
                time.sleep(8 * (attempt + 1))
                continue
            time.sleep(2)
            continue
        out = restore((out or "").strip(), tokens)
        if out and set(re.findall(r"\{\w+\}", out)) == set(re.findall(r"\{\w+\}", text)):
            return out
    return None


def write_strings(cache: dict, keys: list[str]):
    """One JSON file per language, so the app downloads only the language the student picked."""
    wanted = set(keys)
    folder = SRC / "lib" / "strings"
    folder.mkdir(exist_ok=True)
    for lang in LANGS:
        data = {k: v for k, v in cache.get(lang, {}).items() if k in wanted}
        (folder / f"{lang}.json").write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf8")
        print(lang, f"{len(data)}/{len(keys)}")


def main():
    args = sys.argv[1:]
    keys = extract()
    cache = json.loads(CACHE.read_text(encoding="utf8")) if CACHE.exists() else {}
    if "--build" in args:
        return write_strings(cache, keys)

    want = [a for a in args if a in LANGS] or list(LANGS)
    print(f"{len(keys)} strings, languages: {', '.join(want)}", flush=True)
    for lang in want:
        have = cache.setdefault(lang, {})
        todo = [k for k in keys if k not in have]
        done = 0
        with ThreadPoolExecutor(max_workers=2) as pool:
            for k, v in zip(todo, pool.map(lambda k: translate_one(lang, k), todo)):
                if v:
                    have[k] = v
                    done += 1
                if done % 40 == 0:
                    CACHE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf8")
        CACHE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf8")
        print(f"  {lang}: {done}/{len(todo)} new, {len(have)}/{len(keys)} total", flush=True)
    write_strings(cache, keys)


if __name__ == "__main__":
    main()
