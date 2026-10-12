"""Pulse : fondamentale, plafond de fenêtre, double cycle, paire, API."""

import json
from datetime import date, timedelta
from unittest.mock import patch

import numpy as np
from fastapi.testclient import TestClient

from synchro.app import create_app
from synchro.pulse.model import analyze_hits, circ_dist, fit_one, period_limit, principal_fit
from synchro.pulse.scan import scan_channels


def _client() -> TestClient:
    return TestClient(create_app())


def test_fundamental_keeps_period_not_harmonic() -> None:
    hits = np.zeros(80)
    hits[::10] = 1
    fit = principal_fit(hits)
    assert fit["period"] == 10
    assert fit["period"] != 5
    assert fit["concordance"] == 1


def test_period_cap_follows_window_length() -> None:
    assert period_limit(20) == 10
    hits = np.zeros(20)
    hits[::4] = 1
    fit = principal_fit(hits)
    assert fit["period"] is not None
    assert fit["period"] <= 10


def test_pure_cycle_stays_simple() -> None:
    times = np.arange(120)
    hits = (np.cos(2 * np.pi * times / 10) > 0).astype(float)
    fit = fit_one(hits, families=("simple", "double"))
    assert fit["generator"] == "simple"
    assert fit["period"] == 10
    assert fit["period2"] is None


def test_amplitude_modulation_kept_when_it_beats_the_null() -> None:
    times = np.arange(240)
    wave = np.cos(2 * np.pi * times / 12) * np.cos(2 * np.pi * times / 5)
    hits = (wave > 0.35).astype(float)
    fit = fit_one(hits, families=("simple", "double"), seed=0)
    assert fit["generator"] == "double"
    assert fit["period"] == 12
    assert fit["period2"] == 5
    assert fit["concordance"] > 0.9


def test_opposed_balls_form_one_pair() -> None:
    length = 80
    first = np.zeros(length)
    second = np.zeros(length)
    first[::10] = 1
    second[5::10] = 1
    dates = [f"2024-03-{(index % 28) + 1:02d}" for index in range(length)]
    body = scan_channels(
        [
            {"kind": "ball", "n": 3, "hits": first},
            {"kind": "ball", "n": 18, "hits": second},
        ],
        families=("simple", "pair"),
        preset="last_100",
        dates=dates,
        workers=1,
    )
    balls = {
        item["n"]: item
        for item in body["numbers"]
        if item["kind"] == "ball" and item["n"] in (3, 18)
    }
    assert balls[3]["period"] == 10
    assert balls[18]["period"] == 10
    assert circ_dist(balls[3]["phase"], balls[18]["phase"]) == 0.5
    assert body["groups"]
    group = body["groups"][0]
    assert group["generator"] == "pair"
    assert {member["n"] for member in group["members"]} == {3, 18}
    assert group["period"] == 10
    assert balls[3]["group_ids"] == [group["id"]]
    assert balls[18]["group_ids"] == [group["id"]]


def test_long_window_splits_when_the_period_changes() -> None:
    hits = np.zeros(200)
    hits[:100:10] = 1
    hits[100::6] = 1
    dates = [f"2020-01-{(index % 28) + 1:02d}" for index in range(200)]
    analyzed = analyze_hits(
        hits,
        families=("simple",),
        preset="last_200",
        dates=dates,
        kind="ball",
        n=7,
    )
    periods = {row["period"] for row in analyzed["slices"]}
    assert 10 in periods
    assert 6 in periods
    assert all(row["from"] and row["to"] and row["id"].startswith("b7-last_200-") for row in analyzed["slices"])


def _draws(n: int = 40) -> list[dict]:
    day = date(2024, 1, 2)
    rows: list[dict] = []
    while len(rows) < n:
        if day.weekday() in (1, 4):
            rows.append(
                {
                    "draw_date": day,
                    "weekday": "mardi" if day.weekday() == 1 else "vendredi",
                    "numbers": [1, 2, 3, 4, (len(rows) % 46) + 5],
                    "stars": [1, (len(rows) % 11) + 2],
                    "star_pool": 12,
                }
            )
        day += timedelta(days=1)
    return rows


def test_pulse_status_and_scan_shape() -> None:
    draws = _draws(40)
    with (
        patch("synchro.db.database_configured", return_value=True),
        patch("synchro.db.all_draws", return_value=draws),
        patch.dict("os.environ", {"SYNCHRO_PULSE_WORKERS": "1"}),
    ):
        with _client() as client:
            status = client.get("/api/pulse/status")
            response = client.post(
                "/api/pulse/scan",
                json={"presets": ["last_20"], "families": ["simple"], "weekday": None},
            )
    assert status.status_code == 200
    assert status.json()["ok"] is True
    assert "year_n2" in status.json()["presets"]
    assert "hertz" not in json.dumps(status.json()).lower()
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["windows"][0]["draw_count"] == 20
    assert len(body["numbers"]) == 62
    json.dumps(body, allow_nan=False)
    ball = next(item for item in body["numbers"] if item["kind"] == "ball" and item["n"] == 1)
    assert ball["slices"]
    slice_id = ball["slices"][0]["id"]
    with (
        patch("synchro.db.database_configured", return_value=True),
        patch("synchro.db.all_draws", return_value=draws),
    ):
        with _client() as client:
            detail = client.get(
                "/api/pulse/detail",
                params={
                    "kind": "ball",
                    "n": 1,
                    "preset": "last_20",
                    "slice": slice_id,
                    "families": "simple",
                },
            )
    assert detail.status_code == 200
    payload = detail.json()
    assert payload["ok"] is True
    assert payload["points"]
    assert "wave" in payload["points"][0]
    json.dumps(payload, allow_nan=False)


def test_pulse_scan_rejects_an_empty_family_list() -> None:
    with (
        patch("synchro.db.database_configured", return_value=True),
        patch("synchro.db.all_draws", return_value=_draws(8)),
    ):
        with _client() as client:
            response = client.post(
                "/api/pulse/scan",
                json={"presets": ["last_20"], "families": []},
            )
    assert response.status_code == 400
