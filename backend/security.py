"""Browser security headers, including a Content-Security-Policy built for this app's real dependencies."""
import base64
import hashlib
import re
from urllib.parse import urlparse


def inline_script_hashes(index_html: str) -> list[str]:
    """CSP hashes for the inline <script> blocks in the built index.html (the theme script that avoids a flash)."""
    out = []
    for body in re.findall(r"<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>", index_html, re.S):
        digest = base64.b64encode(hashlib.sha256(body.encode("utf-8")).digest()).decode()
        out.append(f"'sha256-{digest}'")
    return out


HERO_VIDEO_HOST = "https://d8j0ntlcm91z4.cloudfront.net"


def csp_for(index_html: str, supabase_url: str) -> str:
    host = urlparse(supabase_url).netloc
    connect = ["'self'"] + ([f"https://{host}", f"wss://{host}"] if host else [])
    scripts = ["'self'", *inline_script_hashes(index_html)]
    parts = {
        "default-src": ["'self'"],
        "script-src": scripts,
        # React sets some inline style attributes, so styles need 'unsafe-inline'; scripts do not.
        "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        "font-src": ["'self'", "https://fonts.gstatic.com"],
        "img-src": ["'self'", "data:", "blob:"],
        "media-src": ["'self'", "blob:", HERO_VIDEO_HOST],  # the landing page's background video
        "connect-src": connect,
        "worker-src": ["'self'"],
        "manifest-src": ["'self'"],
        "object-src": ["'none'"],
        "base-uri": ["'self'"],
        "form-action": ["'self'"],
        "frame-ancestors": ["'none'"],
    }
    return "; ".join(f"{k} {' '.join(v)}" for k, v in parts.items())


def security_headers(csp: str | None, https: bool) -> dict[str, str]:
    headers = {
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        # the microphone is used for speaking an "explain it back" answer; nothing else is requested
        "Permissions-Policy": "microphone=(self), camera=(), geolocation=(), payment=()",
        "Cross-Origin-Opener-Policy": "same-origin",
    }
    if csp:
        headers["Content-Security-Policy"] = csp
    if https:
        headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return headers
