"""Per-user and per-address request limits, so one student (or a script) cannot burn the shared AI quota.

The counters live in this process's memory. That is enough for one container; with several instances each keeps
its own count, so the real ceiling is the limit times the number of instances. A reset on restart is acceptable
for a free-tier protection like this, and the limits are generous for real studying.
"""
import threading
import time
from collections import defaultdict, deque

from fastapi import Depends, HTTPException, Request

from deps import current_user

# bucket -> (allowed per minute, allowed per day)
POLICIES = {
    "ai": (12, 150),  # anything that calls Gemini
    "upload": (6, 40),  # file, link and copy imports
    "public": (30, 600),  # unauthenticated reads, counted per address
}
MINUTE, DAY = 60, 86400


class Limiter:
    def __init__(self, policies: dict[str, tuple[int, int]] = POLICIES):
        self.policies = policies
        self._hits: dict[tuple[str, str], deque] = defaultdict(deque)
        self._lock = threading.Lock()

    def hit(self, key: str, bucket: str, now: float | None = None) -> int:
        """Record one request. Returns 0 if allowed, otherwise the seconds to wait before trying again."""
        per_min, per_day = self.policies[bucket]
        now = time.time() if now is None else now
        with self._lock:
            q = self._hits[(bucket, key)]
            while q and q[0] <= now - DAY:
                q.popleft()
            recent = [t for t in q if t > now - MINUTE]
            if len(recent) >= per_min:
                return max(1, int(recent[0] + MINUTE - now) + 1)
            if len(q) >= per_day:
                return max(1, int(q[0] + DAY - now) + 1)
            q.append(now)
            if len(self._hits) > 20000:  # long-running process: forget addresses that went quiet
                for k in [k for k, v in self._hits.items() if not v or v[-1] <= now - DAY]:
                    del self._hits[k]
            return 0


limiter = Limiter()


def _refuse(wait: int) -> None:
    raise HTTPException(
        429,
        f"You are going a little fast. Please wait {wait} seconds and try again.",
        headers={"Retry-After": str(wait)},
    )


def limited(bucket: str):
    """Dependency for signed-in endpoints: counts per user."""

    def dep(user_id: str = Depends(current_user)) -> str:
        wait = limiter.hit(user_id, bucket)
        if wait:
            _refuse(wait)
        return user_id

    return dep


def client_address(request: Request) -> str:
    """The caller's address. Behind App Runner the real one is the first entry of X-Forwarded-For."""
    forwarded = request.headers.get("x-forwarded-for", "")
    return forwarded.split(",")[0].strip() or (request.client.host if request.client else "unknown")


def limited_ip(bucket: str = "public"):
    """Dependency for public endpoints: counts per address."""

    def dep(request: Request) -> str:
        addr = client_address(request)
        wait = limiter.hit(addr, bucket)
        if wait:
            _refuse(wait)
        return addr

    return dep
