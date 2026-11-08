"""Pull study text from a web page or a YouTube video."""
import ipaddress
import re
import socket
from urllib.parse import parse_qs, urljoin, urlparse

import httpx
from bs4 import BeautifulSoup
from fastapi import HTTPException

MAX_BYTES = 3_000_000
MAX_HOPS = 4
# Identify honestly. Sites that refuse automated readers will answer 403, and we report that rather than evade it.
HEADERS = {"User-Agent": "StudyMateBot/1.0 (student notes importer)", "Accept": "text/html,text/plain;q=0.9"}
NOISE = ("script", "style", "nav", "header", "footer", "aside", "form", "noscript", "svg", "iframe")


def assert_public(url: str) -> None:
    """Refuse anything that is not a public http(s) address, so the server cannot be pointed at internal services."""
    parts = urlparse(url)
    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise HTTPException(400, "Enter a full web address starting with http:// or https://")
    try:
        infos = socket.getaddrinfo(parts.hostname, parts.port or (443 if parts.scheme == "https" else 80), proto=socket.IPPROTO_TCP)
    except socket.gaierror:
        raise HTTPException(400, "Could not find that website")
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast or ip.is_unspecified:
            raise HTTPException(400, "That address cannot be imported")


def fetch_page(url: str) -> tuple[str, str]:
    """Return (title, text) for a web page, following a few redirects and re-checking each hop."""
    with httpx.Client(timeout=15, follow_redirects=False, headers=HEADERS) as client:
        for _ in range(MAX_HOPS):
            assert_public(url)
            try:
                with client.stream("GET", url) as res:
                    if res.is_redirect and res.headers.get("location"):
                        url = urljoin(url, res.headers["location"])
                        continue
                    if res.status_code in (401, 403, 429):
                        raise HTTPException(400, "That website does not allow automated reading. Save the page as a PDF and upload it, or paste the text.")
                    if res.status_code >= 400:
                        raise HTTPException(400, f"The website answered with an error ({res.status_code})")
                    kind = res.headers.get("content-type", "")
                    if "html" not in kind and "text" not in kind:
                        raise HTTPException(400, "That link is not a web page. Download the file and upload it instead.")
                    body = b""
                    for chunk in res.iter_bytes():
                        body += chunk
                        if len(body) > MAX_BYTES:
                            break
                    encoding = res.encoding or "utf-8"
                    break
            except httpx.HTTPError:
                raise HTTPException(400, "Could not open that link")
        else:
            raise HTTPException(400, "That link redirects too many times")
    return parse_html(body.decode(encoding, errors="ignore"))


def parse_html(markup: str) -> tuple[str, str]:
    soup = BeautifulSoup(markup, "html.parser")
    title = ""
    og = soup.find("meta", property="og:title")
    if og and og.get("content"):
        title = og["content"].strip()
    elif soup.title and soup.title.string:
        title = soup.title.string.strip()
    for tag in soup(NOISE):
        tag.decompose()
    root = soup.find("article") or soup.find("main") or soup.body or soup
    text = root.get_text("\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n\s*\n+", "\n\n", text).strip()
    return title[:120], text


def youtube_id(url: str) -> str | None:
    parts = urlparse(url)
    host = (parts.hostname or "").lower().removeprefix("www.").removeprefix("m.")
    if host == "youtu.be":
        return parts.path.strip("/").split("/")[0] or None
    if host in ("youtube.com", "music.youtube.com"):
        if parts.path == "/watch":
            return parse_qs(parts.query).get("v", [None])[0]
        m = re.match(r"/(?:embed|shorts|live)/([\w-]{6,})", parts.path)
        return m.group(1) if m else None
    return None


def youtube(video_id: str) -> tuple[str, str]:
    """Return (title, transcript). Needs a video with captions (manual or automatic)."""
    from youtube_transcript_api import YouTubeTranscriptApi

    try:
        listing = YouTubeTranscriptApi().list(video_id)
        try:
            transcript = listing.find_transcript(["en", "hi", "te", "ta", "kn", "ml"])
        except Exception:
            transcript = next(iter(listing))
        text = " ".join(s.text.replace("\n", " ") for s in transcript.fetch())
    except Exception:
        raise HTTPException(400, "This video has no captions we can read. Try another video, or paste the transcript.")
    title = ""
    try:
        res = httpx.get("https://www.youtube.com/oembed", params={"url": f"https://www.youtube.com/watch?v={video_id}", "format": "json"}, timeout=10)
        title = res.json().get("title", "")
    except Exception:
        pass
    return title[:120], re.sub(r"\s+", " ", text).strip()
