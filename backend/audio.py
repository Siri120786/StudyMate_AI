"""Two-host "audio overview": Gemini writes a conversation from the notes, Gemini TTS performs it."""
import io
import os
import wave
from typing import Literal

from google import genai
from google.genai import types
from pydantic import BaseModel

import llm
from langs import lang_note

TTS_MODEL = os.environ.get("GEMINI_TTS_MODEL", "gemini-3.8-flash-tts")
# Audio has its own quota pool when a key from a separate Google project is supplied.
client = genai.Client(api_key=os.environ.get("GEMINI_AUDIO_API_KEY") or os.environ["GEMINI_API_KEY"], http_options=llm.HTTP)

HOSTS = {"Alex": "Puck", "Sam": "Kore"}  # Alex asks, Sam explains
TURNS_PER_CALL = 8
RATE = 24000


class Turn(BaseModel):
    speaker: Literal["Alex", "Sam"]
    style: str  # a few words of delivery direction, e.g. "curious", "amused"
    text: str


class Script(BaseModel):
    title: str
    turns: list[Turn]


SCRIPT_SYSTEM = (
    "You write the script for a short two-person study podcast based ONLY on the <notes> block; never add facts "
    "that the notes do not support. The hosts are Alex, who is curious and asks the questions a student would "
    "ask, and Sam, who knows the material and explains it with plain language and vivid analogies. Make it "
    "sound like real people talking: contractions, short sentences, reactions ('oh, that makes sense'), "
    "occasional light humour, and Alex restating things in his own words to check understanding. Open with a "
    "hook that says what the listener will learn. Keep each turn under 60 words. Close with Sam giving the "
    "two or three things to remember, and a short sign-off. Do not use emoji, stage directions, markdown, or "
    "the words 'host' or 'podcast' inside the dialogue. 'style' is 2-4 words of delivery direction for the voice actor."
)

DEPTH = {
    "beginner": "Keep it light: only the most important points, no jargon without an immediate plain explanation.",
    "intermediate": "Cover the main ideas and the supporting topics, with correct terminology explained briefly.",
    "advanced": "Go deep: mechanisms, comparisons, edge cases and what is likely to be examined.",
}


def write_script(content: str, level: str, topics: list[dict], topic: str = "", lang: str = "en") -> dict:
    if topic:
        blurb = next((t["blurb"] for t in topics if t["title"] == topic), "")
        scope = f'Cover ONLY the topic "{topic}" ({blurb}). About 10 to 14 turns, roughly 3 minutes of speech.'
    else:
        titles = "; ".join(t["title"] for t in topics)
        scope = (
            "Cover the entire lesson, moving through these topics in order"
            f"{': ' + titles if titles else ''}. About 26 to 34 turns, roughly 7 minutes of speech."
        )
    prompt = f"{llm.notes_block(content)}{chr(10)}{chr(10)}{DEPTH[level]} {scope}"
    if lang != "en":
        prompt += lang_note(lang) + " The speaker field must stay exactly Alex or Sam, and style stays in English."
    data = llm.complete_json(SCRIPT_SYSTEM, prompt, Script, 12000, via=client)
    turns = [t for t in data.get("turns", []) if t.get("text", "").strip()]
    if len(turns) < 4:
        raise RuntimeError("Model returned too short a script")
    return {"title": data.get("title") or topic or "Audio overview", "turns": turns}


def _voice(name: str) -> types.VoiceConfig:
    return types.VoiceConfig(prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=name))


def _pcm(raw: bytes) -> bytes:
    """The API returns WAV-labelled audio; strip a RIFF header if one is present so chunks can be joined."""
    if raw[:4] == b"RIFF":
        with wave.open(io.BytesIO(raw)) as w:
            return w.readframes(w.getnframes())
    return raw


def synthesize(turns: list[dict]) -> bytes:
    """Perform the script in small batches (long requests drift and time out) and return one WAV file."""
    config = types.GenerateContentConfig(
        response_modalities=["AUDIO"],
        speech_config=types.SpeechConfig(
            multi_speaker_voice_config=types.MultiSpeakerVoiceConfig(
                speaker_voice_configs=[types.SpeakerVoiceConfig(speaker=s, voice_config=_voice(v)) for s, v in HOSTS.items()]
            )
        ),
    )
    pcm = bytearray()
    for i in range(0, len(turns), TURNS_PER_CALL):
        parts = [
            types.Part(text=t["text"].strip(), speech_metadata=types.SpeechMetadata(speaker=t["speaker"], style=t.get("style") or None))
            for t in turns[i : i + TURNS_PER_CALL]
        ]
        resp = llm._retry(
            lambda: client.models.generate_content(
                model=TTS_MODEL, contents=[types.Content(role="user", parts=parts)], config=config
            )
        )
        data = resp.candidates[0].content.parts[0].inline_data.data
        pcm += _pcm(data)
        pcm += b"\x00" * int(RATE * 2 * 0.25)  # a quarter second of air between batches

    out = io.BytesIO()
    with wave.open(out, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(bytes(pcm))
    return out.getvalue()


def seconds_of(wav: bytes) -> int:
    with wave.open(io.BytesIO(wav)) as w:
        return round(w.getnframes() / w.getframerate())
