"""Rayons X : trace d’un pas, contrôles, grille inchangée."""

from __future__ import annotations

import json
import os
import random
from datetime import date, timedelta
from pathlib import Path

from synchro.nextdata import backtest
from synchro.nextdata.forecast import run_forecast
from synchro.nextdata.panel import Frame
from synchro.nextdata.project import number_stages, project_numbers, project_stars, score_grid, score_terms
from synchro.nextdata.xray import CHRONOS_TARGETS, CHRONOS_WINDOW, OPERATIONS, public_xray


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


def _offline(monkeypatch) -> None:
    def fake(rows, horizon, **kwargs):
        del horizon
        bands = {
            "sum": {"lo": 90, "mid": 100 + len(rows) % 30, "hi": 140},
            "parity": {"lo": 1, "mid": 2, "hi": 4},
            "star_sum": {"lo": 6, "mid": 10, "hi": 16},
            "spread": {"lo": 20, "mid": 35, "hi": 45},
            "consecutive": {"lo": 0, "mid": 1, "hi": 3},
            "star_consecutive": {"lo": 0, "mid": 0, "hi": 1},
            "n1": {"lo": 2, "mid": 6, "hi": 12},
            "g1": {"lo": 4, "mid": 8, "hi": 14},
            "g2": {"lo": 4, "mid": 8, "hi": 14},
            "g3": {"lo": 4, "mid": 8, "hi": 14},
            "g4": {"lo": 4, "mid": 8, "hi": 14},
            "e1": {"lo": 1, "mid": 3, "hi": 6},
            "e_gap": {"lo": 1, "mid": 4, "hi": 8},
        }
        for rank, mid in zip(("n1", "n2", "n3", "n4", "n5", "e1", "e2"), (6, 15, 25, 34, 43, 3, 8)):
            bands[f"level:{rank}"] = {"lo": mid - 4, "mid": mid, "hi": mid + 4}
            bands[f"delta:{rank}"] = {"lo": -5, "mid": 0, "hi": 5}
        return bands, [{"name": "lag:sum:1", "gain": 1.0, "family": "series"}], kwargs.get("library", "lightgbm")

    monkeypatch.setattr("synchro.nextdata.forecast.lightgbm_import_error", lambda: None)
    monkeypatch.setattr("synchro.nextdata.models.predict_moments", fake)
    monkeypatch.setattr("synchro.nextdata.steps.catboost_import_error", lambda: None)
    monkeypatch.setattr("synchro.nextdata.steps._installed", lambda _module: False)


def _moments() -> dict:
    return {
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


def test_project_numbers_stay_on_the_same_grid() -> None:
    moments = _moments()
    numbers, raw = project_numbers(moments)
    stages = number_stages(moments)
    assert numbers == stages["after_spread"]
    assert raw == stages["raw"]
    assert numbers == [7, 13, 22, 29, 39]
    assert project_stars(moments, 12) == star_stages_center(moments)
    terms = score_terms([7, 13, 21, 28, 37], [3, 7], moments, {"star_pool": 12})
    assert score_grid([7, 13, 21, 28, 37], [3, 7], moments, {"star_pool": 12}) == terms["score"]


def star_stages_center(moments: dict) -> list[int]:
    from synchro.nextdata.project import star_stages

    return star_stages(moments, 12)["after_sum"]


def test_chronos_targets_match_the_assembly() -> None:
    assert CHRONOS_WINDOW == backtest.CHRONOS_WINDOW
    assert CHRONOS_TARGETS == backtest.CHRONOS_TARGETS


def _reading() -> dict:
    return {
        "mode": "corpus",
        "library": "lightgbm",
        "grid": {"numbers": [1, 2, 3, 4, 5], "stars": [1, 2], "score": 1},
        "view": {"sum": {"lo": 1, "mid": 2, "hi": 3}},
        "xray_core": {
            "quantiles": {"sum": {"lo": 5, "mid": 1, "hi": 3}},
            "chronos": {
                "available": False,
                "weights": {},
                "window": 0,
                "window_t": [],
                "scored_t": 1,
                "medians": {},
            },
            "engine": "lightgbm",
            "library": "lightgbm",
            "darts": [],
            "error": None,
            "arbitration": {
                "ranks": [{"rank": "n1", "chain": 4, "level": 4, "delta": 0, "weights": {"chain": 0, "level": 1, "delta": 0}, "clipped": 4, "grid": 4}],
                "gaps": [],
            },
            "projection": {
                "raw": [1, 2, 3, 4, 5],
                "ordered": [1, 2, 3, 4, 5],
                "after_sum": [1, 2, 3, 4, 5],
                "after_spread": [1, 2, 3, 4, 5],
                "center": {"numbers": [1, 2, 3, 4, 5], "stars": [1, 2]},
                "stars_raw": [1, 2],
                "stars_ordered": [1, 2],
                "stars_after_sum": [1, 2],
                "neighbors": [
                    {
                        "numbers": [1, 2, 3, 4, 5],
                        "stars": [1, 2],
                        "score": 1,
                        "distance": 0,
                        "frequency": 0,
                        "couples": 0,
                        "triples": 0,
                        "pulse": 0,
                    }
                ],
            },
        },
    }


def test_a_fake_step_names_the_crossed_band_and_the_scored_draw() -> None:
    frame = Frame(
        rows=[{"date": "2020-01-07", "numbers": [1, 2, 3, 4, 5], "stars": [1, 2]}],
        horizon=[{"date": "2020-01-10"}],
        focus_start=0,
        focus=1,
        years=["n", "n-1"],
        years_present=["n"],
        weekday="tous",
        star_pool=12,
        anchor_year=2020,
        next_date="2020-01-10",
    )
    step = {"t": 1, "parts": {}, "origin": {}, "part_keys": {}, "star_pool": 12}
    report = public_xray(
        frame,
        step,
        "corpus",
        _reading(),
        focus_requested=1,
        families=["forme"],
        block_requested=None,
        excluded=[],
        estimators=32,
        chronos_requested=False,
        persist=None,
        calibration={"steps": 1, "calibrated": False, "edges": {}, "history_t": [1]},
        moved={"sum": {"lo": 1, "mid": 2, "hi": 3}},
        persist_snap=None,
    )
    assert set(OPERATIONS) <= set(report)
    failed = {item["id"] for item in report["controles"] if not item["ok"]}
    assert "quantiles.ordre" in failed
    assert "calibrage.tirage" in failed
    assert any("Bande croisée" in item["detail"] for item in report["controles"] if item["id"] == "quantiles.ordre")


def test_forecast_publishes_the_trace_and_rereads_the_cache(monkeypatch) -> None:
    _offline(monkeypatch)
    draws = _draws(40, seed=4)
    first = run_forecast(draws, focus=24, covariates=["forme"], estimators=2, chunk=8)
    assert first["ok"] is True
    xray = first["modes"]["corpus"]["xray"]
    assert set(OPERATIONS) <= set(xray)
    assert xray["pas"]["origin"]["lightgbm"] == "calculé"
    assert xray["projection"]["neighbors"][0]["numbers"] == first["modes"]["corpus"]["grid"]["numbers"]
    assert xray["projection"]["neighbors"][0]["stars"] == first["modes"]["corpus"]["grid"]["stars"]
    saved = list(Path(os.environ["SYNCHRO_NEXTDATA_CACHE"]).rglob("*.json"))
    assert saved
    for path in saved:
        payload = json.loads(path.read_text(encoding="utf-8"))
        assert "origin" not in payload
        assert "xray" not in payload
    second = run_forecast(draws, focus=24, covariates=["forme"], estimators=2, chunk=8)
    assert second["modes"]["corpus"]["grid"] == first["modes"]["corpus"]["grid"]
    assert second["modes"]["corpus"]["xray"]["pas"]["origin"]["lightgbm"] == "relu"
    assert len(second["modes"]["corpus"]["xray"]["pas"]["assembly"]) == 8
