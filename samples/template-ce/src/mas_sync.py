"""Pull associated MAS after register and keep local state from notifications.

Discovery: GET /api/cognition-engine/{ceId}/multi-agentic-systems until 200.
Empty mas_ids is terminal. 404/503/network retry. GET-by-id 404 drops that MAS.
A per-MAS generation is bumped on drop so an in-flight GET cannot revive it.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any, Optional

import httpx

logger = logging.getLogger(__name__)

DISCOVERY_RETRY = {404, 502, 503}
MAS_RETRY = {502, 503}
MAX_DELAY = 30.0

_mas: dict[str, dict[str, Any]] = {}
_gen: dict[str, int] = {}
_lock = asyncio.Lock()
_sync_task: Optional[asyncio.Task] = None
_stop: Optional[asyncio.Event] = None
_pending: set[asyncio.Task] = set()


def known_mas_ids() -> list[str]:
    return sorted(_mas)


async def drop_mas(mas_id: str) -> None:
    async with _lock:
        _gen[mas_id] = _gen.get(mas_id, 0) + 1
        removed = _mas.pop(mas_id, None)
    if removed is not None:
        logger.info("[MAS] dropped mas_id=%s", mas_id)


async def upsert_mas(
    mas_id: str, details: dict[str, Any], *, generation: Optional[int] = None
) -> bool:
    async with _lock:
        if generation is not None and _gen.get(mas_id, 0) != generation:
            return False
        _mas[mas_id] = details
    from notification_server import format_mas_summary

    logger.info("%s", format_mas_summary(details))
    return True


async def _generation(mas_id: str) -> int:
    async with _lock:
        return _gen.get(mas_id, 0)


def _track(task: asyncio.Task) -> None:
    _pending.add(task)
    task.add_done_callback(_pending.discard)


def schedule(coro) -> None:
    _track(asyncio.create_task(coro))


async def fetch_mas_details(
    mas_id: str,
    *,
    cfn_url: Optional[str] = None,
    client: Optional[httpx.AsyncClient] = None,
    stop: Optional[asyncio.Event] = None,
) -> Optional[dict[str, Any]]:
    """GET MAS details. Retry 502/503/network. 404 drops. Returns the body on 200."""
    import os

    base = (cfn_url if cfn_url is not None else os.getenv("CFN_URL", "")).rstrip("/")
    if not base or not mas_id:
        return None

    owns_client = client is None
    if owns_client:
        client = httpx.AsyncClient(timeout=5.0)
    delay = 0.5
    gen = await _generation(mas_id)
    try:
        while stop is None or not stop.is_set():
            try:
                response = await client.get(
                    f"{base}/api/multi-agentic-systems/{mas_id}",
                    params={"metadata": "true"},
                )
            except httpx.TransportError as e:
                logger.warning("[MAS] error fetching MAS %s: %s", mas_id, e)
            else:
                if response.status_code == 200:
                    details = response.json()
                    if await upsert_mas(mas_id, details, generation=gen):
                        return details
                    return None
                if response.status_code == 404:
                    logger.info("[MAS] MAS gone, dropping mas_id=%s", mas_id)
                    await drop_mas(mas_id)
                    return None
                if response.status_code not in MAS_RETRY:
                    logger.warning("[MAS] Failed to fetch MAS: %s", response.status_code)
                    return None
                logger.warning("[MAS] transient fetch status=%s mas_id=%s", response.status_code, mas_id)
            if stop is not None and stop.is_set():
                return None
            await asyncio.sleep(delay)
            delay = min(delay * 2, MAX_DELAY)
    finally:
        if owns_client:
            await client.aclose()
    return None


async def list_associated_mas_ids(
    ce_id: str,
    *,
    cfn_url: Optional[str] = None,
    client: Optional[httpx.AsyncClient] = None,
    stop: Optional[asyncio.Event] = None,
) -> Optional[list[str]]:
    """Return mas_ids on 200, None if cancelled. Retries 404/502/503/network."""
    import os

    base = (cfn_url if cfn_url is not None else os.getenv("CFN_URL", "")).rstrip("/")
    if not base or not ce_id:
        return []

    owns_client = client is None
    if owns_client:
        client = httpx.AsyncClient(timeout=5.0)
    delay = 0.5
    try:
        while stop is None or not stop.is_set():
            try:
                response = await client.get(
                    f"{base}/api/cognition-engine/{ce_id}/multi-agentic-systems",
                )
            except httpx.TransportError as e:
                logger.warning("[MAS] discovery error: %s", e)
            else:
                if response.status_code == 200:
                    raw = response.json().get("mas_ids") or []
                    return [str(item) for item in raw]
                if response.status_code == 400:
                    logger.error("[MAS] discovery rejected ce_id=%s: %s", ce_id, response.text[:200])
                    return []
                if response.status_code not in DISCOVERY_RETRY:
                    logger.warning("[MAS] discovery status=%s", response.status_code)
                else:
                    logger.info("[MAS] discovery retry status=%s ce_id=%s", response.status_code, ce_id)
            if stop is not None and stop.is_set():
                return None
            await asyncio.sleep(delay)
            delay = min(delay * 2, MAX_DELAY)
    finally:
        if owns_client:
            await client.aclose()
    return None


async def sync_associated_mas(ce_id: str, *, cfn_url: Optional[str] = None) -> None:
    stop = _stop
    ids = await list_associated_mas_ids(ce_id, cfn_url=cfn_url, stop=stop)
    if ids is None:
        return
    logger.info("[MAS] initial associations ce_id=%s count=%d", ce_id, len(ids))
    for mas_id in ids:
        if stop is not None and stop.is_set():
            return
        await fetch_mas_details(mas_id, cfn_url=cfn_url, stop=stop)


def start_mas_sync(ce_id: str, *, cfn_url: Optional[str] = None) -> None:
    global _sync_task, _stop
    if not ce_id:
        return
    if _sync_task and not _sync_task.done():
        _sync_task.cancel()
    _stop = asyncio.Event()
    _sync_task = asyncio.create_task(sync_associated_mas(ce_id, cfn_url=cfn_url))
    _track(_sync_task)


async def shutdown_mas_sync() -> None:
    global _sync_task, _stop
    if _stop is not None:
        _stop.set()
    task = _sync_task
    _sync_task = None
    if task is not None:
        task.cancel()
        try:
            await task
        except (asyncio.CancelledError, Exception):
            pass
    pending = list(_pending)
    for task in pending:
        task.cancel()
    if pending:
        await asyncio.gather(*pending, return_exceptions=True)


async def apply_notification(event_type: Optional[str], mas_id: Optional[str]) -> None:
    if not mas_id:
        return
    if event_type == "mas.deleted":
        await drop_mas(mas_id)
        return
    if event_type in ("mas.created", "mas.updated"):
        await fetch_mas_details(mas_id, stop=_stop)
        return
    logger.warning("[MAS] ignoring event_type=%s mas_id=%s", event_type, mas_id)
