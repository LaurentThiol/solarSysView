"""nextData : panel, base recomptée, projection, deux modes, routes."""

from __future__ import annotations

import random
from datetime import date, timedelta

from fastapi.testclient import TestClient

from synchro.app import create_app
from synchro.nextdata.backtest import walk_forward
from synchro.nextdata.covariates import consecutive_count, link_series, spread_of, star_couple_ago
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
from synchro.nextdata.project import beam, compose_ranks, project_numbers


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
    for row in frame.rows:
        assert row["spread"] == spread_of(row["numbers"])
        assert row["consecutive"] == consecutive_count(row["numbers"])
        assert row["star_spread"] == spread_of(row["stars"])
        assert row["star_spread"] == row["e_gap"]
        assert row["star_consecutive"] == consecutive_count(row["stars"])
        assert row["star_consecutive"] in (0.0, 1.0)


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


def test_projection_matches_spread_without_moving_the_sum() -> None:
    wide = {
        "n1": {"lo": 2, "mid": 4, "hi": 8},
        "g1": {"lo": 4, "mid": 8, "hi": 12},
        "g2": {"lo": 4, "mid": 8, "hi": 12},
        "g3": {"lo": 4, "mid": 8, "hi": 12},
        "g4": {"lo": 4, "mid": 10, "hi": 14},
        "sum": {"lo": 80, "mid": 100, "hi": 120},
    }
    before, _raw = project_numbers(wide)
    aimed = {**wide, "spread": {"lo": 18, "mid": 22, "hi": 26}}
    after, _raw = project_numbers(aimed)
    assert abs((after[-1] - after[0]) - 22) <= 1
    assert sum(after) == sum(before)
    assert after == sorted(after)
    assert len(set(after)) == 5


def test_compose_leaves_the_chain_without_evolution_models() -> None:
    moments = {
        "n1": {"lo": 4, "mid": 7, "hi": 11},
        "g1": {"lo": 3, "mid": 6, "hi": 10},
        "g2": {"lo": 4, "mid": 8, "hi": 12},
        "g3": {"lo": 3, "mid": 7, "hi": 11},
        "g4": {"lo": 5, "mid": 9, "hi": 14},
        "sum": {"lo": 90, "mid": 110, "hi": 130},
        "e1": {"lo": 1, "mid": 3, "hi": 5},
        "e_gap": {"lo": 1, "mid": 4, "hi": 6},
    }
    out, trace = compose_ranks(
        moments,
        {"n1": 5, "n2": 11, "n3": 19, "n4": 26, "n5": 35, "e1": 2, "e2": 6},
    )
    assert trace is None
    assert out is moments
    assert out["n1"]["mid"] == 7
    assert out["g1"]["mid"] == 6


def test_compose_clips_a_gap_and_keeps_ranks_increasing() -> None:
    def tight(mid: float) -> dict[str, float]:
        return {"lo": mid - 0.1, "mid": mid, "hi": mid + 0.1}

    moments = {
        "n1": {"lo": 1, "mid": 10, "hi": 40},
        "g1": {"lo": 1, "mid": 5, "hi": 8},
        "g2": {"lo": 1, "mid": 5, "hi": 8},
        "g3": {"lo": 1, "mid": 5, "hi": 8},
        "g4": {"lo": 1, "mid": 5, "hi": 8},
        "sum": {"lo": 80, "mid": 100, "hi": 120},
        "star_sum": {"lo": 4, "mid": 7, "hi": 12},
        "e1": {"lo": 1, "mid": 2, "hi": 6},
        "e_gap": {"lo": 1, "mid": 3, "hi": 4},
        "level:n1": tight(10),
        "level:n2": tight(30),
        "level:n3": tight(36),
        "level:n4": tight(42),
        "level:n5": tight(48),
        "level:e1": tight(2),
        "level:e2": tight(9),
        "delta:n1": {"lo": -1, "mid": 0, "hi": 1},
        "delta:n2": {"lo": -1, "mid": 0, "hi": 1},
        "delta:n3": {"lo": -1, "mid": 0, "hi": 1},
        "delta:n4": {"lo": -1, "mid": 0, "hi": 1},
        "delta:n5": {"lo": -1, "mid": 0, "hi": 1},
        "delta:e1": {"lo": -1, "mid": 0, "hi": 1},
        "delta:e2": {"lo": -1, "mid": 0, "hi": 1},
    }
    previous = {"n1": 10, "n2": 30, "n3": 36, "n4": 42, "n5": 48, "e1": 2, "e2": 9}
    out, trace = compose_ranks(moments, previous)
    assert moments["n1"]["mid"] == 10
    assert moments["g1"]["mid"] == 5
    assert trace is not None
    assert [row["rank"] for row in trace["numbers"]] == ["n1", "n2", "n3", "n4", "n5"]
    assert [row["name"] for row in trace["gaps"]] == ["g1", "g2", "g3", "g4"]
    assert [row["rank"] for row in trace["stars"]] == ["e1", "e2"]
    assert trace["star_gap"]["name"] == "e_gap"
    assert trace["gaps"][0]["hit"] is True
    assert trace["gaps"][0]["clipped"] <= 8
    held = [row["clipped"] for row in trace["numbers"]]
    assert held == sorted(held)
    assert all(held[index + 1] - held[index] >= 1 for index in range(4))
    assert abs(out["g1"]["mid"] - trace["gaps"][0]["clipped"]) < 1e-6
    assert abs(out["n1"]["mid"] - trace["numbers"][0]["clipped"]) < 1e-6
    weights = trace["numbers"][1]["weights"]
    assert weights["level"] > weights["chain"]
    assert weights["chain"] >= 0.04
    assert abs(sum(weights.values()) - 1) < 0.02
    assert trace["sum_target"] == 100


def test_rank_bands_add_in_quadrature_and_stay_in_range() -> None:
    from synchro.nextdata.forecast import _rank_view
    from synchro.nextdata.project import NUMBER_BOUNDS, rank_scales

    gap = {"lo": 1, "mid": 7, "hi": 18}
    moments = {
        "n1": {"lo": 2, "mid": 7, "hi": 17},
        "g1": gap,
        "g2": gap,
        "g3": gap,
        "g4": gap,
        "e1": {"lo": 1, "mid": 3, "hi": 7},
        "e_gap": {"lo": 1, "mid": 4, "hi": 9},
    }
    view = _rank_view(moments)
    assert view["n1"] == {"lo": 2, "mid": 7, "hi": 17}
    # n5 : 7 + 4 × 7 = 35, √(5² + 4 × 6²) = 13 sous la médiane, √(10² + 4 × 11²) ≈ 24 au-dessus, borné à 50.
    assert view["n5"] == {"lo": 22, "mid": 35, "hi": 50}
    for rank, (low, high) in enumerate(NUMBER_BOUNDS, start=1):
        band = view[f"n{rank}"]
        assert low <= band["lo"] <= band["mid"] <= band["hi"] <= high
    assert view["e1"] == {"lo": 1, "mid": 3, "hi": 7}
    assert 2 <= view["e2"]["lo"] <= view["e2"]["mid"] == 7 <= view["e2"]["hi"] <= 12
    mids, scales, _ = rank_scales(moments)
    assert mids == [view[f"n{rank}"]["mid"] for rank in range(1, 6)]
    assert scales[0] == 15
    assert scales[-1] == 28


def test_score_follows_predicted_spread_and_consecutive() -> None:
    from synchro.nextdata.project import score_grid

    def wide(mid: float) -> dict[str, float]:
        return {"lo": mid - 80, "mid": mid, "hi": mid + 80}

    tight = [8, 9, 10, 11, 12]
    loose = [8, 16, 24, 32, 40]
    moments = {
        "n1": wide(8),
        "g1": wide(8),
        "g2": wide(8),
        "g3": wide(8),
        "g4": wide(8),
        "sum": wide(50),
        "parity": wide(2),
        "e1": wide(2),
        "e_gap": wide(3),
        "star_sum": wide(7),
        "spread": {"lo": 3, "mid": 4, "hi": 5},
        "consecutive": {"lo": 3, "mid": 4, "hi": 4},
        "star_consecutive": {"lo": 0, "mid": 1, "hi": 1},
    }
    base = {
        "draw_count": 40,
        "number_counts": {},
        "star_counts": {},
        "pair_counts": {},
        "triple_counts": {},
        "star_pool": 12,
    }
    close = score_grid(tight, [3, 4], moments, base)
    far = score_grid(loose, [3, 8], moments, base)
    bare = {
        key: value
        for key, value in moments.items()
        if key not in ("spread", "consecutive", "star_consecutive")
    }
    close_bare = score_grid(tight, [3, 4], bare, base)
    far_bare = score_grid(loose, [3, 8], bare, base)
    assert close - far > (close_bare - far_bare) + 5


def test_lightgbm_predict_does_not_reopen_the_openmp_pool(monkeypatch) -> None:
    """predict sans num_threads remet OpenMP à tous les cœurs et SIGSEGV sur Mac."""
    import sys
    import types

    import numpy as np

    from synchro.nextdata import forecast as forecast_mod

    calls: dict[str, int | None] = {}

    class _Lib:
        def LGBM_SetMaxThreads(self, count: int) -> int:
            calls["max_threads"] = count
            return 0

    class _Booster:
        def predict(self, row: np.ndarray, num_threads: int | None = None) -> np.ndarray:
            del row
            calls["predict_threads"] = num_threads
            return np.asarray([4.0])

    def train(params: dict, dataset: object, num_boost_round: int) -> _Booster:
        del dataset, num_boost_round
        calls["train_threads"] = params["num_threads"]
        return _Booster()

    fake = types.ModuleType("lightgbm")
    fake.Dataset = lambda *args, **kwargs: object()  # type: ignore[attr-defined]
    fake.train = train  # type: ignore[attr-defined]
    fake.basic = types.SimpleNamespace(_LIB=_Lib())  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "lightgbm", fake)
    monkeypatch.setattr(forecast_mod, "_LIGHTGBM_PINNED", False)

    x = np.arange(12, dtype=float).reshape(12, 1)
    y = np.linspace(2.0, 9.0, 12)
    pred, model = forecast_mod._fit_one(
        x,
        y,
        np.ones(12),
        np.asarray([3.0]),
        alpha=0.5,
        estimators=4,
        library="lightgbm",
    )
    assert pred == 4.0
    assert isinstance(model, _Booster)
    assert calls["train_threads"] == 1
    assert calls["predict_threads"] == 1
    assert calls["max_threads"] == 1


def test_darts_lightgbm_stays_single_threaded(monkeypatch) -> None:
    import sys
    import types

    from synchro.nextdata.forecast import try_darts_medians

    captured: dict[str, int] = {}

    class LightGBMModel:
        def __init__(self, **kwargs: object) -> None:
            captured["n_jobs"] = int(kwargs["n_jobs"])  # type: ignore[arg-type]
            raise RuntimeError("arrêt après le constructeur")

    models = types.ModuleType("darts.models")
    models.LightGBMModel = LightGBMModel  # type: ignore[attr-defined]
    darts_mod = types.ModuleType("darts")

    class TimeSeries:
        @staticmethod
        def from_values(values: object) -> object:
            return values

    darts_mod.TimeSeries = TimeSeries  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "darts", darts_mod)
    monkeypatch.setitem(sys.modules, "darts.models", models)

    draws = _draws(40, seed=1)
    frame = build_frame(draws, focus=24)
    assert try_darts_medians(frame.rows, frame.horizon, mode="corpus", focus=frame.focus, families=["forme"]) is None
    assert captured["n_jobs"] == 1


def test_darts_reads_corpus_weights_and_predicts_a_median(monkeypatch) -> None:
    """Le faux Darts refuse des poids hors TimeSeries, comme darts 0.41."""
    import sys
    import types

    import numpy as np

    from synchro.nextdata.forecast import try_darts_medians

    seen: dict[str, object] = {}

    class TimeSeries:
        def __init__(self, values: object) -> None:
            self._values = np.asarray(values, dtype=float)

        @staticmethod
        def from_values(values: object) -> "TimeSeries":
            return TimeSeries(values)

        def values(self) -> np.ndarray:
            return self._values

    class LightGBMModel:
        def __init__(self, **kwargs: object) -> None:
            seen["kwargs"] = kwargs

        def fit(self, series, past_covariates=None, future_covariates=None, sample_weight=None) -> None:
            del series, past_covariates, future_covariates
            if sample_weight is not None and not isinstance(sample_weight, TimeSeries):
                raise ValueError("input series must be of type `TimeSeries`")
            seen["weights"] = sample_weight

        def predict(self, n, series, past_covariates=None, future_covariates=None) -> TimeSeries:
            del n, past_covariates, future_covariates
            return TimeSeries(series.values()[-1:])

    models = types.ModuleType("darts.models")
    models.LightGBMModel = LightGBMModel  # type: ignore[attr-defined]
    darts_mod = types.ModuleType("darts")
    darts_mod.TimeSeries = TimeSeries  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "darts", darts_mod)
    monkeypatch.setitem(sys.modules, "darts.models", models)

    frame = build_frame(_draws(60, seed=14), focus=24)
    corpus = try_darts_medians(frame.rows, frame.horizon, mode="corpus", focus=frame.focus, families=["forme"])
    assert corpus is not None
    assert seen["kwargs"]["likelihood"] == "quantile"  # type: ignore[index]
    assert seen["kwargs"]["quantiles"] == [0.5]  # type: ignore[index]
    weights = seen["weights"].values().reshape(-1)  # type: ignore[union-attr]
    assert len(weights) == len(frame.rows)
    assert set(weights[-frame.focus :]) == {3.0}
    assert set(weights[: -frame.focus]) == {1.0}
    window = try_darts_medians(frame.rows, frame.horizon, mode="fenetre", focus=frame.focus, families=["forme"])
    assert window is not None
    assert seen["weights"] is None


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


def test_shift_hides_the_draw_it_scores(monkeypatch) -> None:
    from synchro.nextdata.backtest import _covers, _signed, shift_report
    from synchro.nextdata.forecast import predict_moments
    from synchro.nextdata.panel import build_frame

    assert _signed(12, 10) == 2
    assert _signed(8, 10) == -2
    assert _covers(10, {"lo": 9, "mid": 10, "hi": 11}) is True
    assert _covers(12, {"lo": 9, "mid": 10, "hi": 11}) is False

    draws = _draws(40, seed=8)
    frame = build_frame(draws, focus=24)
    seen: list[dict[str, str | int]] = []
    real = predict_moments

    def spy(rows, horizon, **kwargs):
        seen.append({"n": len(rows), "last": rows[-1]["date"], "target": horizon[0]["date"]})
        return real(rows, horizon, **kwargs)

    monkeypatch.setattr("synchro.nextdata.backtest.predict_moments", spy)
    report = shift_report(frame, ["forme"], estimators=2, libraries=("lightgbm",), quantiles=(0.5,))
    assert [shift["x"] for shift in report["shifts"]] == list(range(1, 11))
    assert report["shifts"][0]["date"] == frame.rows[-1]["date"]
    assert all(str(item["last"]) < str(item["target"]) for item in seen)
    assert any(item["n"] == len(frame.rows) - 1 for item in seen)
    errors = report["shifts"][0]["readings"]["corpus"]["errors"]
    shift_path = report["shifts"][0]["readings"]["corpus"]["arbitration"]
    assert [row["rank"] for row in shift_path["numbers"]] == ["n1", "n2", "n3", "n4", "n5"]
    assert [row["name"] for row in shift_path["gaps"]] == ["g1", "g2", "g3", "g4"]
    assert shift_path["stars"][0]["rank"] == "e1"
    assert shift_path["stars"][1]["rank"] == "e2"
    assert isinstance(errors["sum"], float)
    assert isinstance(errors["n1"], float)
    assert isinstance(errors["spread"], float)
    assert isinstance(errors["consecutive"], float)
    assert isinstance(errors["star_spread"], float)
    assert isinstance(errors["star_consecutive"], float)
    assert "persistence" in report["summary"]
    assert report["summary"]["corpus"]["mae_sum"] is not None


def test_one_shift_stops_before_the_scored_draw(monkeypatch) -> None:
    from synchro.nextdata.backtest import shift_report

    draws = _draws(40, seed=9)
    frame = build_frame(draws, focus=24)
    seen: list[tuple[int, str, str]] = []

    def spy(rows, horizon, **kwargs):
        del kwargs
        seen.append((len(rows), rows[-1]["date"], horizon[0]["date"]))
        raise RuntimeError("un seul décalage, sans entraîner")

    monkeypatch.setattr("synchro.nextdata.backtest.predict_moments", spy)
    report = shift_report(frame, ["forme"], estimators=2, libraries=("lightgbm",), quantiles=(0.5,), only=1)
    assert [shift["x"] for shift in report["shifts"]] == [1]
    assert report["shifts"][0]["date"] == frame.rows[-1]["date"]
    assert seen
    assert all(count == len(frame.rows) - 1 and last < target for count, last, target in seen)
    assert report["summary"]["persistence"]["count"] == 1


def test_training_shift_is_one_through_ten(monkeypatch) -> None:
    captured: dict[str, int | None] = {}

    def fake(draws, **kwargs):
        del draws
        captured["shift"] = kwargs.get("shift")
        return {"ok": True, "shifts": [{"x": kwargs.get("shift")}], "summary": {}}

    monkeypatch.setattr("synchro.nextdata.run_training", fake)
    client = TestClient(create_app())
    refused = client.post("/api/nextdata/training", json={"focus": 50, "shift": 0, "draws": _draws(30)})
    assert refused.status_code == 400
    garbled = client.post("/api/nextdata/training", json={"focus": 50, "shift": "deux", "draws": _draws(30)})
    assert garbled.status_code == 400
    accepted = client.post("/api/nextdata/training", json={"focus": 50, "shift": 3, "draws": _draws(30)})
    assert accepted.status_code == 200, accepted.text
    assert captured["shift"] == 3
    assert accepted.json()["shifts"][0]["x"] == 3


def _band(mid: float) -> dict[str, float]:
    return {"lo": mid - 1, "mid": mid, "hi": mid + 1}


def test_chronos_blends_lightgbm_and_leaves_catboost(monkeypatch) -> None:
    from synchro.nextdata.backtest import shift_report

    draws = _draws(40, seed=11)
    frame = build_frame(draws, focus=24)
    calls: list[str] = []

    def fake_moments(rows, horizon, **kwargs):
        del rows, horizon
        calls.append(kwargs["library"])
        return (
            {
                "sum": _band(30),
                "parity": _band(2),
                "star_sum": _band(6),
                "n1": _band(5),
                "g1": _band(6),
                "g2": _band(6),
                "g3": _band(6),
                "g4": _band(6),
                "e1": _band(2),
                "e_gap": _band(3),
            },
            [],
            kwargs["library"],
        )

    monkeypatch.setattr("synchro.nextdata.backtest.predict_moments", fake_moments)
    monkeypatch.setattr("synchro.nextdata.backtest.chronos_point", lambda values: 180.0)
    plain = shift_report(
        frame, ["forme"], estimators=2, libraries=("lightgbm", "catboost"), quantiles=(0.5,), only=1
    )
    calls.clear()
    mixed = shift_report(
        frame,
        ["forme"],
        estimators=2,
        libraries=("lightgbm", "catboost"),
        quantiles=(0.5,),
        only=1,
        with_chronos=True,
    )
    plain_sum = sum(plain["shifts"][0]["readings"]["corpus"]["numbers"])
    mixed_sum = sum(mixed["shifts"][0]["readings"]["corpus"]["numbers"])
    assert mixed_sum > plain_sum
    assert mixed["shifts"][0]["readings"]["corpus_catboost"]["numbers"] == plain["shifts"][0]["readings"]["corpus_catboost"]["numbers"]
    assert mixed["shifts"][0]["readings"]["corpus"]["chronos"]["available"] is True
    assert mixed["chronos"]["used"] is True
    assert plain["chronos"]["requested"] is False
    assert calls.count("lightgbm") == 4
    assert calls.count("catboost") == 2


def _flat_moments(rows, horizon, **kwargs):
    del rows, horizon
    bands = {
        "sum": _band(30),
        "parity": _band(2),
        "star_sum": _band(6),
        "n1": _band(5),
        "g1": _band(6),
        "g2": _band(6),
        "g3": _band(6),
        "g4": _band(6),
        "e1": _band(2),
        "e_gap": _band(3),
    }
    return bands, [], kwargs.get("library", "lightgbm")


def test_shift_chronos_blends_the_forecast_of_the_scored_draw(monkeypatch) -> None:
    """Chronos rejoue son dernier point : sa prévision du tirage noté est le tirage juste avant."""
    from synchro.nextdata.backtest import _blend_shift_chronos

    frame = build_frame(_draws(40, seed=12), focus=24)
    prefix = frame.rows[:-1]
    assert prefix[-1]["sum"] != prefix[-2]["sum"]
    monkeypatch.setattr("synchro.nextdata.backtest.predict_moments", _flat_moments)
    monkeypatch.setattr("synchro.nextdata.backtest.chronos_point", lambda values: values[-1])
    monkeypatch.setattr("synchro.nextdata.backtest.blend_weight", lambda lgb, chronos: 0.0)
    moments = {"sum": _band(120), "star_sum": _band(10), "n1": _band(9)}
    note = _blend_shift_chronos(
        moments,
        prefix,
        frame.rows[-1],
        mode="corpus",
        focus=24,
        families=["forme"],
        estimators=2,
        star_pool=12,
    )
    assert note["available"] is True
    assert moments["sum"]["mid"] == prefix[-1]["sum"]
    assert moments["n1"]["mid"] == prefix[-1]["n1"]
    assert note["holdout_mae_chronos"] == round(abs(prefix[-2]["sum"] - prefix[-1]["sum"]), 4)


def test_forecast_chronos_blends_the_next_draw(monkeypatch) -> None:
    """Même Chronos : la valeur mélangée au prochain tirage est le dernier tirage connu."""
    from synchro.nextdata import forecast as forecast_mod

    frame = build_frame(_draws(40, seed=13), focus=24)
    assert frame.rows[-1]["sum"] != frame.rows[-2]["sum"]
    monkeypatch.setattr(forecast_mod, "chronos_point", lambda values: values[-1])
    monkeypatch.setattr(forecast_mod, "blend_weight", lambda lgb, chronos: 0.0)

    def book() -> dict:
        return {mode: {"sum": _band(120), "star_sum": _band(10), "n1": _band(9)} for mode in ("corpus", "fenetre")}

    walked = {"rows": [{"date": frame.rows[-1]["date"], "corpus": {"sum": 118.0}, "fenetre": {"sum": 131.0}}]}
    moments = book()
    info = forecast_mod._blend_chronos(frame, moments, walked)
    assert info["used"] is True
    for mode in ("corpus", "fenetre"):
        assert moments[mode]["sum"]["mid"] == frame.rows[-1]["sum"]
        assert info[mode]["holdout_mae_chronos"] == round(abs(frame.rows[-2]["sum"] - frame.rows[-1]["sum"]), 4)
    unscored = forecast_mod._blend_chronos(frame, book(), {"rows": []})
    assert unscored["used"] is False


def test_training_forwards_chronos_flag(monkeypatch) -> None:
    captured: dict[str, bool] = {}

    def fake(draws, **kwargs):
        del draws
        captured["with_chronos"] = kwargs.get("with_chronos")
        return {"ok": True, "shifts": [], "summary": {}}

    monkeypatch.setattr("synchro.nextdata.run_training", fake)
    client = TestClient(create_app())
    client.post("/api/nextdata/training", json={"focus": 50, "shift": 1, "with_chronos": True, "draws": _draws(30)})
    assert captured["with_chronos"] is True
    client.post("/api/nextdata/training", json={"focus": 50, "shift": 1, "with_chronos": False, "draws": _draws(30)})
    assert captured["with_chronos"] is False


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
    arbitration = report["modes"]["corpus"]["arbitration"]
    assert [row["rank"] for row in arbitration["numbers"]] == ["n1", "n2", "n3", "n4", "n5"]
    assert [row["name"] for row in arbitration["gaps"]] == ["g1", "g2", "g3", "g4"]
    assert [row["rank"] for row in arbitration["stars"]] == ["e1", "e2"]
    assert arbitration["star_gap"]["name"] == "e_gap"
    assert arbitration["sum_grid"] == sum(report["modes"]["corpus"]["grid"]["numbers"])
    assert report["backtest"]["rows"][0]["corpus"]["arbitration"]["numbers"]
    assert "spread" in report["modes"]["corpus"]["quantiles"]
    assert "consecutive" in report["modes"]["corpus"]["quantiles"]
    assert "star_spread" in report["modes"]["corpus"]["quantiles"]
    assert "star_consecutive" in report["modes"]["corpus"]["quantiles"]
    assert report["chart"][0]["kind"] == "history"
    assert report["chart"][0]["spread"] is not None
    assert report["chart"][0]["star_spread"] is not None
    assert report["chart"][0]["consecutive"] is not None
    assert report["backtest"]["rows"][0]["actual"]["spread"] == spread_of(report["backtest"]["rows"][0]["actual"]["numbers"])
    assert report["chart"][-1]["spread_corpus"] == spread_of(report["modes"]["corpus"]["grid"]["numbers"])
    assert report["chart"][-1]["star_spread_corpus"] == spread_of(report["modes"]["corpus"]["grid"]["stars"])
    assert report["chart"][-1]["star_consecutive_corpus"] is not None
    assert report["backtest"]["metrics"]["corpus"]["mae"]["consecutive"] is not None
    assert report["backtest"]["metrics"]["corpus"]["mae"]["star_spread"] is not None
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
