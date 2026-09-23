from __future__ import annotations

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from synchro.app import create_app


@pytest.fixture(autouse=True)
def _no_neon_on_startup() -> None:
    with patch("synchro.db.database_configured", return_value=False):
        yield


def _client() -> TestClient:
    return TestClient(create_app())


def test_alive_answers_while_init_db_is_still_running() -> None:
    import threading

    started = threading.Event()
    release = threading.Event()

    def slow_init() -> None:
        started.set()
        release.wait(2)

    with (
        patch("synchro.db.database_configured", return_value=True),
        patch("synchro.db.init_db", side_effect=slow_init),
    ):
        with _client() as client:
            assert started.wait(1)
            response = client.get("/api/alive")
            release.set()
    assert response.status_code == 200
    assert response.json()["ok"] is True


def test_alive_does_not_need_database() -> None:
    with _client() as client:
        response = client.get("/api/alive")
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["service"] == "synchro"


def test_health_reports_neon_when_unconfigured() -> None:
    with _client() as client:
        response = client.get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert body["alive"] is True
    assert body["ok"] is False
    assert body["neon"]["configured"] is False
    assert body["draws"] is None


def test_health_ok_includes_draws() -> None:
    neon = {
        "ok": True,
        "connected": True,
        "configured": True,
        "latency_ms": 12,
        "host": "ep.neon.tech",
        "waking": False,
    }
    with patch(
        "synchro.db.health_details",
        return_value={
            "neon": neon,
            "draws": 1976,
            "latest": None,
            "last_sync": None,
        },
    ):
        with _client() as client:
            response = client.get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["draws"] == 1976
    assert body["neon"]["latency_ms"] == 12
    assert body["stale"] is True
    assert body["expected_draw_date"]


def test_shutdown_localhost_schedules_stop(tmp_path) -> None:
    class Immediate:
        def __init__(self, target=None, daemon=None, **_kwargs):
            self.target = target

        def start(self) -> None:
            if self.target:
                self.target()

    with (
        patch.dict("os.environ", {"SYNCHRO_RUN_DIR": str(tmp_path)}),
        patch("synchro.app.threading.Thread", side_effect=lambda **kw: Immediate(**kw)),
        patch("synchro.app.os.kill") as kill,
        patch("synchro.app.time.sleep"),
    ):
        with _client() as client:
            response = client.post("/api/shutdown")
        assert response.status_code == 200
        assert response.json() == {"ok": True}
        assert kill.called
        assert (tmp_path / "stopped").is_file()


def test_shutdown_rejects_remote_host() -> None:
    with TestClient(create_app(), client=("8.8.8.8", 1234)) as client:
        response = client.post("/api/shutdown")
    assert response.status_code == 403
    assert "localhost" in response.json()["detail"]


def test_shutdown_marks_stopped_and_signals_launcher_pids(tmp_path) -> None:
    run_dir = tmp_path
    (run_dir / "frontend.pid").write_text("4242\n", encoding="utf-8")
    (run_dir / "backend.pid").write_text("4343\n", encoding="utf-8")

    class Immediate:
        def __init__(self, target=None, daemon=None, **_kwargs):
            self.target = target

        def start(self) -> None:
            if self.target:
                self.target()

    with (
        patch.dict("os.environ", {"SYNCHRO_RUN_DIR": str(run_dir)}),
        patch("synchro.app.threading.Thread", side_effect=lambda **kw: Immediate(**kw)),
        patch("synchro.app.os.kill") as kill,
        patch("synchro.app.time.sleep"),
    ):
        with _client() as client:
            response = client.post("/api/shutdown")
    assert response.status_code == 200
    assert (run_dir / "stopped").is_file()
    signaled = {call.args[0] for call in kill.call_args_list}
    assert {4242, 4343}.issubset(signaled)
    for call in kill.call_args_list:
        assert call.args[1] == __import__("signal").SIGTERM


def test_neon_host_from_url() -> None:
    from synchro.db import _neon_host

    assert (
        _neon_host("postgresql://u:p@ep-x.eu-central-1.aws.neon.tech/neondb")
        == "ep-x.eu-central-1.aws.neon.tech"
    )
    assert _neon_host(None) is None


def test_statement_timeout_sql_is_literal_integer() -> None:
    from synchro.db import _statement_timeout_sql

    sql = _statement_timeout_sql(5)
    assert sql == "SET LOCAL statement_timeout = 5000"
    assert "$1" not in sql
    assert "%s" not in sql
    assert _statement_timeout_sql(0.4) == "SET LOCAL statement_timeout = 400"
    assert _statement_timeout_sql(0) == "SET LOCAL statement_timeout = 1"


def test_ping_does_not_bind_statement_timeout() -> None:
    from contextlib import contextmanager

    from synchro import db

    executed: list[tuple[str, object]] = []

    class FakeCursor:
        _sql = ""

        def __enter__(self) -> FakeCursor:
            return self

        def __exit__(self, *args: object) -> None:
            return None

        def execute(self, sql: str, params: object = None) -> None:
            executed.append((sql, params))
            self._sql = sql

        def fetchone(self) -> dict[str, object] | None:
            sql = self._sql.lower()
            if "count(*)" in sql:
                return {"n": 0}
            if "from draws" in sql or "from sync_log" in sql:
                return None
            return {"ok": 1}

    class FakeConn:
        def cursor(self) -> FakeCursor:
            return FakeCursor()

    @contextmanager
    def fake_connection(*, timeout: float | None = None):
        yield FakeConn()

    with (
        patch("synchro.db.database_configured", return_value=True),
        patch("synchro.db.connection", fake_connection),
        patch(
            "synchro.db.get_settings",
            return_value=type(
                "S",
                (),
                {"database_url": "postgresql://u:p@ep-x.neon.tech/neondb"},
            )(),
        ),
    ):
        result = db.ping(timeout_sec=5)

    assert result["ok"] is True
    assert executed[0] == ("SET LOCAL statement_timeout = 5000", None)
    assert executed[1][0] == "SELECT 1 AS ok"
    assert any("COUNT(*)" in sql for sql, _ in executed)


def test_should_not_retry_set_placeholder_syntax_error() -> None:
    from synchro.db import _should_retry_ping

    err = Exception(
        'syntax error at or near "$1" LINE 1: SET statement_timeout = $1'
    )
    assert _should_retry_ping(err) is False


def test_brain_readings_window_column_is_quoted() -> None:
    import re
    from pathlib import Path

    from synchro import db as db_mod

    assert re.search(r'"window"\s+JSONB', db_mod.SCHEMA_SQL)
    assert not re.search(r"(?m)^\s+window\s+JSONB", db_mod.SCHEMA_SQL)
    source = Path(db_mod.__file__).read_text(encoding="utf-8")
    assert 'params, "window", draw_to' in source


def test_reload_env_rereads_settings() -> None:
    with _client() as client:
        response = client.post("/api/reload-env")
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["neon"]["configured"] is False
    assert body["neon"]["connected"] is False
    assert body["neon"].get("host") in (None, "")


def test_sync_ensure_endpoint_skips_when_fresh() -> None:
    payload = {
        "ok": True,
        "skipped": True,
        "stale": False,
        "expected_draw_date": "2026-09-01",
        "fetched": 0,
        "upserted": 0,
        "latest": {"draw_date": "2026-09-01"},
    }
    with patch("synchro.app.ensure_draws", return_value=payload):
        with _client() as client:
            response = client.post("/api/sync/ensure")
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["skipped"] is True
    assert body["stale"] is False


def test_ping_does_not_reset_pool_on_connect_error() -> None:
    from synchro import db

    with (
        patch("synchro.db.database_configured", return_value=True),
        patch(
            "synchro.db.connection",
            side_effect=Exception("timeout expired"),
        ),
        patch("synchro.db.reset_pool") as reset,
        patch(
            "synchro.db.get_settings",
            return_value=type(
                "S",
                (),
                {"database_url": "postgresql://u:p@ep-x.neon.tech/neondb"},
            )(),
        ),
    ):
        result = db.ping(timeout_sec=1)
    assert result["ok"] is False
    assert "timeout expired" in (result.get("error") or "")
    reset.assert_not_called()


def test_pool_uses_short_timeouts_and_checks_connections() -> None:
    from synchro import db

    created: dict[str, object] = {}

    class FakePool:
        closed = False

        def __init__(self, *args: object, **kwargs: object) -> None:
            created.update(kwargs)
            if args:
                created["conninfo"] = args[0]

        def close(self, timeout: float = 5.0) -> None:
            return None

    db.reset_pool()
    try:
        with (
            patch("synchro.db.database_configured", return_value=True),
            patch(
                "synchro.db.get_settings",
                return_value=type(
                    "S",
                    (),
                    {"database_url": "postgresql://u:p@ep-x-pooler.neon.tech/neondb"},
                )(),
            ),
            patch("synchro.db.ConnectionPool", FakePool),
        ):
            db.get_pool()
        assert created["timeout"] == db.POOL_GETCONN_TIMEOUT_SEC
        assert created["reconnect_timeout"] == db.POOL_RECONNECT_TIMEOUT_SEC
        assert created["max_idle"] == db.POOL_MAX_IDLE_SEC
        assert created["check"] is db._check_pooled_connection
        kwargs = created["kwargs"]
        assert isinstance(kwargs, dict)
        assert kwargs["connect_timeout"] == db.CONNECT_TIMEOUT_SEC
        assert kwargs["keepalives"] == 1
        assert kwargs["prepare_threshold"] is None
        assert db.CONNECT_TIMEOUT_SEC <= 8
        assert db.POOL_GETCONN_TIMEOUT_SEC <= 10
    finally:
        db.reset_pool()


def test_draws_return_503_when_pool_times_out() -> None:
    from psycopg_pool import PoolTimeout

    with patch(
        "synchro.db.list_draws",
        side_effect=PoolTimeout("couldn't get a connection after 8.00 sec"),
    ):
        with _client() as client:
            response = client.get("/api/draws?limit=50")
    assert response.status_code == 503
    body = response.json()
    assert "Neon" in body["detail"]


def test_health_does_not_run_init_db() -> None:
    from pathlib import Path

    from synchro import app as app_mod
    from synchro import db as db_mod

    source = Path(app_mod.__file__).read_text(encoding="utf-8")
    health = source.split("def health()", 1)[1].split("def shutdown", 1)[0]
    assert "init_db" not in health
    assert "health_details" in health
    details = Path(db_mod.__file__).read_text(encoding="utf-8").split(
        "def health_details", 1
    )[1].split("@contextmanager", 1)[0]
    assert "reset_pool()" not in details


def test_draw_select_omits_raw_json() -> None:
    from pathlib import Path

    from synchro import db as db_mod

    cols = {part.strip() for part in db_mod.DRAW_COLUMNS.split(",")}
    assert "raw" not in cols
    assert "draw_date" in cols
    assert "prizes" in cols
    assert "winners_total_fr" in cols
    assert "winners_total_eu" in cols
    source = Path(db_mod.__file__).read_text(encoding="utf-8")
    assert "SELECT * FROM draws" not in source
    schema = db_mod.SCHEMA_SQL
    assert "prizes          JSONB" in schema
    assert "ADD COLUMN IF NOT EXISTS prizes JSONB" in schema
    assert "ADD COLUMN IF NOT EXISTS winners_total_fr INTEGER" in schema
    assert "ADD COLUMN IF NOT EXISTS winners_total_eu INTEGER" in schema


def test_next_draws_route_forwards_prizes() -> None:
    from pathlib import Path

    route = (
        Path(__file__).resolve().parents[1] / "src/app/api/draws/route.ts"
    ).read_text(encoding="utf-8")
    assert "parsePrizeTiers(row.prizes)" in route
    assert "winners_total_fr" in route
    assert "winners_total_eu" in route
    assert 'raw === "n-1"' in route
    assert 'yearQuery === "n-1"' in route
    explorer = (
        Path(__file__).resolve().parents[1] / "src/components/draws-explorer.tsx"
    ).read_text(encoding="utf-8")
    assert "Gagnants FR+EU" in explorer
    assert "Total FR+EU · 13 rangs" in explorer
    assert "backfill_winner_totals()" in Path(
        Path(__file__).resolve().parents[1] / "synchro/db.py"
    ).read_text(encoding="utf-8")


def test_ui_does_not_stampede_neon_on_every_page() -> None:
    from pathlib import Path

    root = Path(__file__).resolve().parents[1]
    watchlist = (root / "src/components/brain/watchlist-sync.tsx").read_text(
        encoding="utf-8"
    )
    assert "useDraws(" not in watchlist
    assert "SYNC_ENSURE_EVENT" in watchlist
    startup = (root / "src/components/startup-status.tsx").read_text(encoding="utf-8")
    block = startup.split("export function StartupStatus", 1)[1].split(
        "function MorphoFiringPill", 1
    )[0]
    assert "inFlight" in block
    assert "if (inFlight.current) return" in block
    draws = (root / "src/lib/use-draws.ts").read_text(encoding="utf-8")
    assert "const inflight" in draws
    assert "function loadDraws" in draws
    assert "year_n1" in draws
    assert "PREV_CALENDAR_YEAR_PARAM" in draws
