import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()  # local dev only; in Docker/App Runner the env is already set

from fastapi import FastAPI  # noqa: E402  (routers read env at import, so they must follow load_dotenv)
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import FileResponse  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402

import security  # noqa: E402
from routers import documents, gamify, planner, podcast, progress, social, study, tools  # noqa: E402

app = FastAPI(title="StudyMate AI")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o for o in os.environ.get("CORS_ORIGINS", "").split(",") if o],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(documents.router)
app.include_router(study.router)
app.include_router(progress.router)
app.include_router(podcast.router)
app.include_router(gamify.router)
app.include_router(planner.router)
app.include_router(tools.router)
app.include_router(social.router)


# The CSP is built from the real index.html when the frontend is bundled in (the production image).
_CSP = None
_INDEX = Path(__file__).parent / "static" / "index.html"
if _INDEX.is_file():
    _CSP = security.csp_for(_INDEX.read_text(encoding="utf-8"), os.environ.get("SUPABASE_URL", ""))


@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    https = request.headers.get("x-forwarded-proto", request.url.scheme) == "https"
    for k, v in security.security_headers(_CSP if not request.url.path.startswith("/api") else None, https).items():
        response.headers.setdefault(k, v)
    return response


@app.get("/api/health")
def health():
    return {"ok": True}


# ---------- static frontend (production image) ----------

DIST = Path(__file__).parent / "static"
if DIST.is_dir():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{path:path}")
    def spa(path: str):
        target = (DIST / path).resolve()
        if path and target.is_file() and DIST.resolve() in target.parents:
            headers = {"Cache-Control": "no-cache"} if path == "sw.js" else None
            return FileResponse(target, headers=headers)
        return FileResponse(DIST / "index.html")
