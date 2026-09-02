"""Import FDJ → Neon : historique complet, archive récente, ou rattrapage auto."""

from __future__ import annotations

import threading
from datetime import date, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from synchro import db
from synchro.fdj import Draw, fetch_all_draws, fetch_latest_draws

PARIS = ZoneInfo("Europe/Paris")
DRAW_WEEKDAYS = (1, 4)  # mardi, vendredi
PUBLISH_TIME = time(21, 45)

_LOCK = threading.Lock()


def _as_date(value: Any) -> date | None:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str) and value:
        return date.fromisoformat(value[:10])
    return None


def expected_last_draw_date(now: datetime | None = None) -> date:
    """Dernier mardi/vendredi dont l'archive FDJ est censée être publiée (~21h45 Paris)."""
    if now is None:
        current = datetime.now(PARIS)
    elif now.tzinfo is None:
        current = now.replace(tzinfo=PARIS)
    else:
        current = now.astimezone(PARIS)

    today = current.date()
    published_today = current.weekday() in DRAW_WEEKDAYS and (
        current.hour,
        current.minute,
    ) >= (PUBLISH_TIME.hour, PUBLISH_TIME.minute)
    if published_today:
        return today

    cursor = today - timedelta(days=1)
    while cursor.weekday() not in DRAW_WEEKDAYS:
        cursor -= timedelta(days=1)
    return cursor


def freshness(*, latest: dict[str, Any] | None = None) -> dict[str, Any]:
    expected = expected_last_draw_date()
    row = latest if latest is not None else db.latest_draw()
    latest_date = _as_date((row or {}).get("draw_date")) if row else None
    return {
        "expected_draw_date": expected.isoformat(),
        "stale": latest_date is None or latest_date < expected,
        "latest_date": latest_date.isoformat() if latest_date else None,
    }


def _result(
    *,
    fetched: int = 0,
    upserted: int = 0,
    skipped: bool = False,
    latest_only: bool = False,
    latest: dict[str, Any] | None = None,
) -> dict[str, Any]:
    row = latest if latest is not None else db.latest_draw()
    last_ok = db.last_sync(ok_only=True)
    payload = {
        "ok": True,
        "skipped": skipped,
        "latest_only": latest_only,
        "fetched": fetched,
        "upserted": upserted,
        "latest": db.serialize_draw(row) if row else None,
        "last_sync": db.serialize_row(last_ok) if last_ok else None,
    }
    payload.update(freshness(latest=row))
    return payload


def _run_sync_unlocked(*, latest_only: bool) -> dict[str, Any]:
    db.init_db()
    sync_id = db.log_sync_start()
    try:
        draws: list[Draw] = fetch_latest_draws() if latest_only else fetch_all_draws()
        upserted = db.upsert_draws([item.as_row() for item in draws])
        db.log_sync_end(sync_id, "ok", fetched=len(draws), upserted=upserted)
        return _result(
            fetched=len(draws),
            upserted=upserted,
            skipped=False,
            latest_only=latest_only,
        )
    except Exception as exc:
        db.log_sync_end(sync_id, "error", error=str(exc))
        raise


def sync_draws(*, latest_only: bool = False) -> dict[str, Any]:
    with _LOCK:
        return _run_sync_unlocked(latest_only=latest_only)


def ensure_draws() -> dict[str, Any]:
    """Rattrape Neon si le dernier tirage manque ; no-op si déjà à jour."""
    with _LOCK:
        db.init_db()
        count = db.count_draws()
        info = freshness()
        if count > 0 and not info["stale"]:
            return _result(skipped=True, latest_only=False)
        return _run_sync_unlocked(latest_only=count > 0)


def format_ensure_messages(data: dict[str, Any]) -> list[tuple[str, str]]:
    """Lignes (ok|warn, texte) pour ./launch après POST /api/sync/ensure."""
    if not data.get("ok"):
        detail = data.get("detail") if "detail" in data else data.get("error")
        if isinstance(detail, list):
            detail = "; ".join(str(item) for item in detail)
        text = str(detail or "échec").replace("\n", " ")[:160]
        return [("warn", text)]
    latest = (data.get("latest") or {}).get("draw_date") or "?"
    upserted = data.get("upserted") or 0
    lines: list[tuple[str, str]] = []
    if data.get("skipped"):
        lines.append(("ok", f"Tirages déjà à jour (dernier {latest})"))
    elif data.get("latest_only"):
        lines.append(("ok", f"Archive récente — {upserted} lignes, dernier {latest}"))
    else:
        lines.append(("ok", f"Historique importé — {upserted} lignes, dernier {latest}"))
    if data.get("stale"):
        expected = data.get("expected_draw_date") or "?"
        lines.append(
            ("warn", f"Neon encore en retard (attendu {expected}, dernier {latest})")
        )
    return lines
