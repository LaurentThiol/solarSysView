from __future__ import annotations

import time
from contextlib import contextmanager
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Iterator
from urllib.parse import urlparse

from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from psycopg_pool import ConnectionPool

from synchro.config import get_settings

_PLACEHOLDER_MARKERS = ("USER:PASSWORD", "PASSWORD@", "changeme")

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS draws (
    id              BIGSERIAL PRIMARY KEY,
    draw_date       DATE NOT NULL UNIQUE,
    draw_code       TEXT,
    weekday         TEXT,
    numbers         SMALLINT[] NOT NULL,
    stars           SMALLINT[] NOT NULL,
    star_pool       SMALLINT NOT NULL,
    winners_rank1_fr INTEGER,
    winners_rank1_eu INTEGER,
    prize_rank1     NUMERIC,
    my_million      TEXT,
    source          TEXT NOT NULL DEFAULT 'fdj',
    imported_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    raw             JSONB
);

CREATE INDEX IF NOT EXISTS draws_date_desc ON draws (draw_date DESC);

CREATE TABLE IF NOT EXISTS grids (
    id          BIGSERIAL PRIMARY KEY,
    label       TEXT NOT NULL DEFAULT 'Grille',
    numbers     SMALLINT[] NOT NULL,
    stars       SMALLINT[] NOT NULL,
    active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sync_log (
    id              BIGSERIAL PRIMARY KEY,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at     TIMESTAMPTZ,
    draws_fetched   INTEGER,
    draws_upserted  INTEGER,
    status          TEXT NOT NULL,
    error           TEXT
);
"""

_pool: ConnectionPool | None = None


def _neon_host(url: str | None) -> str | None:
    if not url:
        return None
    try:
        return urlparse(url).hostname
    except Exception:
        return None


def database_configured() -> bool:
    url = (get_settings().database_url or "").strip()
    if not url:
        return False
    if any(marker in url for marker in _PLACEHOLDER_MARKERS):
        return False
    return url.startswith("postgres")


def get_pool() -> ConnectionPool:
    global _pool
    if _pool is None or _pool.closed:
        if not database_configured():
            raise RuntimeError(
                "DATABASE_URL manquant ou placeholder. "
                "Copiez .env.example vers .env et collez l'URI Neon pooled."
            )
        url = (get_settings().database_url or "").strip()
        _pool = ConnectionPool(
            conninfo=url,
            min_size=1,
            max_size=8,
            kwargs={
                "row_factory": dict_row,
                "autocommit": False,
                "connect_timeout": 5,
            },
            open=True,
        )
    return _pool


def reset_pool() -> None:
    global _pool
    if _pool is None:
        return
    try:
        _pool.close()
    except Exception:
        pass
    _pool = None


def ping(timeout_sec: float = 5.0) -> dict[str, Any]:
    """Ping Neon without raising. Used by /api/health and the launcher."""
    url = (get_settings().database_url or "").strip()
    host = _neon_host(url)
    if not database_configured():
        return {
            "ok": False,
            "connected": False,
            "configured": False,
            "host": host,
            "waking": False,
            "error": "DATABASE_URL absent (copiez .env.example → .env et collez l'URI Neon).",
        }
    started = time.perf_counter()
    try:
        with connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SET statement_timeout = %s", (int(timeout_sec * 1000),))
                cur.execute("SELECT 1 AS ok")
                cur.fetchone()
        latency_ms = round((time.perf_counter() - started) * 1000)
        return {
            "ok": True,
            "connected": True,
            "configured": True,
            "latency_ms": latency_ms,
            "host": host,
            "waking": latency_ms >= 2500,
        }
    except Exception as exc:
        latency_ms = round((time.perf_counter() - started) * 1000)
        return {
            "ok": False,
            "connected": False,
            "configured": True,
            "latency_ms": latency_ms,
            "host": host,
            "waking": False,
            "error": str(exc),
        }


@contextmanager
def connection() -> Iterator[Any]:
    with get_pool().connection() as conn:
        yield conn


def init_db() -> None:
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(SCHEMA_SQL)
        conn.commit()


def _json_ready(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: _json_ready(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_json_ready(v) for v in value]
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    return value


def upsert_draws(rows: list[dict[str, Any]]) -> int:
    if not rows:
        return 0
    sql = """
        INSERT INTO draws (
            draw_date, draw_code, weekday, numbers, stars, star_pool,
            winners_rank1_fr, winners_rank1_eu, prize_rank1, my_million,
            source, raw
        ) VALUES (
            %(draw_date)s, %(draw_code)s, %(weekday)s, %(numbers)s, %(stars)s,
            %(star_pool)s, %(winners_rank1_fr)s, %(winners_rank1_eu)s,
            %(prize_rank1)s, %(my_million)s, %(source)s, %(raw)s
        )
        ON CONFLICT (draw_date) DO UPDATE SET
            draw_code = EXCLUDED.draw_code,
            weekday = EXCLUDED.weekday,
            numbers = EXCLUDED.numbers,
            stars = EXCLUDED.stars,
            star_pool = EXCLUDED.star_pool,
            winners_rank1_fr = EXCLUDED.winners_rank1_fr,
            winners_rank1_eu = EXCLUDED.winners_rank1_eu,
            prize_rank1 = EXCLUDED.prize_rank1,
            my_million = EXCLUDED.my_million,
            source = EXCLUDED.source,
            raw = EXCLUDED.raw,
            imported_at = now()
    """
    count = 0
    with connection() as conn:
        with conn.cursor() as cur:
            for row in rows:
                payload = dict(row)
                payload["raw"] = Jsonb(_json_ready(payload.get("raw") or {}))
                cur.execute(sql, payload)
                count += 1
        conn.commit()
    return count


def count_draws() -> int:
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) AS n FROM draws")
            return int(cur.fetchone()["n"])


def latest_draw() -> dict[str, Any] | None:
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM draws ORDER BY draw_date DESC LIMIT 1")
            row = cur.fetchone()
            return dict(row) if row else None


def list_draws(limit: int = 50, offset: int = 0, query: str | None = None) -> list[dict[str, Any]]:
    sql = "SELECT * FROM draws"
    params: dict[str, Any] = {"limit": limit, "offset": offset}
    if query:
        sql += """
            WHERE CAST(draw_date AS TEXT) ILIKE %(q)s
               OR COALESCE(draw_code, '') ILIKE %(q)s
               OR COALESCE(weekday, '') ILIKE %(q)s
               OR array_to_string(numbers, ',') ILIKE %(q)s
               OR array_to_string(stars, ',') ILIKE %(q)s
        """
        params["q"] = f"%{query.strip()}%"
    sql += " ORDER BY draw_date DESC LIMIT %(limit)s OFFSET %(offset)s"
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            return [dict(r) for r in cur.fetchall()]


def all_draws(era: str = "current") -> list[dict[str, Any]]:
    sql = "SELECT * FROM draws"
    if era == "current":
        sql += " WHERE draw_date >= DATE '2016-09-27'"
    sql += " ORDER BY draw_date ASC"
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql)
            return [dict(r) for r in cur.fetchall()]


def list_grids() -> list[dict[str, Any]]:
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM grids WHERE active = TRUE ORDER BY created_at DESC"
            )
            return [dict(r) for r in cur.fetchall()]


def insert_grid(label: str, numbers: list[int], stars: list[int]) -> dict[str, Any]:
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO grids (label, numbers, stars)
                VALUES (%s, %s, %s)
                RETURNING *
                """,
                (label, numbers, stars),
            )
            row = dict(cur.fetchone())
        conn.commit()
        return row


def delete_grid(grid_id: int) -> bool:
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE grids SET active = FALSE WHERE id = %s AND active = TRUE",
                (grid_id,),
            )
            updated = cur.rowcount > 0
        conn.commit()
        return updated


def log_sync_start() -> int:
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO sync_log (status) VALUES ('running') RETURNING id"
            )
            sync_id = int(cur.fetchone()["id"])
        conn.commit()
        return sync_id


def log_sync_end(
    sync_id: int,
    status: str,
    fetched: int = 0,
    upserted: int = 0,
    error: str | None = None,
) -> None:
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE sync_log
                   SET finished_at = now(),
                       status = %s,
                       draws_fetched = %s,
                       draws_upserted = %s,
                       error = %s
                 WHERE id = %s
                """,
                (status, fetched, upserted, error, sync_id),
            )
        conn.commit()


def last_sync() -> dict[str, Any] | None:
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM sync_log ORDER BY started_at DESC LIMIT 1")
            row = cur.fetchone()
            return dict(row) if row else None


def serialize_row(row: dict[str, Any], drop: tuple[str, ...] = ("raw",)) -> dict[str, Any]:
    out = dict(row)
    for key in drop:
        out.pop(key, None)
    for key, value in list(out.items()):
        if isinstance(value, (date, datetime)):
            out[key] = value.isoformat()
        elif isinstance(value, Decimal):
            out[key] = float(value)
        elif isinstance(value, memoryview):
            out[key] = bytes(value).decode()
    return out


def serialize_draw(row: dict[str, Any]) -> dict[str, Any]:
    return serialize_row(row)
