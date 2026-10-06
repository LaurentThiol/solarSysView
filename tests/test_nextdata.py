"""nextData : panel, base recomptée, projection, deux modes, routes."""

from __future__ import annotations

import random
from datetime import date, timedelta

from fastapi.testclient import TestClient

from synchro.app import create_app
from synchro.nextdata.backtest import walk_forward
from synchro.nextdata.covariates import link_series, star_couple_ago
from synchro.nextdata.empirical import recount, smoothed_share
from synchro.nextdata.forecast import (
    blend_mid,
    blend_weight,
    lag_choice,
    loss_indices,
    row_weight,
    run_forecast,
)
from synchro.nextdata.panel import build_frame
from synchro.nextdata.project import beam, project_numbers


def _draws(count: int, start: date = date(2024, 1, 2), seed: int = 0) -> list[dict]:
    rng = random.Random(seed)
    rows = []
    day = start
    while len(rows) < count:
        if day.weekday() in (1, 4):
            rows.append(
                {
                    "date": day.isoformat(),
                    "weekday": "mardi" if day.weekday() == 1 else "vendredi",
                    "numbers": sorted(rng.sample(range(1, 51), 5)),
                    "stars": sorted(rng.sample(range(1, 13), 2)),
                    "star_pool": 12,
                }
            )
        day += timedelta(days=1)
    return rows


def test_couple_and_triple_history_stops_before_the_draw() -> None:
    pools = [[1, 2, 3, 4, 5], [1, 2, 6, 7, 8], [9, 10, 11, 12, 13]]
    couples = link_series(pools, 2)
    triples = link_series(pools, 3)
    assert couples["couple_ago_mean"][0] == 0
    assert couples["couple_count_mean"][0] == 0
    assert couples["couple_affinity_mean"][0] == 0
    assert couples["couple_overlap"][1] == 1
    assert couples["couple_ago_mean"][1] == 1
    assert abs(couples["couple_count_mean"][1] - 0.1) < 1e-9
    assert couples["couple_overlap"][2] == 0
    alone = link_series(pools[:1], 2)
    assert alone["couple_ago_mean"][0] == couples["couple_ago_mean"][0]
    assert triples["triple_overlap"][1] == 0
    assert star_couple_ago([[1, 2], [1, 2], [3, 4]]) == [0.0, 1.0, 2.0]


def test_frame_uses_civil_years_and_recounts_the_focus() -> None:
    draws = _draws(230, seed=2)
    frame = build_frame(draws, years=["n", "n-1"], focus=50)
    assert frame.anchor_year >= 2025
    assert "n-2" not in frame.years
    assert all(not row["date"].startswith(str(frame.anchor_year - 2)) for row in frame.rows)
    assert frame.focus == 50
    assert frame.focus_start == len(frame.rows) - 50
    assert frame.rows[0]["couple_count_mean"] == 0
    assert len(frame.horizon) == 2
    mardi = build_frame(draws, years=["n", "n-1", "n-2"], focus=50, weekday="mardi")
    assert mardi.weekday == "mardi"
    assert {row["weekday"] for row in mardi.rows} == {"mardi"}
    base = recount(frame.rows[frame.focus_start :], star_pool=frame.star_pool)
    assert base["draw_count"] == 50
    assert sum(item["count"] for item in base["numbers"]) == 250
    assert base["couples"]
    assert base["triples"]
    assert smoothed_share(0, 50, 5, 50) < smoothed_share(10, 50, 5, 50)


def test_window_loss_ignores_the_three_year_prefix() -> None:
    lags, past = lag_choice("fenetre", 50, 160)
    assert (lags, past) == (12, 6)
    assert lag_choice("fenetre", 100, 220) == (16, 8)
    assert lag_choice("corpus", 50, 220)[0] == 16
    focus_start = 110
    window = loss_indices(160, lags, focus_start, "fenetre")
    assert window
    assert min(window) >= focus_start
    assert all(row_weight(index, focus_start, "fenetre") == 1.0 for index in window)
    assert row_weight(10, focus_start, "corpus") == 1.0
    assert row_weight(focus_start, focus_start, "corpus") == 3.0
    corpus = loss_indices(160, 16, focus_start, "corpus")
    assert corpus[0] == 16
    assert any(row_weight(index, focus_start, "corpus") == 1.0 for index in corpus)
    assert any(row_weight(index, focus_start, "corpus") == 3.0 for index in corpus)


def test_projection_is_increasing_and_beam_returns_a_grid() -> None:
    moments = {
        "n1": {"lo": 4, "mid": 7, "hi": 11},
        "g1": {"lo": 3, "mid": 6, "hi": 10},
        "g2": {"lo": 4, "mid": 8, "hi": 12},
        "g3": {"lo": 3, "mid": 7, "hi": 11},
        "g4": {"lo": 5, "mid": 9, "hi": 14},
        "sum": {"lo": 90, "mid": 110, "hi": 130},
        "parity": {"lo": 1, "mid": 2, "hi": 4},
        "e1": {"lo": 1, "mid": 3, "hi": 5},
        "e_gap": {"lo": 1, "mid": 4, "hi": 6},
        "star_sum": {"lo": 6, "mid": 10, "hi": 14},
    }
    numbers, _raw = project_numbers(moments)
    assert numbers == sorted(numbers)
    assert len(set(numbers)) == 5
    assert all(1 <= number <= 50 for number in numbers)
    draws = _draws(30, seed=3)
    frame = build_frame(draws, focus=20)
    base = recount(frame.rows[frame.focus_start :], star_pool=12)
    ranked = beam(moments, base, star_pool=12)
    assert ranked
    assert len(ranked[0]["numbers"]) == 5
    assert len(ranked[0]["stars"]) == 2
    assert ranked[0]["stars"][0] < ranked[0]["stars"][1]


def test_status_does_not_import_darts_or_torch() -> None:
    import sys

    from synchro.nextdata.forecast import dependency_status, lightgbm_hint

    before = set(sys.modules)
    status = dependency_status()
    loaded = set(sys.modules) - before
    blocked = [name for name in loaded if name == "darts" or name.startswith(("darts.", "chronos", "torch"))]
    assert blocked == []
    assert status["ready"] is True
    assert status["lightgbm_error"] is None
    assert "darts" in status and "chronos" in status
    assert lightgbm_hint("Library not loaded: @rpath/libomp.dylib") == (
        "Sur Mac : brew install libomp, puis relancez ./launch."
    )


def test_catboost_matches_the_lightgbm_reading() -> None:
    pytest = __import__("pytest")
    pytest.importorskip("catboost")
    report = run_forecast(
        _draws(36, seed=6),
        focus=24,
        estimators=4,
        backtest_estimators=2,
        with_chronos=False,
    )
    assert report["ok"] is True
    assert report["catboost"] is True
    for mode in ("corpus", "fenetre"):
        cat = report["modes"][mode]["catboost"]
        assert cat["engine"] == "catboost"
        assert cat["grid"]["numbers"] == sorted(cat["grid"]["numbers"])
        assert len(set(cat["grid"]["numbers"])) == 5
        assert len(cat["grid"]["stars"]) == 2
        assert cat["importance"]
    assert report["backtest"]["metrics"]["corpus_catboost"]["mae"]["sum"] is not None
    assert report["backtest"]["metrics"]["fenetre_catboost"]["mae"]["sum"] is not None


def test_blend_keeps_lightgbm_when_chronos_is_absent() -> None:
    assert blend_mid(12.0, None, 0.2) == 12.0
    assert blend_mid(10.0, 0.0, 0.5) == 5.0
    assert blend_weight(1.0, 3.0) > 0.7


def test_two_modes_forecast_real_draws() -> None:
    report = run_forecast(
        _draws(36, seed=4),
        focus=24,
        estimators=4,
        backtest_estimators=2,
        with_chronos=False,
    )
    assert report["ok"] is True
    assert report["primary"] == "corpus"
    for mode in ("corpus", "fenetre"):
        grid = report["modes"][mode]["grid"]
        assert grid["numbers"] == sorted(grid["numbers"])
        assert len(set(grid["numbers"])) == 5
        assert len(grid["stars"]) == 2
        assert grid["stars"][0] < grid["stars"][1]
    assert report["backtest"]["draw_count"] >= 1
    assert "sum" in report["backtest"]["metrics"]["corpus"]["mae"]
    assert report["backtest"]["metrics"]["fenetre"]["mae"]["sum"] is not None
    assert report["chart"][-1]["kind"] == "forecast"
    assert report["base"]["couples"]
    walked = walk_forward(build_frame(_draws(36, seed=4), focus=24), ["forme", "couples"], estimators=2)
    assert walked["rows"]


def test_status_and_focus_guard(monkeypatch) -> None:
    monkeypatch.setenv("SYNCHRO_NEXTDATA_ESTIMATORS", "3")
    monkeypatch.setenv("SYNCHRO_NEXTDATA_BACKTEST_ESTIMATORS", "2")
    client = TestClient(create_app())
    status = client.get("/api/nextdata/status")
    assert status.status_code == 200
    body = status.json()
    assert body["ok"] is True
    assert "lightgbm" in body and "darts" in body and "chronos" in body
    refused = client.post("/api/nextdata/forecast", json={"focus": 20, "draws": _draws(30)})
    assert refused.status_code == 400
    accepted = client.post(
        "/api/nextdata/forecast",
        json={
            "focus": 50,
            "primary": "fenetre",
            "years": ["n", "n-1", "n-2"],
            "covariates": ["forme", "couples", "triples", "lune"],
            "draws": _draws(32, seed=5),
            "with_chronos": False,
        },
    )
    assert accepted.status_code == 200, accepted.text
    payload = accepted.json()
    assert payload["ok"] is True
    assert payload["primary"] == "fenetre"
    assert len(payload["modes"]["corpus"]["grid"]["numbers"]) == 5
    assert len(payload["modes"]["fenetre"]["grid"]["stars"]) == 2
