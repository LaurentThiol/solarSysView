"""nextData : panel, base recomptée, projection, deux modes, routes."""

from __future__ import annotations

import random
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from synchro.app import create_app
from synchro.nextdata.covariates import consecutive_count, link_series, spread_of, star_couple_ago
from synchro.nextdata.empirical import recount, smoothed_share
from synchro.nextdata.forecast import (
    _past_only_column,
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


def test_link_features_do_not_grow_with_history() -> None:
    import numpy as np

    from synchro.nextdata.covariates import AGO_CAP

    rng = random.Random(5)
    pools = [sorted(rng.sample(range(1, 51), 5)) for _ in range(312)]
    stars = [sorted(rng.sample(range(1, 13), 2)) for _ in range(312)]
    couples = link_series(pools, 2)
    triples = link_series(pools, 3)
    for name in ("couple_ago_mean", "couple_ago_min", "triple_ago_mean", "triple_ago_min"):
        values = couples.get(name) or triples[name]
        assert max(values) <= AGO_CAP
    assert max(star_couple_ago(stars)) <= AGO_CAP
    early, late = slice(40, 100), slice(252, 312)
    for name in ("couple_count_mean", "couple_affinity_mean"):
        values = np.asarray(couples[name])
        assert abs(values[early].mean() - values[late].mean()) < 0.003
        assert values.max() < 0.2
    ago = np.asarray(couples["couple_ago_mean"][16:])
    ranks = np.argsort(np.argsort(ago))
    assert abs(np.corrcoef(ranks, np.arange(len(ago)))[0, 1]) < 0.3


def test_year_n_stays_in_the_corpus() -> None:
    draws = _draws(150, start=date(2024, 1, 2))
    last = draws[-1]["date"]
    assert last.startswith("2025")
    frame = build_frame(draws, years=["n-1", "n-2"], focus=50)
    assert frame.years == ["n", "n-1", "n-2"]
    assert frame.years_present == ["n", "n-1"]
    assert frame.rows[-1]["date"] == last
    assert frame.next_date > last
    assert build_frame(draws, years=[], focus=50).years == ["n", "n-1", "n-2"]
    assert build_frame(draws, years=["n-1"], focus=50).years == ["n", "n-1"]


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


def test_star_pool_follows_the_draw_date_when_it_is_missing() -> None:
    draws = [{key: value for key, value in draw.items() if key != "star_pool"} for draw in _draws(40, seed=21)]
    draws[-1] = {**draws[-1], "stars": [3, 7]}
    assert build_frame(draws, focus=24).star_pool == 12
    old = [{key: value for key, value in draw.items() if key != "star_pool"} for draw in _draws(30, start=date(2014, 1, 3))]
    old[-1] = {**old[-1], "stars": [2, 5]}
    assert build_frame(old, focus=24).star_pool == 11


def test_window_loss_ignores_the_three_year_prefix() -> None:
    lags, past = lag_choice(160)
    assert (lags, past) == (16, 8)
    assert lag_choice(220) == (16, 8)
    assert lag_choice(40) == (10, 8)
    focus_start = 110
    window = loss_indices(160, lags, focus_start, "fenetre")
    assert window == list(range(focus_start, 160))
    assert loss_indices(320, lags, 220, "fenetre") == list(range(220, 320))
    assert len(loss_indices(60, lags, 10, "fenetre")) == 60 - lags
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
    assert weights["chain"] == 0
    assert weights["level"] > weights["delta"] > 0
    assert abs(sum(weights.values()) - 1) < 0.02
    assert trace["numbers"][1]["chain"] == 15
    assert trace["numbers"][1]["blend"] == 30
    assert trace["sum_target"] == 100


def test_direct_ranks_are_not_pulled_down_by_the_chain() -> None:
    """Sept partout dans la chaîne donne n5 = 35 ; la prévision directe dit 44, la grille la suit."""
    from synchro.nextdata.project import project_numbers

    gap = {"lo": 1, "mid": 7, "hi": 18}
    moments = {
        "n1": {"lo": 2, "mid": 7, "hi": 17},
        "g1": gap,
        "g2": gap,
        "g3": gap,
        "g4": gap,
        "sum": {"lo": 90, "mid": 128, "hi": 165},
        "spread": {"lo": 25, "mid": 37, "hi": 46},
        "e1": {"lo": 1, "mid": 3, "hi": 7},
        "e_gap": {"lo": 1, "mid": 4, "hi": 9},
    }
    for rank, (lo, mid, hi) in zip(
        ("n1", "n2", "n3", "n4", "n5", "e1", "e2"),
        ((2, 7, 17), (7, 16, 28), (14, 26, 37), (23, 35, 45), (34, 44, 49), (1, 3, 7), (5, 9, 12)),
    ):
        moments[f"level:{rank}"] = {"lo": lo, "mid": mid, "hi": hi}
    out, trace = compose_ranks(moments, None)
    assert [row["chain"] for row in trace["numbers"]] == [7, 14, 21, 28, 35]
    assert [row["clipped"] for row in trace["numbers"]] == [7, 16, 26, 35, 44]
    assert all(row["weights"] == {"chain": 0.0, "level": 1.0, "delta": 0.0} for row in trace["numbers"])
    numbers, _raw = project_numbers(out)
    assert numbers == [7, 16, 26, 35, 44]


def test_sum_and_spread_nudges_share_the_correction() -> None:
    from synchro.nextdata.project import NUMBER_BOUNDS, _nudge_spread, _nudge_sum

    lo = [low for low, _high in NUMBER_BOUNDS]
    hi = [high for _low, high in NUMBER_BOUNDS]
    start = [8, 18, 28, 38, 48]
    scales = [13, 18, 19, 17, 13]
    lowered = _nudge_sum(start, 120, lo, hi, start, scales)
    assert sum(lowered) == 120
    assert lowered == [5, 13, 23, 34, 45]
    assert min(b - a for a, b in zip(lowered, lowered[1:])) >= 8
    assert _nudge_sum(start, 120, lo, hi) != [1, 5, 28, 38, 48]
    narrowed = _nudge_spread(start, 34, lo, hi, start, scales)
    assert sum(narrowed) == sum(start)
    assert narrowed[-1] - narrowed[0] == 34
    assert narrowed == sorted(narrowed)
    assert min(b - a for a, b in zip(narrowed, narrowed[1:])) >= 6


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
    """Les deux modes passent des poids TimeSeries : 3 sur le focus en corpus, 0 puis 1 en fenêtre."""
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
    window_weights = seen["weights"].values().reshape(-1)  # type: ignore[union-attr]
    # Quinze tirages de contexte avant le focus, poids 0, puis le focus à 1.
    assert window_weights[:15].tolist() == [0.0] * 15
    assert set(window_weights[15:].tolist()) == {1.0}


def test_status_does_not_import_darts_or_torch() -> None:
    import sys

    from synchro.nextdata.forecast import dependency_status, lightgbm_hint

    before = set(sys.modules)
    status = dependency_status()
    loaded = set(sys.modules) - before
    blocked = [name for name in loaded if name == "darts" or name.startswith(("darts.", "chronos", "torch"))]
    assert blocked == []
    assert status["chronos_error"] is None
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
        with_chronos=False,
        chunk=4,
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
    from synchro.nextdata.backtest import _covers, _signed
    from synchro.nextdata.forecast import run_training

    assert _signed(12, 10) == 2
    assert _signed(8, 10) == -2
    assert _covers(10, {"lo": 9, "mid": 10, "hi": 11}) is True
    assert _covers(12, {"lo": 9, "mid": 10, "hi": 11}) is False

    draws = _draws(40, seed=8)
    frame = build_frame(draws, focus=24)
    seen: list[dict] = []
    _offline(monkeypatch, calls=seen)
    report = run_training(draws, focus=24, covariates=["forme"], estimators=2, chunk=100)
    assert report["progress"]["complete"] is True
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
    from synchro.nextdata.forecast import run_training

    draws = _draws(40, seed=9)
    frame = build_frame(draws, focus=24)
    seen: list[tuple[int, str, str]] = []

    def failing(rows, horizon, **kwargs):
        del kwargs
        seen.append((len(rows), rows[-1]["date"], horizon[0]["date"]))
        raise RuntimeError("un seul décalage, sans entraîner")

    _offline(monkeypatch, moments=failing)
    report = run_training(draws, focus=24, covariates=["forme"], estimators=2, shift=1)
    assert [shift["x"] for shift in report["shifts"]] == [1]
    assert report["shifts"][0]["date"] == frame.rows[-1]["date"]
    assert seen
    assert all(count == len(frame.rows) - 1 and last < target for count, last, target in seen)
    assert report["summary"]["persistence"]["count"] == 1


def test_shift_scores_the_mean_of_earlier_sums(monkeypatch) -> None:
    from synchro.nextdata.forecast import run_training

    draws = _draws(40, seed=15)
    frame = build_frame(draws, focus=24)
    _offline(monkeypatch)
    report = run_training(draws, focus=24, covariates=["forme"], estimators=2, shift=3)
    mean = report["shifts"][0]["readings"]["mean"]
    prefix = frame.rows[:-3]
    expected = sum(row["sum"] for row in prefix) / len(prefix) - frame.rows[-3]["sum"]
    assert mean["errors"]["sum"] == round(expected, 4)
    assert mean["errors"]["n1"] is None
    assert mean["hits_numbers"] is None
    assert report["summary"]["mean"]["mae_sum"] == round(abs(expected), 4)


def test_shift_summary_carries_its_95_margins(monkeypatch) -> None:
    from synchro.nextdata.forecast import run_training

    draws = _draws(40, seed=8)
    _offline(monkeypatch)
    report = run_training(
        draws, focus=24, covariates=["forme"], estimators=2, chunk=100, persist={"radius": 2, "limit": 1}
    )
    summary = report["summary"]
    corpus = summary["corpus"]
    interval = corpus["mae_sum_ci"]
    assert interval["count"] == corpus["count"] == 10
    assert 0 <= interval["lo"] <= interval["value"] == corpus["mae_sum"] <= interval["hi"]
    assert {"mean", "persistence", "fenetre"} <= set(corpus["versus"])
    assert not any(key.endswith("_persist") or key == "corpus" for key in corpus["versus"])
    assert all(gap["verdict"] in {"lower", "higher", "undecided"} and gap["count"] == 10 for gap in corpus["versus"].values())
    pairs = [(shift["readings"]["corpus"]["errors"]["sum"], shift["readings"]["mean"]["errors"]["sum"]) for shift in report["shifts"]]
    assert corpus["versus"]["mean"]["value"] == pytest.approx(sum(abs(a) - abs(b) for a, b in pairs) / len(pairs), abs=1e-4)
    numbers, stars = corpus["hits_chance"]["numbers"], corpus["hits_chance"]["stars"]
    assert (numbers["expected"], numbers["lo"], numbers["hi"], numbers["count"]) == (0.5, 0.1, 0.9, 10)
    assert stars["expected"] == round(4 / 12, 4)
    assert numbers["observed"] == corpus["hits_numbers"]
    assert stars["observed"] == corpus["hits_stars"]
    assert "mean" not in summary["mean"]["versus"] and "persistence" in summary["mean"]["versus"]
    assert summary["mean"]["hits_chance"] == {"numbers": None, "stars": None}
    assert {"corpus", "mean", "persistence"} <= set(summary["corpus_persist"]["versus"])


def test_retour_metrics_carry_their_95_margins(monkeypatch) -> None:
    draws = _draws(40, seed=8)
    _offline(monkeypatch)
    report = run_forecast(
        draws, focus=24, covariates=["forme"], estimators=2, chunk=100, persist={"radius": 2, "limit": 1}
    )
    walked = report["backtest"]
    metrics = walked["metrics"]
    corpus = metrics["corpus"]
    interval = corpus["mae_sum_ci"]
    assert interval["count"] == walked["draw_count"] == len(walked["rows"])
    assert interval["lo"] <= corpus["mae"]["sum"] <= interval["hi"]
    gaps = [
        abs(row["corpus"]["sum"] - row["actual"]["sum"]) - abs(row["mean"]["sum"] - row["actual"]["sum"])
        for row in walked["rows"]
    ]
    assert corpus["versus"]["mean"]["value"] == pytest.approx(sum(gaps) / len(gaps), abs=1e-3)
    assert corpus["versus"]["mean"]["count"] == walked["draw_count"]
    twin = metrics["corpus_persist"]["versus"]
    assert twin["corpus"]["count"] == walked["draw_count"]
    assert not any(key.endswith("_persist") for key in twin)
    assert "mean" not in metrics["mean"]["versus"]
    assert metrics["mean"]["mae_sum_ci"]["count"] == walked["draw_count"]
    assert metrics["mean"]["hits_chance"] == {"numbers": None, "stars": None}
    numbers = corpus["hits_chance"]["numbers"]
    assert numbers["count"] == walked["draw_count"]
    assert numbers["lo"] < 0.5 < numbers["hi"]
    assert 0 <= numbers["p"] <= 1
    band = walked["bands"]["corpus"]["sum"]
    assert band["raw_lo"] <= band["raw"] <= band["raw_hi"]
    assert band["calibrated_lo"] <= band["calibrated"] <= band["calibrated_hi"]


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


def _chronos_replays(scale: float = 1.0):
    """Faux Chronos : chaque bande entoure la dernière valeur de sa variable, multipliée par `scale`."""

    def fake(items: list[dict]) -> list[list[dict[str, float]]]:
        return [
            [{"lo": float(values[-1]) * scale - 1, "mid": float(values[-1]) * scale, "hi": float(values[-1]) * scale + 1} for values in item["target"]]
            for item in items
        ]

    return fake


def test_chronos_blends_lightgbm_and_leaves_catboost(monkeypatch) -> None:
    from synchro.nextdata.forecast import run_training

    draws = _draws(40, seed=11)
    calls: list[dict] = []
    _offline(monkeypatch, calls=calls, chronos=True)
    monkeypatch.setattr("synchro.nextdata.steps.chronos_quantiles", _chronos_replays(1.6))
    plain = run_training(draws, focus=24, covariates=["forme"], estimators=2, shift=1)
    calls.clear()
    mixed = run_training(draws, focus=24, covariates=["forme"], estimators=2, shift=1, with_chronos=True)
    plain_sum = sum(plain["shifts"][0]["readings"]["corpus"]["numbers"])
    mixed_sum = sum(mixed["shifts"][0]["readings"]["corpus"]["numbers"])
    assert mixed_sum > plain_sum
    assert mixed["shifts"][0]["readings"]["corpus_catboost"]["numbers"] == plain["shifts"][0]["readings"]["corpus_catboost"]["numbers"]
    note = mixed["shifts"][0]["readings"]["corpus"]["chronos"]
    assert note["available"] is True
    # Aucun pas d’avant dans le cache : moitié-moitié.
    assert note["window"] == 0
    assert note["weights"] == {"sum": 0.5, "star_sum": 0.5, "n1": 0.5}
    assert mixed["chronos"] == {"requested": True, "used": True, "error": None}
    assert plain["chronos"]["requested"] is False
    # Le pas noté sort du cache : Chronos n’ajuste aucun pas de plus.
    assert calls == []


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
    importance = [{"name": "lag:sum:1", "gain": 1.0, "family": "series"}]
    return bands, importance, kwargs.get("library", "lightgbm")


def _offline(monkeypatch, moments=_fake_moments, calls: list | None = None, chronos: bool = False) -> None:
    """LightGBM, CatBoost, Darts et Chronos remplacés : le moteur des pas tourne sans bibliothèque."""

    def fake(rows, horizon, **kwargs):
        if calls is not None:
            calls.append({"n": len(rows), "last": rows[-1]["date"], "target": horizon[0]["date"], **kwargs})
        return moments(rows, horizon, **kwargs)

    monkeypatch.setattr("synchro.nextdata.forecast.lightgbm_import_error", lambda: None)
    monkeypatch.setattr("synchro.nextdata.steps.predict_moments", fake)
    monkeypatch.setattr("synchro.nextdata.steps.catboost_import_error", lambda: None)
    monkeypatch.setattr("synchro.nextdata.steps._installed", lambda module: chronos and module == "chronos")


def test_shift_chronos_is_weighted_on_the_ten_draws_before(monkeypatch) -> None:
    """Chronos rejoue son dernier point. Ses poids se règlent sur les dix pas d’avant le tirage noté."""
    from synchro.nextdata.forecast import run_training

    draws = _draws(40, seed=12)
    rows = build_frame(draws, focus=24).rows
    n = len(rows)
    _offline(monkeypatch, chronos=True)
    monkeypatch.setattr("synchro.nextdata.steps.chronos_quantiles", _chronos_replays())
    monkeypatch.setattr("synchro.nextdata.backtest.blend_weight", lambda lgb, chronos: 0.0)
    report = run_training(draws, focus=24, covariates=["forme"], estimators=2, chunk=100, with_chronos=True)
    reading = report["shifts"][0]["readings"]["corpus"]
    note = reading["chronos"]
    assert note["available"] is True
    assert note["window"] == 10
    assert note["sum"] == rows[-2]["sum"]
    assert note["n1"] == rows[-2]["n1"]
    window = range(n - 11, n - 1)
    assert note["holdout_mae_chronos"] == round(sum(abs(rows[t - 1]["sum"] - rows[t]["sum"]) for t in window) / 10, 4)
    # La fausse somme LightGBM suit le nombre de tirages lus.
    assert note["holdout_mae_lgb"] == round(sum(abs(100 + t % 30 - rows[t]["sum"]) for t in window) / 10, 4)
    # Poids nul pour LightGBM : la somme visée et le niveau de n1 sont ceux de Chronos.
    assert reading["arbitration"]["sum_target"] == round(rows[-2]["sum"], 4)
    first = reading["arbitration"]["numbers"][0]
    assert first["level"] == round(rows[-2]["n1"], 4)
    assert first["chronos"] == {"value": rows[-2]["n1"], "share": 1.0}


def test_forecast_chronos_is_half_and_half_until_ten_draws_are_ready(monkeypatch) -> None:
    """Même Chronos au prochain tirage : moitié-moitié au premier pas, puis réglé sur les dix tirages d’avant."""
    from synchro.nextdata.forecast import run_forecast

    draws = _draws(40, seed=13)
    rows = build_frame(draws, focus=24).rows
    n = len(rows)
    _offline(monkeypatch, chronos=True)
    monkeypatch.setattr("synchro.nextdata.steps.chronos_quantiles", _chronos_replays())
    monkeypatch.setattr("synchro.nextdata.backtest.blend_weight", lambda lgb, chronos: 0.0)
    alone = run_forecast(draws, focus=24, covariates=["forme"], estimators=2, with_chronos=True, chunk=1)
    first = alone["modes"]["corpus"]["chronos"]
    assert first["available"] is True
    assert first["window"] == 0
    assert first["weight"] == 0.5
    report = run_forecast(draws, focus=24, covariates=["forme"], estimators=2, with_chronos=True, chunk=100)
    # Chronos n’ajoute plus de pas avant le focus.
    assert report["progress"]["total"] == 25
    window = range(n - 10, n)
    for mode in ("corpus", "fenetre"):
        note = report["modes"][mode]["chronos"]
        assert note["window"] == 10
        assert note["sum"] == rows[-1]["sum"]
        assert note["holdout_mae_chronos"] == round(sum(abs(rows[t - 1]["sum"] - rows[t]["sum"]) for t in window) / 10, 4)
    assert report["chronos"] == {"requested": True, "used": True, "error": None}


def test_chronos_blends_the_three_quantiles_and_leaves_the_chain() -> None:
    from synchro.nextdata import backtest

    frame = build_frame(_draws(40, seed=22), focus=24)
    moments = {
        "sum": {"lo": 90.0, "mid": 100.0, "hi": 110.0},
        "star_sum": {"lo": 8.0, "mid": 10.0, "hi": 12.0},
        "n1": {"lo": 3.0, "mid": 5.0, "hi": 7.0},
        "level:n1": {"lo": 4.0, "mid": 6.0, "hi": 8.0},
    }
    bands = {
        "sum": {"lo": 110.0, "mid": 130.0, "hi": 150.0},
        "star_sum": {"lo": 10.0, "mid": 14.0, "hi": 18.0},
        "n1": {"lo": 2.0, "mid": 8.0, "hi": 14.0},
    }
    note = backtest._blend_chronos(frame, "corpus", moments, {"chronos": {"corpus": bands}}, [], frame.star_pool)
    assert note["window"] == 0
    assert note["weights"] == {"sum": 0.5, "star_sum": 0.5, "n1": 0.5}
    assert moments["sum"] == {"lo": 100.0, "mid": 115.0, "hi": 130.0}
    assert moments["star_sum"] == {"lo": 9.0, "mid": 12.0, "hi": 15.0}
    assert moments["level:n1"] == {"lo": 3.0, "mid": 7.0, "hi": 11.0}
    assert moments["n1"] == {"lo": 3.0, "mid": 5.0, "hi": 7.0}
    failed = backtest._blend_chronos(frame, "corpus", moments, {"chronos": {"error": "OSError: hub"}}, [], frame.star_pool)
    assert failed == {"available": False, "weight": 1.0}


def _fake_chronos(monkeypatch, fail: Exception | None = None) -> dict[str, list]:
    """Faux torch et faux Chronos-2 : `predict_quantiles` reprend la vraie signature et rend une liste, une entrée par cible."""
    import sys
    import types

    import numpy as np

    from synchro.nextdata import forecast as forecast_mod

    seen: dict[str, list] = {"loads": [], "calls": []}

    class Chronos2Pipeline:
        def predict_quantiles(self, inputs, prediction_length=None, quantile_levels=(0.1, 0.5, 0.9), **predict_kwargs):
            seen["calls"].append({"inputs": inputs, "prediction_length": prediction_length, "quantile_levels": quantile_levels, **predict_kwargs})
            # (variables, horizon, quantiles), comme Chronos-2.
            tables = [np.asarray([[[row[-1] - 2.0, row[-1], row[-1] + 2.0]] for row in item["target"]], dtype=float) for item in inputs]
            return tables, [table[:, :, 1] for table in tables]

    class BaseChronosPipeline:
        @classmethod
        def from_pretrained(cls, name: str, **kwargs: object) -> Chronos2Pipeline:
            seen["loads"].append({"name": name, **kwargs})
            if fail is not None:
                raise fail
            return Chronos2Pipeline()

    chronos_mod = types.ModuleType("chronos")
    chronos_mod.BaseChronosPipeline = BaseChronosPipeline  # type: ignore[attr-defined]
    torch_mod = types.ModuleType("torch")
    torch_mod.float32 = "float32"  # type: ignore[attr-defined]
    torch_mod.bfloat16 = "bfloat16"  # type: ignore[attr-defined]
    torch_mod.cuda = types.SimpleNamespace(is_available=lambda: False)  # type: ignore[attr-defined]
    torch_mod.tensor = lambda values, dtype=None: list(values)  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "chronos", chronos_mod)
    monkeypatch.setitem(sys.modules, "torch", torch_mod)
    monkeypatch.setattr(forecast_mod, "_CHRONOS", None)
    monkeypatch.setattr(forecast_mod, "_CHRONOS_ERROR", None)
    return seen


def test_chronos_2_reads_both_modes_and_their_covariates_in_one_call(monkeypatch) -> None:
    from synchro.nextdata.covariates import FAMILIES, future_columns, past_columns
    from synchro.nextdata.forecast import CHRONOS_MODEL
    from synchro.nextdata.steps import CHRONOS_SERIES, StepSettings, compute_part

    seen = _fake_chronos(monkeypatch)
    frame = build_frame(_draws(40, seed=23), focus=24)
    settings = StepSettings(focus=24, families=FAMILIES, estimators=2)
    part = compute_part(frame.rows, frame.horizon, "chronos", settings)
    assert len(seen["calls"]) == 1
    call = seen["calls"][0]
    assert call["prediction_length"] == 1
    assert list(call["quantile_levels"]) == [0.1, 0.5, 0.9]
    corpus, window = call["inputs"]
    assert corpus["target"].shape == (3, len(frame.rows))
    assert window["target"].shape == (3, 24)
    clocks = future_columns(FAMILIES)
    assert sorted(corpus["past_covariates"]) == sorted(past_columns(FAMILIES) + clocks)
    assert sorted(corpus["future_covariates"]) == sorted(clocks)
    assert {name: list(values) for name, values in window["future_covariates"].items()} == {name: [frame.horizon[0][name]] for name in clocks}
    assert part["covariates"] == {"past": 37, "future": 15}
    for mode in ("corpus", "fenetre"):
        for name in CHRONOS_SERIES:
            last = float(frame.rows[-1][name])
            assert part[mode][name] == {"lo": last - 2.0, "mid": last, "hi": last + 2.0}
    compute_part(frame.rows[:-1], frame.horizon, "chronos", settings)
    assert seen["loads"] == [{"name": CHRONOS_MODEL, "device_map": "cpu", "torch_dtype": "float32"}]


def test_chronos_covariates_follow_the_families_and_stop_before_the_draw() -> None:
    from dataclasses import replace

    from synchro.nextdata.covariates import FUTURE_CALENDAR, FUTURE_MOON, PAST_FORME
    from synchro.nextdata.steps import chronos_inputs, horizon_of

    frame = build_frame(_draws(40, seed=26), focus=24)
    rows = frame.rows
    shape = chronos_inputs(rows, frame.horizon, 24, ("forme",))
    assert sorted(shape[0]["past_covariates"]) == sorted(PAST_FORME)
    assert "future_covariates" not in shape[0]
    clocks = chronos_inputs(rows, frame.horizon, 24, ("calendrier", "lune"))
    assert sorted(clocks[0]["past_covariates"]) == sorted(clocks[0]["future_covariates"]) == sorted(FUTURE_CALENDAR + FUTURE_MOON)

    # Au pas t, Chronos lit les tirages d’avant t et, du tirage t, ses seules horloges.
    families = ("calendrier", "lune", "forme")
    t = len(rows) - 3
    before = chronos_inputs(rows[:t], horizon_of(frame, t), 24, families)
    assert before[0]["target"][0][-1] == rows[t - 1]["sum"]
    assert before[0]["future_covariates"]["lunar_sin"][0] == rows[t]["lunar_sin"]
    hidden = {name: -1.0 for name in ("sum", "star_sum", "n1", *PAST_FORME)}
    blurred = replace(frame, rows=[*rows[:t], *({**row, **hidden} for row in rows[t:])])
    after = chronos_inputs(blurred.rows[:t], horizon_of(blurred, t), 24, families)
    for item, other in zip(before, after):
        assert item["target"].tolist() == other["target"].tolist()
        assert {name: values.tolist() for name, values in item["past_covariates"].items()} == {
            name: values.tolist() for name, values in other["past_covariates"].items()
        }
        assert {name: values.tolist() for name, values in item["future_covariates"].items()} == {
            name: values.tolist() for name, values in other["future_covariates"].items()
        }


def test_a_chronos_failure_is_reported_and_never_cached(monkeypatch) -> None:
    import json
    import os
    from pathlib import Path

    pytest = __import__("pytest")
    from synchro.nextdata.forecast import chronos_error, chronos_quantiles, run_training
    from synchro.nextdata.steps import parts_needed

    seen = _fake_chronos(monkeypatch, fail=OSError("hub\n  injoignable"))
    _offline(monkeypatch, chronos=True)
    monkeypatch.setattr("synchro.nextdata.forecast._installed", lambda module: module == "chronos")
    draws = _draws(40, seed=24)
    report = run_training(draws, focus=24, covariates=["forme"], estimators=2, chunk=100, with_chronos=True)
    assert report["progress"]["complete"] is True
    assert report["chronos"]["used"] is False
    assert report["chronos"]["error"] == (
        "Chronos n’a pas répondu (OSError: hub injoignable) ; il sera retenté au prochain démarrage de l’API."
    )
    assert chronos_error() == "OSError: hub injoignable"
    saved = [json.loads(path.read_text(encoding="utf-8")) for path in Path(os.environ["SYNCHRO_NEXTDATA_CACHE"]).rglob("*.json")]
    assert saved
    assert not any(set(part) == {"error"} for part in saved)
    # Ni retéléchargement ni nouvel appel avant le redémarrage : la suite part sans Chronos.
    assert parts_needed(True) == ("lightgbm", "catboost")
    again = run_training(draws, focus=24, covariates=["forme"], estimators=2, chunk=100, with_chronos=True)
    assert again["progress"]["complete"] is True
    assert again["chronos"]["error"] == report["chronos"]["error"]
    with pytest.raises(RuntimeError):
        chronos_quantiles([{"target": [[1.0, 2.0, 3.0]]}])
    assert len(seen["loads"]) == 1
    assert seen["calls"] == []


def test_chronos_missing_is_said_plainly(monkeypatch) -> None:
    from synchro.nextdata.forecast import run_forecast

    _offline(monkeypatch)
    monkeypatch.setattr("synchro.nextdata.forecast._installed", lambda module: False)
    report = run_forecast(_draws(40, seed=25), focus=24, covariates=["forme"], estimators=2, with_chronos=True, chunk=100)
    assert report["chronos"] == {
        "requested": True,
        "used": False,
        "error": "Chronos n’est pas installé : ./launch install-nextdata.",
    }


def test_the_installed_chronos_2_accepts_our_inputs() -> None:
    """Contrat avec le vrai paquet, s’il est là : nos entrées passent sa validation, sans télécharger de modèle."""
    import inspect

    pytest = __import__("pytest")
    chronos = pytest.importorskip("chronos")
    from chronos.chronos2.dataset import Chronos2Dataset, DatasetMode

    from synchro.nextdata.covariates import FAMILIES
    from synchro.nextdata.steps import chronos_inputs

    params = list(inspect.signature(chronos.Chronos2Pipeline.predict_quantiles).parameters.values())
    assert params[1].kind is inspect.Parameter.POSITIONAL_OR_KEYWORD
    assert {"prediction_length", "quantile_levels"} <= {param.name for param in params}
    frame = build_frame(_draws(40, seed=27), focus=24)
    items = chronos_inputs(frame.rows, frame.horizon, 24, FAMILIES)
    dataset = Chronos2Dataset(items, context_length=8192, prediction_length=1, batch_size=256, output_patch_size=16, mode=DatasetMode.TEST)
    batch = next(iter(dataset))
    # Deux entrées de 3 cibles et 52 covariables ; les 15 futures (horloges et Pulse) sont connues pour le tirage prévu.
    assert batch["context"].shape[0] == 2 * (3 + 52)
    assert batch["target_idx_ranges"] == [(0, 3), (55, 58)]
    assert int(batch["future_covariates"].isfinite().sum()) == 2 * 15


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
        with_chronos=False,
        chunk=4,
    )
    assert report["ok"] is True
    assert report["progress"] == {"ready": 4, "total": 21, "complete": False}
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


def test_status_and_focus_guard(monkeypatch) -> None:
    monkeypatch.setenv("SYNCHRO_NEXTDATA_ESTIMATORS", "3")
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
    assert payload["estimators"] == 3
    assert payload["progress"]["ready"] >= 1
    assert payload["primary"] == "fenetre"
    assert len(payload["modes"]["corpus"]["grid"]["numbers"]) == 5
    assert len(payload["modes"]["fenetre"]["grid"]["stars"]) == 2


def test_every_step_reads_the_forecast_settings(monkeypatch) -> None:
    """Pronostic, retour et décalages : mêmes arbres, mêmes quantiles, même faisceau à ±3."""
    from synchro.nextdata import backtest
    from synchro.nextdata.forecast import run_forecast, run_training

    draws = _draws(40, seed=16)
    calls: list[dict] = []
    radii: list[int] = []
    real_beam = backtest.beam

    def spy_beam(moments, base, **kwargs):
        radii.append(kwargs.get("radius", 3))
        return real_beam(moments, base, **kwargs)

    _offline(monkeypatch, calls=calls)
    monkeypatch.setattr("synchro.nextdata.backtest.beam", spy_beam)
    forecast = run_forecast(draws, focus=24, covariates=["forme"], estimators=7, chunk=100)
    fitted = len(calls)
    training = run_training(draws, focus=24, covariates=["forme"], estimators=7, chunk=100)
    assert forecast["progress"]["complete"] is True
    assert training["progress"]["complete"] is True
    assert len(calls) == fitted
    assert {call["estimators"] for call in calls} == {7}
    assert {tuple(call["quantiles"]) for call in calls} == {(0.1, 0.5, 0.9)}
    assert set(radii) == {3}
    retour = {row["date"]: row for row in forecast["backtest"]["rows"]}
    assert len({tuple(row["corpus"]["numbers"]) for row in retour.values()}) > 1
    for shift in training["shifts"]:
        for key in ("corpus", "fenetre", "corpus_catboost", "fenetre_catboost"):
            assert shift["readings"][key]["numbers"] == retour[shift["date"]][key]["numbers"]


def test_steps_are_cached_and_keyed_on_earlier_draws(monkeypatch) -> None:
    from synchro.nextdata.steps import StepSettings, ensure_steps, horizon_of, prefix_digests, step_key

    draws = _draws(40, seed=17)
    frame = build_frame(draws, focus=24)
    calls: list[dict] = []
    _offline(monkeypatch, calls=calls)
    settings = StepSettings(focus=frame.focus, families=("forme",), estimators=3)
    n = len(frame.rows)
    order = [n - 1, n - 2, n - 3]
    ready, remaining = ensure_steps(frame, order, settings, ("lightgbm",), limit=2)
    assert sorted(ready) == [n - 2, n - 1]
    assert remaining == 1
    assert len(calls) == 4
    again, remaining = ensure_steps(frame, order, settings, ("lightgbm",), limit=2)
    assert sorted(again) == sorted(order)
    assert remaining == 0
    assert len(calls) == 6
    assert again[n - 1]["parts"] == ready[n - 1]["parts"]

    t = 30

    def key(source: list[dict], part: str = "lightgbm", estimators: int = 3) -> str:
        built = build_frame(source, focus=24)
        chosen = StepSettings(focus=built.focus, families=("forme",), estimators=estimators)
        return step_key(prefix_digests(built.rows)[t], horizon_of(built, t), chosen, part)

    later = [dict(draw) for draw in draws]
    later[-1] = {**later[-1], "numbers": [1, 2, 3, 4, 5]}
    earlier = [dict(draw) for draw in draws]
    earlier[5] = {**earlier[5], "numbers": [1, 2, 3, 4, 5]}
    assert key(later) == key(draws)
    assert key(earlier) != key(draws)
    assert key(draws, estimators=4) != key(draws)
    assert key(draws, part="chronos", estimators=4) == key(draws, part="chronos")


def test_each_call_computes_one_chunk(monkeypatch) -> None:
    from synchro.nextdata.forecast import run_forecast

    draws = _draws(40, seed=18)
    _offline(monkeypatch)
    first = run_forecast(draws, focus=24, covariates=["forme"], estimators=2, chunk=5)
    assert first["ok"] is True
    assert first["progress"] == {"ready": 5, "total": 25, "complete": False}
    assert first["backtest"]["draw_count"] == 4
    last = run_forecast(draws, focus=24, covariates=["forme"], estimators=2, chunk=100)
    assert last["progress"] == {"ready": 25, "total": 25, "complete": True}
    assert last["backtest"]["draw_count"] == 24
    assert last["modes"]["corpus"]["grid"] == first["modes"]["corpus"]["grid"]


def test_forecast_bands_are_calibrated_on_the_retour(monkeypatch) -> None:
    from synchro.nextdata.forecast import run_forecast

    _offline(monkeypatch)
    report = run_forecast(_draws(60, seed=19), focus=50, covariates=["forme"], estimators=2, chunk=100)
    block = report["modes"]["corpus"]
    assert block["calibration"]["calibrated"] is True
    assert block["calibration"]["steps"] == report["backtest"]["draw_count"] == 44
    band = block["quantiles"]["sum"]
    assert band["hi"] - band["lo"] > 20
    assert 15 <= band["lo"] <= band["mid"] <= band["hi"] <= 240
    measured = report["backtest"]["bands"]["corpus"]["sum"]
    assert measured["raw"] < 0.2
    assert measured["calibrated"] >= 0.6
    assert measured["calibrated_count"] == 44 - 9


def test_training_route_returns_progress(monkeypatch) -> None:
    _offline(monkeypatch)
    monkeypatch.setenv("SYNCHRO_NEXTDATA_ESTIMATORS", "3")
    client = TestClient(create_app())
    response = client.post(
        "/api/nextdata/training",
        json={"focus": 50, "covariates": ["forme"], "draws": _draws(40, seed=20)},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["ok"] is True
    assert body["estimators"] == 3
    assert body["progress"] == {"ready": 1, "total": 24, "complete": False}
    assert [shift["x"] for shift in body["shifts"]] == [1]
    assert body["shifts"][0]["readings"]["corpus"]["calibrated"] is False


def test_a_tight_delta_outweighs_a_wide_level() -> None:
    """Le poids est prior / largeur. La bande du delta est la sienne, pas celle du niveau."""
    moments = {
        "n1": {"lo": 1, "mid": 8, "hi": 20},
        "g1": {"lo": 1, "mid": 8, "hi": 20},
        "g2": {"lo": 1, "mid": 8, "hi": 20},
        "g3": {"lo": 1, "mid": 8, "hi": 20},
        "g4": {"lo": 1, "mid": 8, "hi": 20},
        "e1": {"lo": 1, "mid": 3, "hi": 6},
        "e_gap": {"lo": 1, "mid": 4, "hi": 8},
        "level:n1": {"lo": 0, "mid": 5, "hi": 10},
        "delta:n1": {"lo": -0.5, "mid": 0, "hi": 0.5},
    }
    _out, trace = compose_ranks(moments, {"n1": 12, "n2": 20, "n3": 28, "n4": 36, "n5": 44})
    assert trace is not None
    weights = trace["numbers"][0]["weights"]
    assert weights["delta"] == pytest.approx(0.8824, abs=1e-4)
    assert weights["level"] == pytest.approx(0.1176, abs=1e-4)
    assert weights["delta"] > weights["level"]


def test_darts_window_trains_the_same_rows_as_the_loss() -> None:
    from synchro.nextdata.forecast import darts_training_window

    start, weights = darts_training_window(160, 50, "fenetre")
    assert start == 110 - 16
    assert weights[:16] == [0.0] * 16
    assert weights[16:] == [1.0] * 50
    corpus_start, corpus_weights = darts_training_window(160, 50, "corpus")
    assert corpus_start == 0
    assert corpus_weights[109] == 1.0
    assert corpus_weights[110] == 3.0
    short_start, short_weights = darts_training_window(100, 5, "fenetre") or (None, [])
    assert short_start == 0
    assert short_weights[94] == 0.0
    assert short_weights[95] == 1.0
    assert darts_training_window(8, 5, "corpus") is None


def test_external_median_keeps_the_quantile_gaps() -> None:
    from synchro.nextdata.forecast import _apply_external

    inside = {"sum": {"lo": 80.0, "mid": 100.0, "hi": 120.0}}
    _apply_external(inside, {"sum": 110})
    assert inside["sum"] == {"lo": 80.0, "mid": 110.0, "hi": 120.0}
    outside = {"sum": {"lo": 80.0, "mid": 100.0, "hi": 120.0}}
    _apply_external(outside, {"sum": 140})
    assert outside["sum"] == {"lo": 120.0, "mid": 140.0, "hi": 160.0}
    capped = {"n1": {"lo": 20.0, "mid": 30.0, "hi": 40.0}}
    _apply_external(capped, {"n1": 50})
    assert capped["n1"] == {"lo": 36.0, "mid": 46.0, "hi": 46.0}


def test_star_clip_follows_the_urn() -> None:
    from synchro.nextdata.forecast import _clip

    assert _clip("star_sum", 22.5, 12) == 22.5
    assert _clip("star_sum", 22.5, 11) == 21.0
    assert _clip("level:e2", 12, 9) == 9.0
    assert _clip("e1", 10, 9) == 8.0
    assert _clip("sum", 10, 9) == 15.0
    assert _clip("delta:e2", 11, 11) == 10.0


def test_sum_mae_scores_the_played_grid() -> None:
    from synchro.nextdata.backtest import _metrics

    step = {
        "actual": {"sum": 100.0, "numbers": [1, 2, 3, 4, 5], "stars": [1, 2]},
        "corpus": {
            "sum": 90.0,
            "sum_model": 80.0,
            "numbers": [10, 20, 30, 40, 50],
            "stars": [1, 2],
        },
    }
    metrics = _metrics([step], "corpus", 12)
    assert metrics["mae"]["sum"] == 10.0


def test_chronos_quantiles_keep_level_order(monkeypatch) -> None:
    import sys
    import types

    import numpy as np

    from synchro.nextdata import forecast as forecast_mod
    from synchro.nextdata.forecast import chronos_quantiles

    torch_mod = types.ModuleType("torch")
    chronos_mod = types.ModuleType("chronos")
    chronos_mod.BaseChronosPipeline = object  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "torch", torch_mod)
    monkeypatch.setitem(sys.modules, "chronos", chronos_mod)

    class Ordered:
        def predict_quantiles(self, items, prediction_length=1, quantile_levels=None):
            table = np.asarray([[[1.0, 4.0, 9.0], [2.0, 3.0, 8.0]]], dtype=float)
            return [table], None

    class Crossed:
        def predict_quantiles(self, items, prediction_length=1, quantile_levels=None):
            table = np.asarray([[[9.0, 1.0, 4.0]]], dtype=float)
            return [table], None

    monkeypatch.setattr(forecast_mod, "_CHRONOS", Ordered())
    monkeypatch.setattr(forecast_mod, "_CHRONOS_ERROR", None)
    try:
        assert chronos_quantiles([{"target": [[1.0, 2.0]]}]) == [
            [{"lo": 1.0, "mid": 4.0, "hi": 9.0}, {"lo": 2.0, "mid": 3.0, "hi": 8.0}]
        ]
        monkeypatch.setattr(forecast_mod, "_CHRONOS", Crossed())
        with pytest.raises(RuntimeError, match="non croissant"):
            chronos_quantiles([{"target": [[1.0]]}])
    finally:
        monkeypatch.setattr(forecast_mod, "_CHRONOS_ERROR", None)
        monkeypatch.setattr(forecast_mod, "_CHRONOS", None)


def test_rows_and_horizon_carry_their_star_pool() -> None:
    frame = build_frame(_draws(30, seed=4), focus=24)
    assert frame.rows[-1]["star_pool"] == 12
    assert frame.horizon[0]["star_pool"] == 12
    assert frame.horizon[1]["star_pool"] == 12


def test_chain_features_do_not_reuse_the_row_target() -> None:
    import numpy as np

    y = np.linspace(1.0, 20.0, 20)
    x = y.reshape(-1, 1)
    weights = np.ones(20)
    column = _past_only_column(x, y, weights, library="lightgbm", estimators=2)
    assert column[0] == y[1]
    assert column[5] == float(y[:5].mean())
    assert column[5] != y[5]
