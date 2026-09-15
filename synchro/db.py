from __future__ import annotations

import time
from contextlib import contextmanager
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Iterator
from urllib.parse import urlparse

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from psycopg_pool import ConnectionPool

from synchro.config import get_settings

_PLACEHOLDER_MARKERS = ("USER:PASSWORD", "PASSWORD@", "changeme")
# Neon scale-to-zero : le compute peut mettre plusieurs secondes à se réveiller.
CONNECT_TIMEOUT_SEC = 15
PING_TIMEOUT_SEC = 15

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

CREATE TABLE IF NOT EXISTS morpho_rules (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    condition       JSONB NOT NULL,
    actions         JSONB NOT NULL,
    active          BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS morpho_firings (
    id              BIGSERIAL PRIMARY KEY,
    rule_id         TEXT NOT NULL REFERENCES morpho_rules(id) ON DELETE CASCADE,
    draw_date       DATE,
    motif_snapshot  JSONB NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS morpho_firings_draw ON morpho_firings (draw_date DESC);
CREATE INDEX IF NOT EXISTS morpho_firings_rule ON morpho_firings (rule_id);

CREATE TABLE IF NOT EXISTS morpho_embeddings (
    draw_date       DATE PRIMARY KEY,
    vector          DOUBLE PRECISION[] NOT NULL,
    model_id        TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS morpho_captions (
    id              BIGSERIAL PRIMARY KEY,
    draw_date       DATE NOT NULL,
    model_id        TEXT NOT NULL,
    revision        TEXT,
    prompt_id       TEXT NOT NULL,
    caption         TEXT,
    queries         JSONB,
    grounding_score DOUBLE PRECISION,
    image_hash      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (draw_date, model_id, prompt_id)
);
CREATE INDEX IF NOT EXISTS morpho_captions_draw ON morpho_captions (draw_date DESC);

CREATE TABLE IF NOT EXISTS chartisme_labels (
    id              TEXT PRIMARY KEY,
    curve_id        TEXT NOT NULL,
    variable        TEXT NOT NULL,
    n               SMALLINT,
    figure          TEXT NOT NULL,
    custom_label    TEXT,
    from_date       DATE,
    to_date         DATE,
    from_index      INTEGER,
    to_index        INTEGER,
    roles           JSONB NOT NULL DEFAULT '[]'::jsonb,
    window_values   DOUBLE PRECISION[],
    source          TEXT NOT NULL DEFAULT 'user',
    author          TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chartisme_labels_curve ON chartisme_labels (curve_id);
CREATE INDEX IF NOT EXISTS chartisme_labels_figure ON chartisme_labels (figure);

CREATE TABLE IF NOT EXISTS chartisme_runs (
    id              BIGSERIAL PRIMARY KEY,
    reason          TEXT NOT NULL,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at     TIMESTAMPTZ,
    curve_count     INTEGER,
    figure_count    INTEGER,
    draw_count      INTEGER,
    latest_draw     DATE,
    status          TEXT NOT NULL,
    error           TEXT
);
CREATE INDEX IF NOT EXISTS chartisme_runs_started ON chartisme_runs (started_at DESC);

CREATE TABLE IF NOT EXISTS chartisme_figures (
    id              BIGSERIAL PRIMARY KEY,
    run_id          BIGINT REFERENCES chartisme_runs(id) ON DELETE CASCADE,
    curve_id        TEXT NOT NULL,
    variable        TEXT NOT NULL,
    n               SMALLINT,
    figure          TEXT NOT NULL,
    kind            TEXT NOT NULL,
    scale           INTEGER,
    confidence      DOUBLE PRECISION NOT NULL,
    from_date       DATE,
    to_date         DATE,
    from_index      INTEGER,
    to_index        INTEGER,
    confirmed       BOOLEAN,
    fake            BOOLEAN,
    target          DOUBLE PRECISION,
    outcome         TEXT,
    detector        TEXT NOT NULL DEFAULT 'geometric',
    geometry        JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chartisme_figures_curve ON chartisme_figures (curve_id, to_date DESC);
CREATE INDEX IF NOT EXISTS chartisme_figures_figure ON chartisme_figures (figure);
CREATE INDEX IF NOT EXISTS chartisme_figures_run ON chartisme_figures (run_id);

CREATE TABLE IF NOT EXISTS chartisme_rules (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    condition       JSONB NOT NULL,
    actions         JSONB NOT NULL,
    active          BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chartisme_firings (
    id              BIGSERIAL PRIMARY KEY,
    rule_id         TEXT NOT NULL REFERENCES chartisme_rules(id) ON DELETE CASCADE,
    curve_id        TEXT,
    figure          TEXT,
    draw_date       DATE,
    snapshot        JSONB NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chartisme_firings_draw ON chartisme_firings (draw_date DESC);
CREATE INDEX IF NOT EXISTS chartisme_firings_rule ON chartisme_firings (rule_id);

CREATE TABLE IF NOT EXISTS brain_readings (
    id              BIGSERIAL PRIMARY KEY,
    catalog_id      TEXT NOT NULL,
    handle          TEXT NOT NULL,
    lab             TEXT NOT NULL,
    params          JSONB NOT NULL DEFAULT '{}'::jsonb,
    window           JSONB NOT NULL DEFAULT '{}'::jsonb,
    observed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    draw_to         DATE,
    payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
    source          TEXT NOT NULL DEFAULT 'user',
    thread_id       TEXT,
    embedding       DOUBLE PRECISION[],
    embedding_model TEXT
);
CREATE INDEX IF NOT EXISTS brain_readings_handle_time ON brain_readings (handle, observed_at DESC);
CREATE INDEX IF NOT EXISTS brain_readings_lab ON brain_readings (lab, observed_at DESC);

CREATE TABLE IF NOT EXISTS brain_reading_notes (
    id              BIGSERIAL PRIMARY KEY,
    reading_id      BIGINT NOT NULL REFERENCES brain_readings(id) ON DELETE CASCADE,
    author          TEXT NOT NULL DEFAULT 'user',
    body            TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS brain_reading_notes_reading ON brain_reading_notes (reading_id, created_at);
"""

_pool: ConnectionPool | None = None


def _neon_host(url: str | None) -> str | None:
    if not url:
        return None
    try:
        return urlparse(url).hostname
    except Exception:
        return None


def _statement_timeout_sql(timeout_sec: float) -> str:
    """Postgres n'accepte pas de placeholder ($1) dans SET.

    psycopg transforme ``SET … = %s`` en ``SET … = $1``, ce qui casse le test
    Neon (syntax error at or near "$1") — souvent lu comme une erreur de timeout.
    """
    timeout_ms = max(1, int(timeout_sec * 1000))
    return f"SET LOCAL statement_timeout = {timeout_ms}"


def _should_retry_ping(exc: BaseException) -> bool:
    if isinstance(exc, psycopg.OperationalError):
        return True
    text = str(exc).lower()
    return "timed out" in text or "timeout expired" in text or "could not connect" in text


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
                "connect_timeout": CONNECT_TIMEOUT_SEC,
                # PgBouncer (URI -pooler) : pas de prepared statements nommés.
                "prepare_threshold": None,
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


def ping(timeout_sec: float = PING_TIMEOUT_SEC) -> dict[str, Any]:
    """Ping Neon without raising. Used by /api/health and the launcher."""
    url = (get_settings().database_url or "").strip()
    host = _neon_host(url)
    if not database_configured():
        return {
            "ok": False,
            "connected": False,
            "configured": False,
            "host": None,
            "waking": False,
            "error": "DATABASE_URL absent (copiez .env.example → .env et collez l'URI Neon).",
        }
    started = time.perf_counter()
    last_error: BaseException | None = None
    for attempt in range(2):
        try:
            with connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(_statement_timeout_sql(timeout_sec))
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
            last_error = exc
            if attempt == 0 and _should_retry_ping(exc):
                reset_pool()
                continue
            break
    latency_ms = round((time.perf_counter() - started) * 1000)
    return {
        "ok": False,
        "connected": False,
        "configured": True,
        "latency_ms": latency_ms,
        "host": host,
        "waking": False,
        "error": str(last_error) if last_error else "échec",
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


def count_draws(year: int | None = None) -> int:
    sql = "SELECT COUNT(*) AS n FROM draws"
    params: dict[str, Any] = {}
    if year is not None:
        sql += " WHERE EXTRACT(YEAR FROM draw_date) = %(year)s"
        params["year"] = year
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            return int(cur.fetchone()["n"])


def latest_draw() -> dict[str, Any] | None:
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM draws ORDER BY draw_date DESC LIMIT 1")
            row = cur.fetchone()
            return dict(row) if row else None


def list_draws(
    limit: int = 50,
    offset: int = 0,
    query: str | None = None,
    year: int | None = None,
) -> list[dict[str, Any]]:
    sql = "SELECT * FROM draws"
    params: dict[str, Any] = {"limit": limit, "offset": offset}
    clauses: list[str] = []
    if year is not None:
        clauses.append("EXTRACT(YEAR FROM draw_date) = %(year)s")
        params["year"] = year
    if query:
        clauses.append(
            """(
                CAST(draw_date AS TEXT) ILIKE %(q)s
                OR COALESCE(draw_code, '') ILIKE %(q)s
                OR COALESCE(weekday, '') ILIKE %(q)s
                OR array_to_string(numbers, ',') ILIKE %(q)s
                OR array_to_string(stars, ',') ILIKE %(q)s
            )"""
        )
        params["q"] = f"%{query.strip()}%"
    if clauses:
        sql += " WHERE " + " AND ".join(clauses)
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


def last_sync(*, ok_only: bool = False) -> dict[str, Any] | None:
    sql = "SELECT * FROM sync_log"
    params: dict[str, Any] = {}
    if ok_only:
        sql += " WHERE status = %(status)s"
        params["status"] = "ok"
    sql += " ORDER BY COALESCE(finished_at, started_at) DESC LIMIT 1"
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
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


def list_morpho_rules() -> list[dict[str, Any]]:
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM morpho_rules ORDER BY updated_at DESC")
            return [dict(r) for r in cur.fetchall()]


def upsert_morpho_rule(rule: dict[str, Any]) -> dict[str, Any]:
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO morpho_rules (id, name, condition, actions, active)
                VALUES (%(id)s, %(name)s, %(condition)s, %(actions)s, %(active)s)
                ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name,
                    condition = EXCLUDED.condition,
                    actions = EXCLUDED.actions,
                    active = EXCLUDED.active,
                    updated_at = now()
                RETURNING *
                """,
                {
                    "id": rule["id"],
                    "name": rule["name"],
                    "condition": Jsonb(rule["condition"]),
                    "actions": Jsonb(rule["actions"]),
                    "active": rule.get("active", True),
                },
            )
            row = dict(cur.fetchone())
        conn.commit()
        return row


def delete_morpho_rule(rule_id: str) -> bool:
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM morpho_rules WHERE id = %s", (rule_id,))
            deleted = cur.rowcount > 0
        conn.commit()
        return deleted


def insert_morpho_firing(rule_id: str, draw_date: str | None, snapshot: dict[str, Any]) -> dict[str, Any]:
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO morpho_firings (rule_id, draw_date, motif_snapshot)
                VALUES (%s, %s, %s)
                RETURNING *
                """,
                (rule_id, draw_date, Jsonb(snapshot)),
            )
            row = dict(cur.fetchone())
        conn.commit()
        return row


def list_morpho_firings(limit: int = 40) -> list[dict[str, Any]]:
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT f.*, r.name AS rule_name
                  FROM morpho_firings f
             LEFT JOIN morpho_rules r ON r.id = f.rule_id
              ORDER BY f.created_at DESC
                 LIMIT %s
                """,
                (limit,),
            )
            return [dict(r) for r in cur.fetchall()]


def upsert_morpho_caption(row: dict[str, Any]) -> dict[str, Any]:
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO morpho_captions (
                    draw_date, model_id, revision, prompt_id, caption,
                    queries, grounding_score, image_hash
                ) VALUES (
                    %(draw_date)s, %(model_id)s, %(revision)s, %(prompt_id)s, %(caption)s,
                    %(queries)s, %(grounding_score)s, %(image_hash)s
                )
                ON CONFLICT (draw_date, model_id, prompt_id) DO UPDATE SET
                    caption = EXCLUDED.caption,
                    queries = EXCLUDED.queries,
                    grounding_score = EXCLUDED.grounding_score,
                    image_hash = EXCLUDED.image_hash
                RETURNING *
                """,
                {
                    **row,
                    "queries": Jsonb(row.get("queries") or {}),
                },
            )
            saved = dict(cur.fetchone())
        conn.commit()
        return saved


def get_morpho_caption(draw_date: str) -> dict[str, Any] | None:
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT * FROM morpho_captions
                 WHERE draw_date = %s
              ORDER BY created_at DESC
                 LIMIT 1
                """,
                (draw_date,),
            )
            row = cur.fetchone()
            return dict(row) if row else None



# --- Chartisme ---------------------------------------------------------------


def list_chartisme_labels(
    curve_id: str | None = None,
    figure: str | None = None,
    limit: int = 2000,
) -> list[dict[str, Any]]:
    sql = "SELECT * FROM chartisme_labels"
    where: list[str] = []
    params: dict[str, Any] = {"limit": limit}
    if curve_id:
        where.append("curve_id = %(curve_id)s")
        params["curve_id"] = curve_id
    if figure:
        where.append("figure = %(figure)s")
        params["figure"] = figure
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY updated_at DESC LIMIT %(limit)s"
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            return [dict(r) for r in cur.fetchall()]


def upsert_chartisme_label(label: dict[str, Any]) -> dict[str, Any]:
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO chartisme_labels (
                    id, curve_id, variable, n, figure, custom_label,
                    from_date, to_date, from_index, to_index, roles, window_values,
                    source, author
                ) VALUES (
                    %(id)s, %(curve_id)s, %(variable)s, %(n)s, %(figure)s, %(custom_label)s,
                    %(from_date)s, %(to_date)s, %(from_index)s, %(to_index)s, %(roles)s,
                    %(window_values)s, %(source)s, %(author)s
                )
                ON CONFLICT (id) DO UPDATE SET
                    curve_id = EXCLUDED.curve_id,
                    variable = EXCLUDED.variable,
                    n = EXCLUDED.n,
                    figure = EXCLUDED.figure,
                    custom_label = EXCLUDED.custom_label,
                    from_date = EXCLUDED.from_date,
                    to_date = EXCLUDED.to_date,
                    from_index = EXCLUDED.from_index,
                    to_index = EXCLUDED.to_index,
                    roles = EXCLUDED.roles,
                    window_values = EXCLUDED.window_values,
                    source = EXCLUDED.source,
                    author = EXCLUDED.author,
                    updated_at = now()
                RETURNING *
                """,
                {
                    "id": label["id"],
                    "curve_id": label["curve_id"],
                    "variable": label.get("variable") or label["curve_id"].split(":")[0],
                    "n": label.get("n"),
                    "figure": label["figure"],
                    "custom_label": label.get("custom_label"),
                    "from_date": label.get("from_date"),
                    "to_date": label.get("to_date"),
                    "from_index": label.get("from_index"),
                    "to_index": label.get("to_index"),
                    "roles": Jsonb(label.get("roles") or []),
                    "window_values": [float(v) for v in (label.get("values") or [])],
                    "source": label.get("source") or "user",
                    "author": label.get("author"),
                },
            )
            row = dict(cur.fetchone())
        conn.commit()
        return row


def delete_chartisme_label(label_id: str) -> bool:
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM chartisme_labels WHERE id = %s", (label_id,))
            deleted = cur.rowcount > 0
        conn.commit()
        return deleted


def count_chartisme_labels() -> int:
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) AS n FROM chartisme_labels")
            return int(cur.fetchone()["n"])


def start_chartisme_run(reason: str) -> int:
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO chartisme_runs (reason, status) VALUES (%s, 'running') RETURNING id",
                (reason,),
            )
            run_id = int(cur.fetchone()["id"])
        conn.commit()
        return run_id


def finish_chartisme_run(
    run_id: int,
    status: str,
    *,
    curve_count: int | None = None,
    figure_count: int | None = None,
    draw_count: int | None = None,
    latest_draw: str | None = None,
    error: str | None = None,
) -> None:
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE chartisme_runs
                   SET status = %(status)s,
                       finished_at = now(),
                       curve_count = %(curve_count)s,
                       figure_count = %(figure_count)s,
                       draw_count = %(draw_count)s,
                       latest_draw = %(latest_draw)s,
                       error = %(error)s
                 WHERE id = %(run_id)s
                """,
                {
                    "run_id": run_id,
                    "status": status,
                    "curve_count": curve_count,
                    "figure_count": figure_count,
                    "draw_count": draw_count,
                    "latest_draw": latest_draw,
                    "error": error,
                },
            )
        conn.commit()


def last_chartisme_run() -> dict[str, Any] | None:
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM chartisme_runs ORDER BY started_at DESC LIMIT 1")
            row = cur.fetchone()
            return dict(row) if row else None


def replace_chartisme_figures(run_id: int, figures: list[dict[str, Any]]) -> int:
    """Remplace l'inventaire : un cycle décrit l'archive entière, pas un delta."""
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM chartisme_figures")
            written = 0
            for row in figures:
                breakout = row.get("breakout") or {}
                cur.execute(
                    """
                    INSERT INTO chartisme_figures (
                        run_id, curve_id, variable, n, figure, kind, scale, confidence,
                        from_date, to_date, from_index, to_index, confirmed, fake,
                        target, outcome, detector, geometry
                    ) VALUES (
                        %(run_id)s, %(curve_id)s, %(variable)s, %(n)s, %(figure)s, %(kind)s,
                        %(scale)s, %(confidence)s, %(from_date)s, %(to_date)s,
                        %(from_index)s, %(to_index)s, %(confirmed)s, %(fake)s,
                        %(target)s, %(outcome)s, %(detector)s, %(geometry)s
                    )
                    """,
                    {
                        "run_id": run_id,
                        "curve_id": row.get("curve_id"),
                        "variable": row.get("variable") or "",
                        "n": row.get("n"),
                        "figure": row["figure"],
                        "kind": row.get("kind") or "",
                        "scale": row.get("scale"),
                        "confidence": float(row.get("confidence") or 0.0),
                        "from_date": row.get("from"),
                        "to_date": row.get("to"),
                        "from_index": row.get("from_index"),
                        "to_index": row.get("to_index"),
                        "confirmed": breakout.get("confirmed"),
                        "fake": breakout.get("fake"),
                        "target": (row.get("target") or {}).get("value"),
                        "outcome": (row.get("outcome") or {}).get("status"),
                        "detector": row.get("detector") or "geometric",
                        "geometry": Jsonb(
                            {
                                "pivots": row.get("pivots") or [],
                                "guides": row.get("guides") or [],
                                "breakout": breakout or None,
                                "alternatives": row.get("alternatives") or [],
                            }
                        ),
                    },
                )
                written += 1
        conn.commit()
        return written


def list_chartisme_figures(
    curve_id: str | None = None,
    figure: str | None = None,
    limit: int = 200,
) -> list[dict[str, Any]]:
    sql = "SELECT * FROM chartisme_figures"
    where: list[str] = []
    params: dict[str, Any] = {"limit": limit}
    if curve_id:
        where.append("curve_id = %(curve_id)s")
        params["curve_id"] = curve_id
    if figure:
        where.append("figure = %(figure)s")
        params["figure"] = figure
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY to_date DESC NULLS LAST, confidence DESC LIMIT %(limit)s"
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            return [dict(r) for r in cur.fetchall()]


def list_chartisme_rules() -> list[dict[str, Any]]:
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM chartisme_rules ORDER BY updated_at DESC")
            return [dict(r) for r in cur.fetchall()]


def upsert_chartisme_rule(rule: dict[str, Any]) -> dict[str, Any]:
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO chartisme_rules (id, name, condition, actions, active)
                VALUES (%(id)s, %(name)s, %(condition)s, %(actions)s, %(active)s)
                ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name,
                    condition = EXCLUDED.condition,
                    actions = EXCLUDED.actions,
                    active = EXCLUDED.active,
                    updated_at = now()
                RETURNING *
                """,
                {
                    "id": rule["id"],
                    "name": rule["name"],
                    "condition": Jsonb(rule["condition"]),
                    "actions": Jsonb(rule["actions"]),
                    "active": bool(rule.get("active", True)),
                },
            )
            row = dict(cur.fetchone())
        conn.commit()
        return row


def delete_chartisme_rule(rule_id: str) -> bool:
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM chartisme_rules WHERE id = %s", (rule_id,))
            deleted = cur.rowcount > 0
        conn.commit()
        return deleted


def insert_chartisme_firing(
    rule_id: str,
    *,
    curve_id: str | None,
    figure: str | None,
    draw_date: str | None,
    snapshot: dict[str, Any],
) -> dict[str, Any]:
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO chartisme_firings (rule_id, curve_id, figure, draw_date, snapshot)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING *
                """,
                (rule_id, curve_id, figure, draw_date, Jsonb(snapshot)),
            )
            row = dict(cur.fetchone())
        conn.commit()
        return row


def list_chartisme_firings(limit: int = 60) -> list[dict[str, Any]]:
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT f.*, r.name AS rule_name
                  FROM chartisme_firings f
             LEFT JOIN chartisme_rules r ON r.id = f.rule_id
              ORDER BY f.created_at DESC
                 LIMIT %s
                """,
                (limit,),
            )
            return [dict(r) for r in cur.fetchall()]


def list_brain_readings(
    handle: str | None = None,
    lab: str | None = None,
    limit: int = 80,
) -> list[dict[str, Any]]:
    sql = "SELECT * FROM brain_readings"
    clauses: list[str] = []
    params: dict[str, Any] = {"limit": limit}
    if handle:
        clauses.append("handle = %(handle)s")
        params["handle"] = handle.lstrip("@")
    if lab:
        clauses.append("lab = %(lab)s")
        params["lab"] = lab
    if clauses:
        sql += " WHERE " + " AND ".join(clauses)
    sql += " ORDER BY observed_at DESC LIMIT %(limit)s"
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            rows = [dict(r) for r in cur.fetchall()]
            ids = [row["id"] for row in rows]
            notes: dict[int, list[dict[str, Any]]] = {row_id: [] for row_id in ids}
            if ids:
                cur.execute(
                    """
                    SELECT * FROM brain_reading_notes
                     WHERE reading_id = ANY(%s)
                     ORDER BY created_at ASC
                    """,
                    (ids,),
                )
                for note in cur.fetchall():
                    notes.setdefault(note["reading_id"], []).append(dict(note))
            for row in rows:
                row["notes"] = notes.get(row["id"], [])
            return rows


def insert_brain_reading(payload: dict[str, Any]) -> dict[str, Any]:
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO brain_readings (
                    catalog_id, handle, lab, params, window, draw_to, payload,
                    source, thread_id, embedding, embedding_model
                ) VALUES (
                    %(catalog_id)s, %(handle)s, %(lab)s, %(params)s, %(window)s,
                    %(draw_to)s, %(payload)s, %(source)s, %(thread_id)s,
                    %(embedding)s, %(embedding_model)s
                )
                RETURNING *
                """,
                {
                    "catalog_id": payload["catalog_id"],
                    "handle": str(payload["handle"]).lstrip("@"),
                    "lab": payload["lab"],
                    "params": Jsonb(payload.get("params") or {}),
                    "window": Jsonb(payload.get("window") or {}),
                    "draw_to": payload.get("draw_to"),
                    "payload": Jsonb(payload.get("payload") or {}),
                    "source": payload.get("source") or "user",
                    "thread_id": payload.get("thread_id"),
                    "embedding": payload.get("embedding"),
                    "embedding_model": payload.get("embedding_model"),
                },
            )
            row = dict(cur.fetchone())
            notes: list[dict[str, Any]] = []
            comment = (payload.get("comment") or "").strip()
            if comment:
                cur.execute(
                    """
                    INSERT INTO brain_reading_notes (reading_id, author, body)
                    VALUES (%s, %s, %s)
                    RETURNING *
                    """,
                    (row["id"], "user", comment),
                )
                notes.append(dict(cur.fetchone()))
        conn.commit()
    row["notes"] = notes
    return row


def insert_brain_note(reading_id: int, author: str, body: str) -> dict[str, Any]:
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM brain_readings WHERE id = %s", (reading_id,))
            if not cur.fetchone():
                raise KeyError(reading_id)
            cur.execute(
                """
                INSERT INTO brain_reading_notes (reading_id, author, body)
                VALUES (%s, %s, %s)
                RETURNING *
                """,
                (reading_id, author, body),
            )
            row = dict(cur.fetchone())
        conn.commit()
        return row


def readings_with_embeddings(model: str | None = None) -> list[dict[str, Any]]:
    sql = "SELECT * FROM brain_readings WHERE embedding IS NOT NULL"
    params: dict[str, Any] = {}
    if model:
        sql += " AND embedding_model = %(model)s"
        params["model"] = model
    sql += " ORDER BY observed_at DESC LIMIT 400"
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            return [dict(r) for r in cur.fetchall()]
