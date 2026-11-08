import html
import io
import re
import zipfile
from pathlib import Path

from fastapi import HTTPException
from pypdf import PdfReader

import llm

IMAGE_MIME = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp"}
AUDIO_MIME = {".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".wav": "audio/wav", ".ogg": "audio/ogg", ".webm": "audio/webm", ".aac": "audio/aac", ".flac": "audio/flac"}
MIN_CHARS = 200


def _pdf(raw: bytes) -> str:
    try:
        text = "\n\n".join(p.extract_text() or "" for p in PdfReader(io.BytesIO(raw)).pages).strip()
    except Exception:
        raise HTTPException(400, "Could not read that PDF")
    if len(text) < MIN_CHARS:
        # Likely a scan: let Gemini read the pages.
        text = llm.transcribe(raw, "application/pdf")
    return text


def _docx(raw: bytes) -> str:
    from docx import Document

    try:
        doc = Document(io.BytesIO(raw))
    except Exception:
        raise HTTPException(400, "Could not read that DOCX file")
    parts = [p.text for p in doc.paragraphs if p.text.strip()]
    for table in doc.tables:
        for row in table.rows:
            parts.append(" | ".join(c.text.strip() for c in row.cells))
    return "\n\n".join(parts)


def _epub(raw: bytes) -> str:
    try:
        with zipfile.ZipFile(io.BytesIO(raw)) as z:
            names = sorted(n for n in z.namelist() if n.lower().endswith((".xhtml", ".html", ".htm")))
            chunks = []
            for name in names:
                body = z.read(name).decode("utf-8", errors="ignore")
                body = re.sub(r"(?is)<(script|style).*?</\1>", " ", body)
                body = re.sub(r"(?i)</(p|div|h[1-6]|li|br)\s*>", "\n", body)
                chunks.append(html.unescape(re.sub(r"<[^>]+>", " ", body)))
    except zipfile.BadZipFile:
        raise HTTPException(400, "Could not read that EPUB file")
    return re.sub(r"[ \t]+", " ", "\n".join(chunks)).strip()


def extract_text(filename: str, raw: bytes) -> str:
    ext = Path(filename).suffix.lower()
    if ext == ".pdf":
        text = _pdf(raw)
    elif ext == ".docx":
        text = _docx(raw)
    elif ext == ".epub":
        text = _epub(raw)
    elif ext in IMAGE_MIME:
        text = llm.transcribe(raw, IMAGE_MIME[ext])
    elif ext in AUDIO_MIME:
        text = llm.transcribe(raw, AUDIO_MIME[ext])
    elif ext in (".txt", ".md", ""):
        text = raw.decode("utf-8", errors="ignore").strip()
    else:
        raise HTTPException(400, "Unsupported file type. Use PDF, DOCX, EPUB, TXT, an image, or an audio recording.")
    if len(text.strip()) < MIN_CHARS:
        raise HTTPException(400, "Not enough readable text to study from (need roughly 200 characters).")
    return text.strip()
