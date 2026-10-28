"""nextData · Persist : accroche à n−1 ou n−2, issue des échanges, table de l’archive."""

from __future__ import annotations

import random
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from synchro.app import create_app
from synchro.nextdata.panel import build_frame, normalized_draws
from synchro.nextdata.persist import (
    base_rates,
    memory,
    parse_persist,
    score_swaps,
    snap_grid,
    swaps_to_detect,
)


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


BEFORE = [
    {"date": "2026-09-29", "numbers": [3, 12, 25, 33, 47], "stars": [4, 9]},
    {"date": "2026-10-02", "numbers": [5, 14, 26, 40, 50], "stars": [2, 11]},
]


def test_memory_names_the_previous_draw_first() -> None:
    assert memory(BEFORE, "numbers") == {5: 1, 14: 1, 26: 1, 40: 1, 50: 1, 3: 2, 12: 2, 25: 2, 33: 2, 47: 2}
    both = [{"numbers": [1, 2], "stars": []}, {"numbers": [2, 3], "stars": []}]
    assert memory(both, "numbers") == {2: 1, 3: 1, 1: 2}


def test_the_nearest_ball_wins_and_n_minus_1_breaks_ties() -> None:
    snapped = snap_grid([7, 15, 24, 31, 44], [3, 8], BEFORE, radius=1, limit=1)
    assert snapped["numbers"] == [7, 14, 24, 31, 44]
    assert snapped["stars"] == [2, 8]
    assert snapped["swaps"] == [
        {"kind": "number", "from": 15, "to": 14, "lag": 1, "distance": 1},
        {"kind": "star", "from": 3, "to": 2, "lag": 1, "distance": 1},
    ]
    assert snapped["held"] == {"numbers": 0, "stars": 0}


def test_two_numbers_are_taken_from_two_different_balls() -> None:
    snapped = snap_grid([7, 15, 24, 31, 44], [6, 7], BEFORE, radius=2, limit=2)
    assert snapped["numbers"] == [7, 14, 25, 31, 44]
    assert [swap["to"] for swap in snapped["swaps"] if swap["kind"] == "number"] == [14, 25]
    assert len(set(snapped["numbers"])) == 5
    assert snapped["stars"] == [4, 7]
    assert [swap["to"] for swap in snapped["swaps"] if swap["kind"] == "star"] == [4]
    crowded = snap_grid([13, 15, 29, 30, 37], [1, 12], BEFORE, radius=1, limit=2)
    assert [(swap["from"], swap["to"]) for swap in crowded["swaps"] if swap["kind"] == "number"] == [(13, 14)]
    assert crowded["numbers"] == [14, 15, 29, 30, 37]
    assert crowded["stars"] == [2, 12]


def test_a_grid_that_already_repeats_does_not_move() -> None:
    snapped = snap_grid([5, 15, 24, 31, 44], [2, 8], BEFORE, radius=3, limit=1)
    assert snapped["numbers"] == [5, 15, 24, 31, 44]
    assert snapped["stars"] == [2, 8]
    assert snapped["swaps"] == []
    assert snapped["held"] == {"numbers": 1, "stars": 1}
    far = snap_grid([8, 19, 30, 37, 43], [6, 7], BEFORE, radius=1, limit=1)
    assert far["swaps"] == []
    assert far["numbers"] == [8, 19, 30, 37, 43]


def test_a_swap_is_scored_against_the_draw() -> None:
    swaps = [
        {"kind": "number", "from": 15, "to": 14, "lag": 1, "distance": 1},
        {"kind": "number", "from": 24, "to": 25, "lag": 2, "distance": 1},
        {"kind": "number", "from": 31, "to": 33, "lag": 2, "distance": 2},
        {"kind": "star", "from": 3, "to": 2, "lag": 1, "distance": 1},
    ]
    scored = score_swaps(swaps, [14, 24, 40, 41, 42], [3, 9])
    assert [item["outcome"] for item in scored] == ["gain", "loss", "neutral", "loss"]


def test_parse_persist_switches_off_and_refuses_bad_settings() -> None:
    assert parse_persist(None) is None
    assert parse_persist(False) is None
    assert parse_persist({"radius": 0}) is None
    assert parse_persist({"radius": 2}) == {"radius": 2, "limit": 1}
    assert parse_persist({"radius": "3", "limit": 2}) == {"radius": 3, "limit": 2}
    for bad in ({"radius": 4}, {"radius": 1, "limit": 0}, {"radius": 1, "limit": 3}, {"radius": True}, "±1"):
        with pytest.raises(ValueError):
            parse_persist(bad)


def test_base_rates_count_each_ball_by_its_distance() -> None:
    rows = [
        {"date": "2026-01-02", "numbers": [1, 2, 3, 4, 5], "stars": [1, 2], "star_pool": 12},
        {"date": "2026-01-06", "numbers": [10, 20, 30, 40, 50], "stars": [3, 4], "star_pool": 12},
        {"date": "2026-01-09", "numbers": [1, 11, 21, 33, 45], "stars": [1, 12], "star_pool": 12},
    ]
    table = base_rates(rows)
    assert table is not None
    assert table["draws"] == 1
    held = table["numbers"]["by_distance"][0]
    assert (held["drawn"], held["seen"]) == (1, 10)
    near = table["numbers"]["by_distance"][1]
    assert (near["drawn"], near["seen"]) == (2, 10)
    assert sum(item["seen"] for item in table["numbers"]["by_distance"]) == 50
    assert sum(item["drawn"] for item in table["numbers"]["by_distance"]) == 5
    assert table["numbers"]["at_least_one"]["observed"] == 1.0
    assert table["stars"]["by_distance"][0]["drawn"] == 1
    assert sum(item["seen"] for item in table["stars"]["by_distance"]) == 12
    assert table["any"]["observed"] == 1.0
    assert base_rates(rows[:2]) is None


def test_independent_draws_give_no_edge_to_a_repeated_ball() -> None:
    table = base_rates(normalized_draws(_draws(3000, start=date(2000, 1, 4), seed=21)))
    assert table is not None
    numbers = table["numbers"]
    assert numbers["chance"] == 0.1
    for cell in numbers["by_distance"]:
        assert cell["lo"] < cell["rate"] < cell["hi"]
        assert abs(cell["rate"] - 0.1) < 0.012
    for edge in numbers["edge"]:
        assert edge["lo"] < edge["value"] < edge["hi"]
        assert abs(edge["value"]) < 0.012
    assert abs(numbers["at_least_one"]["observed"] - numbers["at_least_one"]["chance"]) < 0.04
    assert abs(numbers["at_least_one"]["chance"] - 0.667) < 0.01
    assert abs(table["stars"]["chance"] - 2 / 12) < 1e-6
    assert abs(table["any"]["chance"] - 0.845) < 0.01
    assert 14000 < numbers["swaps_for_one_point"] < 15000
    assert swaps_to_detect(0.02, 5, 50) * 4 == pytest.approx(swaps_to_detect(0.01, 5, 50), rel=0.01)


def test_a_draw_without_star_pool_takes_the_pool_of_its_date() -> None:
    bare = [{key: value for key, value in draw.items() if key != "star_pool"} for draw in _draws(30, seed=35)]
    bare[-1]["stars"] = [3, 6]
    frame = build_frame(bare, focus=24)
    assert frame.star_pool == 12
    assert {row["star_pool"] for row in normalized_draws(bare)} == {12}
    old = [{"date": "2012-03-02", "numbers": [1, 2, 3, 4, 5], "stars": [1, 2]}]
    assert normalized_draws(old)[0]["star_pool"] == 11
    table = base_rates(normalized_draws(bare))
    assert table is not None
    assert abs(table["stars"]["chance"] - 2 / 12) < 1e-6
    assert sum(item["seen"] for item in table["stars"]["by_distance"]) == 12 * table["draws"]


def test_repetitions_count_numbers_and_stars_against_n_minus_1_and_n_minus_2() -> None:
    from synchro.nextdata.covariates import past_columns

    draws = _draws(30, seed=34)
    draws[-3].update(numbers=[1, 2, 3, 4, 5], stars=[1, 2])
    draws[-2].update(numbers=[1, 2, 30, 40, 50], stars=[2, 3])
    draws[-1].update(numbers=[1, 3, 4, 30, 41], stars=[1, 3])
    frame = build_frame(draws, focus=24)
    last = frame.rows[-1]
    assert last["repeat_count"] == 2.0
    assert last["repeat_count_2"] == 3.0
    assert last["star_repeat_count"] == 1.0
    assert last["star_repeat_count_2"] == 1.0
    assert frame.rows[0]["repeat_count"] == 0.0
    assert frame.rows[1]["repeat_count_2"] == 0.0
    assert past_columns(["repetitions"]) == [
        "repeat_count",
        "repeat_count_2",
        "star_repeat_count",
        "star_repeat_count_2",
    ]


def _band(mid: float) -> dict[str, float]:
    return {"lo": mid - 1, "mid": mid, "hi": mid + 1}


def _fake_moments(rows, horizon, **kwargs):
    """Bandes fixes, sauf la somme qui suit le nombre de tirages lus : chaque pas a sa grille."""
    del horizon
    bands = {
        "sum": _band(100 + len(rows) % 30),
        "parity": _band(2),
        "star_sum": _band(10),
        "spread": _band(35),
        "consecutive": _band(1),
        "star_consecutive": {"lo": 0, "mid": 0, "hi": 1},
        "n1": _band(6),
        "g1": _band(8),
        "g2": _band(8),
        "g3": _band(8),
        "g4": _band(8),
        "e1": _band(3),
        "e_gap": _band(4),
    }
    for rank, mid in zip(("n1", "n2", "n3", "n4", "n5", "e1", "e2"), (6, 15, 25, 34, 43, 3, 8)):
        bands[f"level:{rank}"] = _band(mid)
        bands[f"delta:{rank}"] = _band(0)
    return bands, [], kwargs.get("library", "lightgbm")


def _offline(monkeypatch) -> None:
    """LightGBM et CatBoost remplacés : les pas se calculent sans bibliothèque."""
    monkeypatch.setattr("synchro.nextdata.forecast.lightgbm_import_error", lambda: None)
    monkeypatch.setattr("synchro.nextdata.models.predict_moments", _fake_moments)
    monkeypatch.setattr("synchro.nextdata.steps.catboost_import_error", lambda: None)
    monkeypatch.setattr("synchro.nextdata.steps._installed", lambda module: False)


def _check_twin(raw: dict, twin: dict, before: list[dict], actual: dict, limit: int) -> None:
    recent = set(before[-1]["numbers"]) | set(before[-2]["numbers"])
    recent_stars = set(before[-1]["stars"]) | set(before[-2]["stars"])
    assert len(set(twin["numbers"])) == 5
    assert twin["numbers"] == sorted(twin["numbers"])
    raw_held = sum(1 for value in raw["numbers"] if value in recent)
    number_swaps = [swap for swap in twin["swaps"] if swap["kind"] == "number"]
    star_swaps = [swap for swap in twin["swaps"] if swap["kind"] == "star"]
    assert twin["held"]["numbers"] == raw_held
    assert len(number_swaps) <= max(0, limit - raw_held)
    assert len(star_swaps) <= max(0, 1 - sum(1 for value in raw["stars"] if value in recent_stars))
    for swap in twin["swaps"]:
        pool = recent if swap["kind"] == "number" else recent_stars
        assert swap["to"] in pool
        assert 1 <= swap["distance"] <= 3
        source = raw["numbers"] if swap["kind"] == "number" else raw["stars"]
        landed = twin["numbers"] if swap["kind"] == "number" else twin["stars"]
        assert swap["from"] in source and swap["to"] in landed
        drawn = set(actual["numbers"] if swap["kind"] == "number" else actual["stars"])
        expected = (
            "gain"
            if swap["to"] in drawn and swap["from"] not in drawn
            else "loss"
            if swap["from"] in drawn and swap["to"] not in drawn
            else "neutral"
        )
        assert swap["outcome"] == expected


def test_the_retour_scores_the_persist_twin_on_the_same_grid(monkeypatch) -> None:
    from synchro.nextdata.forecast import run_forecast

    _offline(monkeypatch)
    draws = _draws(40, seed=31)
    frame = build_frame(draws, focus=24)
    plain = run_forecast(draws, focus=24, covariates=["forme"], estimators=2, chunk=100)
    report = run_forecast(
        draws, focus=24, covariates=["forme"], estimators=2, chunk=100, persist={"radius": 3, "limit": 1}
    )
    assert plain["progress"]["complete"] is True and report["progress"]["complete"] is True
    bare, walked = plain["backtest"], report["backtest"]
    assert "corpus_persist" not in bare["rows"][0]
    assert "corpus_persist" not in bare["metrics"]
    assert walked["metrics"]["corpus_persist"]["mae"]["sum"] is not None
    assert walked["metrics"]["fenetre_catboost_persist"]["hits_numbers"] is not None
    by_date = {row["date"]: index for index, row in enumerate(frame.rows)}
    swapped = 0
    for step, raw in zip(walked["rows"], bare["rows"]):
        assert step["corpus"]["numbers"] == raw["corpus"]["numbers"]
        index = by_date[step["date"]]
        _check_twin(step["corpus"], step["corpus_persist"], frame.rows[:index], step["actual"], 1)
        swapped += len(step["corpus_persist"]["swaps"])
    assert swapped > 0


def test_each_shift_reading_gets_its_persist_twin(monkeypatch) -> None:
    from synchro.nextdata.forecast import run_training

    _offline(monkeypatch)
    draws = _draws(40, seed=32)
    frame = build_frame(draws, focus=24)
    report = run_training(
        draws, focus=24, covariates=["forme"], estimators=2, chunk=100, persist={"radius": 3, "limit": 2}
    )
    assert report["progress"]["complete"] is True
    assert [shift["x"] for shift in report["shifts"]] == list(range(1, 11))
    swapped = 0
    for shift in report["shifts"]:
        lag = shift["x"]
        before = frame.rows[:-lag]
        raw = shift["readings"]["corpus"]
        twin = shift["readings"]["corpus_persist"]
        assert "persistence_persist" not in shift["readings"]
        assert set(twin["errors"]) == set(raw["errors"])
        assert twin["errors"]["sum"] == round(sum(twin["numbers"]) - frame.rows[-lag]["sum"], 4)
        assert twin["in_band"] == raw["in_band"]
        assert twin["in_band_raw"] == raw["in_band_raw"]
        assert twin["calibrated"] == raw["calibrated"]
        assert twin["calibration_steps"] == raw["calibration_steps"]
        _check_twin(raw, twin, before, shift["actual"], 2)
        swapped += len(twin["swaps"])
    assert swapped > 0
    assert report["summary"]["corpus_persist"]["count"] == 10
    assert report["persist"]["base"]["draws"] == len(draws) - 2
    assert "recent" not in report["persist"]


def test_the_api_checks_persist_and_forwards_it(monkeypatch) -> None:
    captured: dict[str, object] = {}

    def fake(draws, **kwargs):
        del draws
        captured["persist"] = kwargs.get("persist")
        return {"ok": True, "shifts": [], "summary": {}}

    monkeypatch.setattr("synchro.nextdata.run_training", fake)
    client = TestClient(create_app())
    base = {"focus": 50, "shift": 1, "draws": _draws(30)}
    assert client.post("/api/nextdata/training", json={**base, "persist": {"radius": 5}}).status_code == 400
    assert client.post("/api/nextdata/training", json={**base, "persist": {"radius": 1, "limit": 3}}).status_code == 400
    assert client.post("/api/nextdata/forecast", json={"focus": 50, "persist": "±1", "draws": _draws(30)}).status_code == 400
    accepted = client.post("/api/nextdata/training", json={**base, "persist": {"radius": 2}})
    assert accepted.status_code == 200, accepted.text
    assert captured["persist"] == {"radius": 2, "limit": 1}
    client.post("/api/nextdata/training", json={**base, "persist": None})
    assert captured["persist"] is None


def test_forecast_shows_the_persist_grid_next_to_the_model_grid(monkeypatch) -> None:
    from synchro.nextdata.forecast import run_forecast

    _offline(monkeypatch)
    draws = _draws(36, seed=33)
    report = run_forecast(
        draws, focus=24, covariates=["forme"], estimators=2, chunk=100, persist={"radius": 3, "limit": 1}
    )
    assert report["ok"] is True, report.get("error")
    info = report["persist"]
    assert info["radius"] == 3 and info["limit"] == 1
    assert [item["lag"] for item in info["recent"]] == [1, 2]
    assert info["recent"][0]["date"] == draws[-1]["date"]
    assert info["base"]["draws"] == len(draws) - 2
    recent = set(draws[-1]["numbers"]) | set(draws[-2]["numbers"])
    for mode in ("corpus", "fenetre"):
        for block in (report["modes"][mode], report["modes"][mode]["catboost"]):
            twin = block["persist"]
            assert len(set(twin["grid"]["numbers"])) == 5
            assert twin["grid"]["numbers"] == sorted(twin["grid"]["numbers"])
            for swap in twin["swaps"]:
                if swap["kind"] == "number":
                    assert swap["from"] in block["grid"]["numbers"]
                    assert swap["to"] in recent
    assert "corpus_persist" in report["backtest"]["metrics"]
    assert "swaps" in report["backtest"]["rows"][0]["corpus_persist"]
    bare = run_forecast(draws, focus=24, covariates=["forme"], estimators=2, chunk=100)
    assert bare["persist"] is None
    assert bare["modes"]["corpus"]["persist"] is None
    assert bare["modes"]["corpus"]["grid"] == report["modes"]["corpus"]["grid"]
