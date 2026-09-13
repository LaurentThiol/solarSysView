from __future__ import annotations

import json
import os
import shlex
import subprocess
import sys
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from unittest.mock import patch

from synchro.fdj import Draw
from synchro.sync import (
    PARIS,
    ensure_draws,
    expected_last_draw_date,
    format_ensure_messages,
    freshness,
)


def _draw(day: date) -> Draw:
    return Draw(
        draw_date=day,
        draw_code="26070",
        weekday="MARDI",
        numbers=[1, 2, 3, 4, 5],
        stars=[1, 2],
        star_pool=12,
        winners_rank1_fr=0,
        winners_rank1_eu=0,
        prize_rank1=Decimal("0"),
        my_million=None,
        raw={},
    )


def test_expected_tuesday_morning_is_previous_friday() -> None:
    now = datetime(2026, 9, 1, 10, 0, tzinfo=PARIS)
    assert expected_last_draw_date(now) == date(2026, 8, 28)


def test_expected_tuesday_after_publish_is_today() -> None:
    now = datetime(2026, 9, 1, 22, 0, tzinfo=PARIS)
    assert expected_last_draw_date(now) == date(2026, 9, 1)


def test_expected_friday_before_publish_is_previous_tuesday() -> None:
    now = datetime(2026, 8, 28, 21, 44, tzinfo=PARIS)
    assert expected_last_draw_date(now) == date(2026, 8, 25)


def test_expected_friday_at_publish_is_today() -> None:
    now = datetime(2026, 8, 28, 21, 45, tzinfo=PARIS)
    assert expected_last_draw_date(now) == date(2026, 8, 28)


def test_expected_wednesday_is_tuesday() -> None:
    now = datetime(2026, 9, 2, 14, 0, tzinfo=PARIS)
    assert expected_last_draw_date(now) == date(2026, 9, 1)


def test_freshness_stale_when_behind() -> None:
    with patch("synchro.sync.expected_last_draw_date", return_value=date(2026, 9, 1)):
        info = freshness(latest={"draw_date": date(2026, 8, 28)})
    assert info["stale"] is True
    assert info["expected_draw_date"] == "2026-09-01"
    assert info["latest_date"] == "2026-08-28"


def test_freshness_ok_when_current() -> None:
    with patch("synchro.sync.expected_last_draw_date", return_value=date(2026, 9, 1)):
        info = freshness(latest={"draw_date": date(2026, 9, 1)})
    assert info["stale"] is False


def test_ensure_skips_when_up_to_date() -> None:
    latest = {"draw_date": date(2026, 9, 1), "numbers": [1, 2, 3, 4, 5], "stars": [1, 2]}
    with (
        patch("synchro.sync.expected_last_draw_date", return_value=date(2026, 9, 1)),
        patch("synchro.db.init_db"),
        patch("synchro.db.count_draws", return_value=80),
        patch("synchro.db.latest_draw", return_value=latest),
        patch("synchro.db.last_sync", return_value={"status": "ok", "finished_at": datetime(2026, 9, 1, 22, 0)}),
        patch("synchro.db.serialize_draw", side_effect=lambda row: row),
        patch("synchro.db.serialize_row", side_effect=lambda row: row),
        patch("synchro.sync.fetch_latest_draws") as latest_fetch,
        patch("synchro.sync.fetch_all_draws") as full_fetch,
    ):
        result = ensure_draws()
    assert result["ok"] is True
    assert result["skipped"] is True
    assert result["stale"] is False
    latest_fetch.assert_not_called()
    full_fetch.assert_not_called()


def test_ensure_fetches_latest_archive_when_stale() -> None:
    old = {"draw_date": date(2026, 8, 28)}
    new = {"draw_date": date(2026, 9, 1), "numbers": [1, 2, 3, 4, 5], "stars": [6, 7]}
    draws = [_draw(date(2026, 9, 1))]
    with (
        patch("synchro.sync.expected_last_draw_date", return_value=date(2026, 9, 1)),
        patch("synchro.db.init_db"),
        patch("synchro.db.count_draws", return_value=80),
        patch("synchro.db.latest_draw", side_effect=[old, new, new]),
        patch("synchro.db.log_sync_start", return_value=1),
        patch("synchro.db.log_sync_end"),
        patch("synchro.db.upsert_draws", return_value=1),
        patch("synchro.db.last_sync", return_value={"status": "ok"}),
        patch("synchro.db.serialize_draw", side_effect=lambda row: row),
        patch("synchro.db.serialize_row", side_effect=lambda row: row),
        patch("synchro.sync.fetch_latest_draws", return_value=draws) as latest_fetch,
        patch("synchro.sync.fetch_all_draws") as full_fetch,
    ):
        result = ensure_draws()
    assert result["ok"] is True
    assert result["skipped"] is False
    assert result["latest_only"] is True
    assert result["fetched"] == 1
    latest_fetch.assert_called_once()
    full_fetch.assert_not_called()


def test_ensure_full_sync_when_empty() -> None:
    draws = [_draw(date(2026, 9, 1))]
    new = {"draw_date": date(2026, 9, 1)}
    with (
        patch("synchro.sync.expected_last_draw_date", return_value=date(2026, 9, 1)),
        patch("synchro.db.init_db"),
        patch("synchro.db.count_draws", return_value=0),
        patch("synchro.db.latest_draw", side_effect=[None, new, new]),
        patch("synchro.db.log_sync_start", return_value=1),
        patch("synchro.db.log_sync_end"),
        patch("synchro.db.upsert_draws", return_value=1),
        patch("synchro.db.last_sync", return_value={"status": "ok"}),
        patch("synchro.db.serialize_draw", side_effect=lambda row: row),
        patch("synchro.db.serialize_row", side_effect=lambda row: row),
        patch("synchro.sync.fetch_latest_draws") as latest_fetch,
        patch("synchro.sync.fetch_all_draws", return_value=draws) as full_fetch,
    ):
        result = ensure_draws()
    assert result["ok"] is True
    assert result["skipped"] is False
    assert result["latest_only"] is False
    full_fetch.assert_called_once()
    latest_fetch.assert_not_called()


def test_format_ensure_messages_skipped() -> None:
    lines = format_ensure_messages(
        {
            "ok": True,
            "skipped": True,
            "latest": {"draw_date": "2026-09-01"},
            "stale": False,
        }
    )
    assert lines == [("ok", "Tirages déjà à jour (dernier 2026-09-01)")]


def test_format_ensure_messages_latest_archive() -> None:
    lines = format_ensure_messages(
        {
            "ok": True,
            "latest_only": True,
            "upserted": 12,
            "latest": {"draw_date": "2026-09-01"},
            "stale": False,
        }
    )
    assert lines == [("ok", "Archive récente — 12 lignes, dernier 2026-09-01")]


def test_format_ensure_messages_stale_warning_without_backslash_fstring() -> None:
    lines = format_ensure_messages(
        {
            "ok": True,
            "latest_only": True,
            "upserted": 0,
            "latest": {"draw_date": "2026-08-28"},
            "stale": True,
            "expected_draw_date": "2026-09-01",
        }
    )
    assert lines[0] == ("ok", "Archive récente — 0 lignes, dernier 2026-08-28")
    assert lines[1] == (
        "warn",
        "Neon encore en retard (attendu 2026-09-01, dernier 2026-08-28)",
    )


def test_format_ensure_messages_api_error() -> None:
    lines = format_ensure_messages({"detail": "Synchro FDJ impossible: timeout"})
    assert lines == [("warn", "Synchro FDJ impossible: timeout")]


def test_launch_ensure_parser_survives_set_e_pipefail() -> None:
    """Regress the bug: invalid python -c + pipefail stopped the whole stack."""
    root = Path(__file__).resolve().parents[1]
    launch = (root / "launch").read_text(encoding="utf-8")
    assert r'data.get(\"' not in launch
    payload = {
        "ok": True,
        "skipped": True,
        "stale": True,
        "expected_draw_date": "2026-09-01",
        "latest": {"draw_date": "2026-08-28"},
    }
    # Same interpreter as pytest / ./launch (.venv), not system python3
    # which typically lacks psycopg even when PYTHONPATH points at the repo.
    py = shlex.quote(sys.executable)
    script = r"""
set -euo pipefail
%s -c '
from synchro.sync import format_ensure_messages
import json, sys
raw = sys.stdin.read()
data = json.loads(raw)
for kind, msg in format_ensure_messages(data):
    print(f"{kind}:{msg}")
' <<'JSON'
%s
JSON
echo SURVIVED
""" % (py, json.dumps(payload))
    result = subprocess.run(
        ["bash", "-c", script],
        cwd=root,
        capture_output=True,
        text=True,
        env={**os.environ, "PYTHONPATH": str(root)},
        check=False,
    )
    assert result.returncode == 0, result.stderr
    assert "ok:Tirages déjà à jour (dernier 2026-08-28)" in result.stdout
    assert "warn:Neon encore en retard (attendu 2026-09-01, dernier 2026-08-28)" in result.stdout
    assert "SURVIVED" in result.stdout
