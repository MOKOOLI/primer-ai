"""Structured logging helpers for Pharma research operations.

Events are single-line, key=value friendly for Render / Cloud logs.
No PII: never log sequences, PDBQT bodies, emails, or raw request bodies.
"""
from __future__ import annotations

import logging
import time
from contextlib import contextmanager
from typing import Any, Iterator, Optional

log = logging.getLogger("primerai.pharma")


def _fmt(event: str, **fields: Any) -> str:
    parts = [f"event={event}"]
    for key, value in fields.items():
        if value is None:
            continue
        text = str(value).replace("\n", " ").replace("\r", " ")
        if " " in text or "=" in text:
            text = text.replace('"', "'")
            parts.append(f'{key}="{text}"')
        else:
            parts.append(f"{key}={text}")
    return " ".join(parts)


def pharma_info(event: str, **fields: Any) -> None:
    log.info(_fmt(event, **fields))


def pharma_warning(event: str, **fields: Any) -> None:
    log.warning(_fmt(event, **fields))


def pharma_error(event: str, **fields: Any) -> None:
    log.error(_fmt(event, **fields))


@contextmanager
def timed(event: str, **fields: Any) -> Iterator[dict]:
    """Yield a mutable ctx; on exit log duration_ms and any ctx keys."""
    ctx: dict = dict(fields)
    started = time.perf_counter()
    try:
        yield ctx
        ctx.setdefault("ok", True)
    except Exception as exc:
        ctx["ok"] = False
        ctx.setdefault("error_type", type(exc).__name__)
        ctx.setdefault("error", str(exc)[:200])
        raise
    finally:
        ctx["duration_ms"] = int((time.perf_counter() - started) * 1000)
        if ctx.get("ok"):
            pharma_info(event, **ctx)
        else:
            pharma_warning(event, **ctx)


def cache_event(
    *,
    key: str,
    outcome: str,
    ttl_hours: Optional[float] = None,
    error: Optional[str] = None,
) -> None:
    """outcome: hit | miss | stale | store | error"""
    fields: dict[str, Any] = {"cache_key": key, "outcome": outcome}
    if ttl_hours is not None:
        fields["ttl_hours"] = round(ttl_hours, 2)
    if error:
        fields["error"] = error[:200]
    if outcome in {"stale", "error"}:
        pharma_warning("pharma.cache", **fields)
    else:
        pharma_info("pharma.cache", **fields)


def upstream_event(
    *,
    provider: str,
    operation: str,
    ok: bool,
    duration_ms: Optional[int] = None,
    error: Optional[str] = None,
    detail: Optional[str] = None,
) -> None:
    fields: dict[str, Any] = {
        "provider": provider,
        "operation": operation,
        "ok": ok,
    }
    if duration_ms is not None:
        fields["duration_ms"] = duration_ms
    if error:
        fields["error"] = error[:200]
    if detail:
        fields["detail"] = detail[:120]
    if ok:
        pharma_info("pharma.upstream", **fields)
    else:
        pharma_warning("pharma.upstream", **fields)


def docking_event(
    *,
    phase: str,
    ok: Optional[bool] = None,
    duration_ms: Optional[int] = None,
    error_type: Optional[str] = None,
    error: Optional[str] = None,
    seed: Optional[int] = None,
    poses: Optional[int] = None,
) -> None:
    """phase: status | run_start | run_done | run_fail — never log PDBQT content."""
    fields: dict[str, Any] = {"phase": phase}
    if ok is not None:
        fields["ok"] = ok
    if duration_ms is not None:
        fields["duration_ms"] = duration_ms
    if error_type:
        fields["error_type"] = error_type
    if error:
        fields["error"] = error[:200]
    if seed is not None:
        fields["seed"] = seed
    if poses is not None:
        fields["poses"] = poses
    if phase == "run_fail" or ok is False:
        pharma_warning("pharma.docking", **fields)
    else:
        pharma_info("pharma.docking", **fields)


def access_event(
    *,
    action: str,
    status: Optional[str] = None,
    is_admin: Optional[bool] = None,
    user_id: Optional[int] = None,
) -> None:
    """Log access decisions without email or purpose text."""
    fields: dict[str, Any] = {"action": action}
    if status is not None:
        fields["status"] = status
    if is_admin is not None:
        fields["is_admin"] = is_admin
    if user_id is not None:
        fields["user_id"] = user_id
    pharma_info("pharma.access", **fields)
