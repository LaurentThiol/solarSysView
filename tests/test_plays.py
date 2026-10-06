from __future__ import annotations

from datetime import date, datetime
from unittest.mock import patch

import math
import pytest
from fastapi.testclient import TestClient

from synchro.app import create_app
from synchro.plays import (
    binom_two_sided_exact,
    decorate_play,
    official_p_any_rank,
    parse_play_date,
    summarize_play_spec,
    summarize_plays,
)
from synchro.sync import PARIS, next_play_date


@pytest.fixture(autouse=True)
def _no_neon_on_startup() -> None:
    with patch("synchro.db.database_configured", return_value=False):
        yield


def _client() -> TestClient:
    return TestClient(create_app())


def test_parse_play_date_rejects_non_draw_day() -> None:
    try:
        parse_play_date("2026-09-02")
    except ValueError as exc:
        assert "mardi" in str(exc).lower() or "vendredi" in str(exc).lower()
    else:
        raise AssertionError("expected ValueError")


def test_parse_play_date_accepts_tuesday() -> None:
    assert parse_play_date("2026-09-01") == date(2026, 9, 1)
    assert parse_play_date("2026-09-04") == date(2026, 9, 4)


def test_next_play_date_before_cutoff_is_today() -> None:
    now = datetime(2026, 9, 1, 20, 44, tzinfo=PARIS)
    assert next_play_date(now) == date(2026, 9, 1)


def test_next_play_date_after_cutoff_is_next_draw() -> None:
    now = datetime(2026, 9, 1, 20, 45, tzinfo=PARIS)
    assert next_play_date(now) == date(2026, 9, 4)


def test_next_play_date_after_tuesday_is_friday() -> None:
    now = datetime(2026, 9, 2, 10, 0, tzinfo=PARIS)
    assert next_play_date(now) == date(2026, 9, 4)


def test_decorate_pending_without_draw() -> None:
    play = {
        "id": 1,
        "label": "A",
        "numbers": [14, 23, 26, 47, 48],
        "stars": [6, 10],
        "play_date": "2026-09-15",
        "source": "jeux",
        "copies": 1,
    }
    row = decorate_play(play, None)
    assert row["status"] == "pending"
    assert row["result"] is None
    assert row["weekday"] == "mardi"


def test_decorate_settled_jackpot() -> None:
    play = {
        "id": 1,
        "label": "A",
        "numbers": [1, 2, 3, 4, 5],
        "stars": [1, 2],
        "play_date": date(2026, 9, 1),
        "source": "combinaisons",
        "copies": 2,
    }
    draw = {"numbers": [5, 4, 3, 2, 1], "stars": [2, 1], "weekday": "mardi"}
    row = decorate_play(play, draw)
    assert row["status"] == "settled"
    assert row["result"]["rank"] == 1
    assert row["copies"] == 2
    assert row["result"]["prize"] is None


def test_decorate_settled_multiplies_fdj_prize_by_copies() -> None:
    play = {
        "id": 1,
        "label": "A",
        "numbers": [1, 2, 3, 4, 5],
        "stars": [1, 2],
        "play_date": date(2026, 9, 1),
        "source": "combinaisons",
        "copies": 2,
    }
    draw = {
        "numbers": [5, 4, 3, 2, 1],
        "stars": [2, 1],
        "weekday": "mardi",
        "prizes": [{"rank": 1, "winners_fr": 0, "winners_eu": 1, "prize": 17000000}],
    }
    row = decorate_play(play, draw)
    assert row["result"]["prize"] == 34000000.0


def test_summarize_adds_fdj_prizes() -> None:
    win = decorate_play(
        {
            "id": 1,
            "numbers": [1, 2, 3, 4, 5],
            "stars": [1, 2],
            "play_date": "2026-09-01",
            "source": "jeux",
            "copies": 2,
        },
        {
            "numbers": [1, 2, 3, 4, 5],
            "stars": [1, 2],
            "prizes": [{"rank": 1, "winners_fr": 0, "winners_eu": 1, "prize": 12.5}],
        },
    )
    miss = decorate_play(
        {
            "id": 2,
            "numbers": [10, 11, 12, 13, 14],
            "stars": [3, 4],
            "play_date": "2026-09-01",
            "source": "jeux",
            "copies": 1,
        },
        {
            "numbers": [1, 2, 3, 4, 5],
            "stars": [1, 2],
            "prizes": [{"rank": 1, "winners_fr": 0, "winners_eu": 1, "prize": 12.5}],
        },
    )
    stats = summarize_plays([win, miss])
    assert stats["prize_total"] == 25.0
    assert stats["prize_known"] == 3


def test_summarize_weights_copies() -> None:
    pending = decorate_play(
        {
            "id": 1,
            "numbers": [1, 2, 3, 4, 5],
            "stars": [1, 2],
            "play_date": "2026-09-15",
            "source": "manuel",
            "copies": 3,
        },
        None,
    )
    win = decorate_play(
        {
            "id": 2,
            "numbers": [1, 2, 3, 4, 5],
            "stars": [1, 2],
            "play_date": "2026-09-01",
            "source": "jeux",
            "copies": 2,
        },
        {"numbers": [1, 2, 3, 4, 5], "stars": [1, 2]},
    )
    lose = decorate_play(
        {
            "id": 3,
            "numbers": [10, 11, 12, 13, 14],
            "stars": [3, 4],
            "play_date": "2026-09-01",
            "source": "jeux",
            "copies": 1,
        },
        {"numbers": [1, 2, 3, 4, 5], "stars": [1, 2]},
    )
    stats = summarize_plays([pending, win, lose])
    assert stats["tickets"] == 6
    assert stats["pending"] == 3
    assert stats["settled"] == 3
    assert stats["wins"] == 2
    assert stats["unique_grids"] == 2
    assert stats["wilson"] is not None
    assert stats["wilson"]["lo"] <= stats["p_win"] <= stats["wilson"]["hi"]
    assert stats["binomial"] is not None
    assert stats["binomial"]["n"] == 2
    assert stats["binomial"]["wins"] == 1
    assert stats["binomial"]["tickets"] == 3
    assert stats["binomial"]["compatible"] is True
    assert stats["p0"] == official_p_any_rank()
    assert 0.07 < stats["p0"] < 0.08
    assert stats["prize_total"] == 0
    assert stats["prize_known"] == 0


def test_binomial_two_sided_matches_known_values() -> None:
    assert binom_two_sided_exact(0, 0, 0.1) == 1.0
    assert math.isclose(binom_two_sided_exact(0, 1, 0.5), 1.0, abs_tol=1e-12)
    assert math.isclose(binom_two_sided_exact(10, 10, 0.5), 2 / 1024, rel_tol=1e-9)
    assert math.isclose(binom_two_sided_exact(0, 10, 0.5), 2 / 1024, rel_tol=1e-9)


def test_binomial_rejects_long_losing_streak() -> None:
    stats = summarize_plays(
        [
            decorate_play(
                {
                    "id": i,
                    "numbers": [10, 11, 12, 13, 14],
                    "stars": [3, 4],
                    "play_date": "2026-09-01",
                    "source": "manuel",
                    "copies": 1,
                },
                {"numbers": [1, 2, 3, 4, 5], "stars": [1, 2]},
            )
            for i in range(80)
        ]
    )
    assert stats["binomial"] is not None
    assert stats["binomial"]["wins"] == 0
    assert stats["binomial"]["n"] == 80
    assert stats["binomial"]["compatible"] is False
    assert stats["binomial"]["p_value"] < 0.05


def test_spec_summary_lists_restrictions() -> None:
    chips = summarize_play_spec(
        {
            "numberMinSum": 80,
            "numberMaxSum": 140,
            "numberMinEven": 2,
            "numberMaxEven": 3,
            "numberDecadeMax": [2, 5, 5, 5, 5],
            "numberForced": [7, 23],
            "numberChance": [0] + [100] * 49,
        }
    )
    assert "Σ 80–140" in chips
    assert "2–3 paires" in chips
    assert "1–10 0–2" in chips
    assert "forcés 7, 23" in chips
    assert "hors 1" in chips


def test_plays_api_create_and_list() -> None:
    stored = [
        {
            "id": 7,
            "label": "Grille",
            "numbers": [1, 2, 3, 4, 5],
            "stars": [1, 2],
            "play_date": date(2026, 9, 1),
            "source": "manuel",
            "note": None,
            "copies": 1,
            "active": True,
        }
    ]
    with (
        patch("synchro.db.database_configured", return_value=False),
        patch("synchro.db.insert_plays", return_value=stored) as insert,
        patch("synchro.db.list_plays", return_value=stored),
        patch("synchro.db.draws_by_dates", return_value={}),
        patch("synchro.db.serialize_row", side_effect=lambda row: {**row, "play_date": row["play_date"].isoformat()}),
        patch("synchro.app.next_play_date", return_value=date(2026, 9, 15)),
    ):
        with _client() as client:
            created = client.post(
                "/api/plays",
                json={
                    "play_date": "2026-09-01",
                    "numbers": [1, 2, 3, 4, 5],
                    "stars": [1, 2],
                    "source": "combinaisons",
                    "label": "Test",
                },
            )
            listed = client.get("/api/plays")
    assert created.status_code == 200
    assert created.json()["item"]["status"] == "pending"
    insert.assert_called_once()
    assert listed.status_code == 200
    body = listed.json()
    assert body["stats"]["tickets"] == 1
    assert body["next_play_date"] == "2026-09-15"


def test_plays_api_rejects_invalid_date() -> None:
    with patch("synchro.db.database_configured", return_value=False):
        with _client() as client:
            response = client.post(
                "/api/plays",
                json={
                    "play_date": "2026-09-02",
                    "numbers": [1, 2, 3, 4, 5],
                    "stars": [1, 2],
                },
            )
    assert response.status_code == 400


def test_plays_api_batch() -> None:
    stored = [
        {
            "id": 1,
            "label": "A",
            "numbers": [1, 2, 3, 4, 5],
            "stars": [1, 2],
            "play_date": date(2026, 9, 4),
            "source": "combinaisons",
            "copies": 1,
        },
        {
            "id": 2,
            "label": "B",
            "numbers": [6, 7, 8, 9, 10],
            "stars": [3, 4],
            "play_date": date(2026, 9, 4),
            "source": "combinaisons",
            "copies": 1,
        },
    ]
    with (
        patch("synchro.db.database_configured", return_value=False),
        patch("synchro.db.insert_plays", return_value=stored),
        patch("synchro.db.draws_by_dates", return_value={}),
        patch("synchro.db.serialize_row", side_effect=lambda row: {**row, "play_date": row["play_date"].isoformat()}),
        patch("synchro.app.next_play_date", return_value=date(2026, 9, 15)),
    ):
        with _client() as client:
            response = client.post(
                "/api/plays",
                json={
                    "play_date": "2026-09-04",
                    "items": [
                        {"numbers": [1, 2, 3, 4, 5], "stars": [1, 2], "label": "A"},
                        {"numbers": [6, 7, 8, 9, 10], "stars": [3, 4], "label": "B"},
                    ],
                },
            )
    assert response.status_code == 200
    assert len(response.json()["items"]) == 2


def test_plays_api_stores_spec() -> None:
    stored = [
        {
            "id": 9,
            "label": "Jeux",
            "numbers": [1, 2, 3, 4, 5],
            "stars": [1, 2],
            "play_date": date(2026, 9, 1),
            "source": "jeux",
            "note": None,
            "copies": 1,
            "spec": {"numberMinSum": 80, "numberMaxSum": 140},
            "active": True,
        }
    ]
    with (
        patch("synchro.db.database_configured", return_value=False),
        patch("synchro.db.insert_plays", return_value=stored) as insert,
        patch("synchro.db.draws_by_dates", return_value={}),
        patch("synchro.db.serialize_row", side_effect=lambda row: {**row, "play_date": row["play_date"].isoformat()}),
        patch("synchro.app.next_play_date", return_value=date(2026, 9, 15)),
    ):
        with _client() as client:
            response = client.post(
                "/api/plays",
                json={
                    "play_date": "2026-09-01",
                    "numbers": [1, 2, 3, 4, 5],
                    "stars": [1, 2],
                    "source": "jeux",
                    "label": "Jeux",
                    "spec": {"numberMinSum": 80, "numberMaxSum": 140, "ignored": True},
                },
            )
    assert response.status_code == 200
    insert.assert_called_once()
    row = insert.call_args[0][0][0]
    assert row["spec"]["numberMinSum"] == 80
    assert row["spec"]["numberMaxSum"] == 140
    assert "ignored" not in row["spec"]
    assert "Σ 80–140" in response.json()["item"]["spec_summary"]
