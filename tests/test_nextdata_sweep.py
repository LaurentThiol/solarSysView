"""Méga : effets principaux, plafond de charge, Holm, cache des pas."""

from __future__ import annotations

import random
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from synchro.app import create_app
from synchro.nextdata.covariates import FAMILIES
from synchro.nextdata.panel import build_frame
from synchro.nextdata.sweep import (
    MAX_ROWS,
    cpu_ratio,
    decide_leader,
    holm_adjust,
    main_effects,
    next_allowance,
    parse_cpu_times,
    parse_memory_free,
    process_cap,
    run_sweep,
    shift_dates,
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


def _band(mid: float) -> dict[str, float]:
    return {"lo": mid - 1, "mid": mid, "hi": mid + 1}


def _fake_moments(rows, horizon, **kwargs):
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


def _offline(monkeypatch, calls: list | None = None) -> None:
    def fake(rows, horizon, **kwargs):
        if calls is not None:
            calls.append({"n": len(rows), "families": tuple(kwargs.get("families") or ()), "library": kwargs.get("library")})
        return _fake_moments(rows, horizon, **kwargs)

    monkeypatch.setattr("synchro.nextdata.forecast.lightgbm_import_error", lambda: None)
    monkeypatch.setattr("synchro.nextdata.models.predict_moments", fake)
    monkeypatch.setattr("synchro.nextdata.steps.catboost_import_error", lambda: None)
    monkeypatch.setattr("synchro.nextdata.steps._installed", lambda _module: False)


def test_main_effects_stay_within_the_row_cap() -> None:
    rows = main_effects(focus=50, years=["n", "n-1", "n-2"], covariates=list(FAMILIES), with_chronos=False)
    assert rows[0].anchor is True
    assert rows[0].id == "anchor"
    assert len(rows) == 1 + 2 + 2 + len(FAMILIES)
    assert len(rows) <= MAX_ROWS
    assert len({row.id for row in rows}) == len(rows)
    assert all(row.with_chronos is False for row in rows)
    assert any(row.id == "focus-20" for row in rows)
    assert any(row.id == "focus-100" for row in rows)
    assert any(row.id == "years-n" for row in rows)
    assert any(row.id == "years-n+n-1" for row in rows)
    assert not any(row.years == ("n", "n-1", "n-2") and row.role == "years" for row in rows)
    dropped = next(row for row in rows if row.dropped == "pulse")
    assert "pulse" not in dropped.families
    assert dropped.label == "Sans Pulse"

    alone = main_effects(focus=100, years=["n"], covariates=["forme"], with_chronos=True)
    assert all(row.with_chronos for row in alone)
    assert not any(row.role == "covariate" for row in alone)
    assert {row.id for row in alone} == {"anchor", "focus-20", "focus-50", "years-n+n-1", "years-n+n-1+n-2"}
    short = main_effects(focus=20, years=["n"], covariates=["forme"], with_chronos=False)
    assert {row.id for row in short} == {"anchor", "focus-50", "focus-100", "years-n+n-1", "years-n+n-1+n-2"}
    assert len(alone) <= MAX_ROWS

    skipped = main_effects(focus=50, years=["n", "n-2"], covariates=["forme", "delta"], with_chronos=False)
    assert sum(1 for row in skipped if row.role == "years") == 3


def test_year_depths_share_the_anchor_dates() -> None:
    draws = _draws(160, start=date(2023, 6, 2), seed=4)
    anchor = build_frame(draws, years=["n", "n-1", "n-2"], focus=50)
    narrow = build_frame(draws, years=["n"], focus=50)
    lags = range(1, 11)
    assert shift_dates(anchor, lags) == shift_dates(narrow, lags)
    assert len(shift_dates(anchor, lags)) == 10


def test_a_short_year_is_set_aside(monkeypatch) -> None:
    monkeypatch.setattr("synchro.nextdata.forecast.lightgbm_import_error", lambda: None)
    draws = _draws(30, start=date(2024, 1, 2), seed=1) + _draws(10, start=date(2025, 1, 3), seed=2)
    report = run_sweep(
        draws,
        focus=50,
        years=["n", "n-1", "n-2"],
        covariates=["forme"],
        estimators=2,
        budget=0,
        lags=(1,),
    )
    assert report["ok"] is True
    by_id = {row["id"]: row for row in report["rows"]}
    assert by_id["anchor"]["status"] == "pending"
    assert by_id["years-n"]["status"] == "short"
    assert by_id["years-n"]["summary"] == {}
    assert by_id["years-n"]["detail"]


def test_the_load_governor_opens_and_closes_slots() -> None:
    assert process_cap(1) == 1
    assert process_cap(2) == 1
    assert process_cap(4) == 3
    assert process_cap(10) == 8
    assert next_allowance(2, 2, 0.5, 0.5, cap=4) == 3
    assert next_allowance(3, 3, 0.9, 0.5, cap=4) == 3
    assert next_allowance(0, 1, 0.9, 0.5, cap=4) == 1
    assert next_allowance(2, 2, 0.5, 0.1, cap=4) == 2
    assert next_allowance(4, 4, 0.4, 0.8, cap=4) == 4
    assert next_allowance(2, 3, 0.7, 0.5, cap=6) == 3
    assert next_allowance(1, 1, None, 0.5, cap=6) == 1
    before = parse_cpu_times("cpu  10 0 0 90\n")
    after = parse_cpu_times("cpu  20 0 0 100\n")
    assert before == (100, 90)
    assert after == (120, 100)
    assert cpu_ratio(before, after) == pytest.approx(0.5)
    assert cpu_ratio(before, before) is None
    assert parse_memory_free("MemTotal: 1000 kB\nMemAvailable: 250 kB\n") == pytest.approx(0.25)
    assert parse_memory_free("MemTotal: 1000 kB\n") is None


def test_without_proc_the_governor_reads_the_load_average(monkeypatch) -> None:
    from synchro.nextdata import sweep

    monkeypatch.setattr(sweep, "read_cpu_times", lambda path="/proc/stat": None)
    monkeypatch.setattr(sweep.os, "getloadavg", lambda: (1.0, 0.5, 0.25))
    monkeypatch.setattr(sweep.os, "cpu_count", lambda: 4)
    assert sweep.load_ratio() == pytest.approx(0.25)
    mark, cpu = sweep._delta(None)
    assert mark is None
    assert cpu == pytest.approx(0.25)
    assert sweep.blind_machine() is False
    allowed = 1
    for _ in range(4):
        allowed = next_allowance(allowed, allowed, cpu, None, cap=3)
    assert allowed == 3

    def missing() -> tuple[float, float, float]:
        raise OSError("pas de charge moyenne")

    monkeypatch.setattr(sweep.os, "getloadavg", missing)
    assert sweep.load_ratio() is None
    assert sweep.blind_machine() is True


def test_holm_keeps_only_a_gap_that_survives_the_others() -> None:
    adjusted = holm_adjust([("a", 0.01), ("b", 0.04), ("c", 0.20)])
    assert adjusted["a"]["reject"] is True
    assert adjusted["b"]["reject"] is False
    assert adjusted["c"]["reject"] is False
    assert adjusted["a"]["p_holm"] <= adjusted["b"]["p_holm"] <= adjusted["c"]["p_holm"]

    decision = decide_leader(
        [
            {"id": "clear", "label": "Sans Pulse", "verdict": "lower", "p": 0.01, "value": -4.0},
            {"id": "border", "label": "Focus 100", "verdict": "lower", "p": 0.04, "value": -1.0},
            {"id": "other", "label": "Années n", "verdict": "lower", "p": 0.04, "value": -0.5},
        ]
    )
    assert decision["held"] is False
    assert decision["leader"]["id"] == "clear"
    assert decision["holm"]["clear"]["retained"] is True
    assert decision["holm"]["border"]["retained"] is False

    quiet = decide_leader(
        [
            {"id": "a", "label": "Focus 100", "verdict": "undecided", "p": 0.4, "value": -0.2},
            {"id": "b", "label": "Années n", "verdict": "higher", "p": 0.2, "value": 1.0},
        ]
    )
    assert quiet["held"] is True
    assert quiet["leader"] is None

    both = decide_leader(
        [
            {"id": "late", "label": "Années n", "verdict": "lower", "p": 0.01, "value": -1.0},
            {"id": "early", "label": "Sans Forme", "verdict": "lower", "p": 0.001, "value": -3.0},
        ]
    )
    assert both["leader"]["id"] == "early"
    assert both["holm"]["late"]["retained"] is True


def test_sweep_fills_the_cache_once(monkeypatch) -> None:
    calls: list[dict] = []
    _offline(monkeypatch, calls)
    draws = _draws(40, seed=3)
    kwargs = {
        "focus": 50,
        "years": ["n", "n-1", "n-2"],
        "covariates": ["forme", "delta"],
        "estimators": 2,
        "budget": 60,
        "lags": (1,),
    }
    first = run_sweep(draws, **kwargs)
    assert first["ok"] is True
    assert first["progress"]["complete"] is True
    assert first["progress"]["total"] > 0
    assert len({call["families"] for call in calls}) >= 2
    fitted = len(calls)
    anchor = next(row for row in first["rows"] if row["anchor"])
    dropped = next(row for row in first["rows"] if row["dropped"] == "delta")
    assert anchor["status"] == "ready"
    assert anchor["summary"]["corpus"]["mae_sum"] is not None
    assert dropped["status"] == "ready"
    assert dropped["versus_anchor"]["corpus"]["count"] == 1
    assert first["held"] is True
    assert first["leader"] is None
    assert "Chronos" not in first["note"]

    second = run_sweep(draws, **kwargs)
    assert len(calls) == fitted
    assert second["wave"] == 0
    assert second["progress"]["complete"] is True
    assert second["rows"][0]["summary"]["corpus"]["mae_sum"] == anchor["summary"]["corpus"]["mae_sum"]

    with_persist = run_sweep(draws, persist={"radius": 2, "limit": 1}, **kwargs)
    assert len(calls) == fitted
    assert with_persist["wave"] == 0
    assert with_persist["rows"][0]["summary"]["corpus_persist"]["mae_sum"] is not None


def test_a_sweep_stops_before_its_budget(monkeypatch) -> None:
    calls: list[dict] = []
    _offline(monkeypatch, calls)
    report = run_sweep(
        _draws(40, seed=5),
        focus=50,
        covariates=["forme", "delta"],
        estimators=2,
        budget=0,
        lags=(1,),
    )
    assert calls == []
    assert report["ok"] is True
    assert report["progress"]["complete"] is False
    assert report["progress"]["total"] > report["progress"]["ready"] == 0
    assert report["wave"] == 0
    assert report["leader"] is None
    assert report["held"] is True
    assert all(row["holm"] is None and row["versus_anchor"] is None for row in report["rows"])


def test_a_partial_sweep_never_publishes_a_provisional_verdict(monkeypatch) -> None:
    from synchro.nextdata import sweep

    calls: list[dict] = []
    _offline(monkeypatch, calls)
    monkeypatch.setattr(sweep, "_census", lambda _built, _found: (1, 2))

    report = run_sweep(
        _draws(40, seed=5),
        focus=50,
        covariates=["forme", "delta"],
        estimators=2,
        budget=60,
        lags=(1,),
    )

    assert calls
    assert report["progress"] == {"ready": 1, "total": 2, "complete": False}
    assert report["leader"] is None
    assert report["held"] is True
    assert all(row["holm"] is None and row["versus_anchor"] is None for row in report["rows"])


def test_sweep_route_keeps_the_training_focus(monkeypatch) -> None:
    captured: dict[str, object] = {}

    def fake(draws, **kwargs):
        del draws
        captured["focus"] = kwargs.get("focus")
        captured["with_chronos"] = kwargs.get("with_chronos")
        return {"ok": True, "rows": [], "held": True, "leader": None, "progress": {"ready": 0, "total": 0, "complete": True}}

    monkeypatch.setattr("synchro.nextdata.sweep.run_sweep", fake)
    client = TestClient(create_app())
    refused = client.post("/api/nextdata/sweep", json={"focus": 10, "draws": _draws(30)})
    assert refused.status_code == 400
    assert refused.json()["detail"] == "Le focus est 20, 50 ou 100."
    short = client.post("/api/nextdata/sweep", json={"focus": 20, "draws": _draws(30)})
    assert short.status_code == 200, short.text
    assert captured["focus"] == 20
    accepted = client.post(
        "/api/nextdata/sweep",
        json={"focus": 100, "with_chronos": True, "covariates": ["forme"], "draws": _draws(30)},
    )
    assert accepted.status_code == 200, accepted.text
    assert captured == {"focus": 100, "with_chronos": True}
    invalid = client.post("/api/nextdata/sweep", json={"focus": 50, "with_chronos": "oui", "draws": _draws(30)})
    assert invalid.status_code == 400
    assert captured["with_chronos"] is True


class _InlinePool:
    """Pool sans processus : chaque morceau se calcule à l’envoi, et sa partie reste notée."""

    def __init__(self) -> None:
        self.parts: list[str] = []

    def submit(self, fn, prefix, horizon, part, settings):
        from concurrent.futures import Future

        self.parts.append(part)
        future: Future = Future()
        future.set_result(fn(prefix, horizon, part, settings))
        return future


def test_the_trees_share_the_pool_and_chronos_stays_in_the_api(monkeypatch) -> None:
    from synchro.nextdata import sweep

    calls: list[dict] = []
    _offline(monkeypatch, calls)
    monkeypatch.setattr("synchro.nextdata.steps._installed", lambda module: module == "chronos")
    asked: list[int] = []

    def chronos(items: list[dict]) -> list[list[dict[str, float]]]:
        asked.append(len(items))
        return [[{"lo": 1.0, "mid": 2.0, "hi": 3.0}] * 3 for _ in items]

    monkeypatch.setattr("synchro.nextdata.models.chronos_quantiles", chronos)
    pool = _InlinePool()
    monkeypatch.setattr(sweep, "_sweep_pool", lambda cap: pool)
    monkeypatch.setattr(sweep, "blind_machine", lambda: True)
    monkeypatch.setattr(sweep.os, "cpu_count", lambda: 8)
    monkeypatch.setenv("SYNCHRO_NEXTDATA_WORKERS", "3")
    report = run_sweep(
        _draws(40, seed=3),
        focus=50,
        covariates=["forme", "delta"],
        estimators=2,
        with_chronos=True,
        budget=60,
        lags=(1,),
    )
    assert report["ok"] is True
    assert report["progress"]["complete"] is True
    assert report["load"]["parallel"] is True
    assert report["load"]["cap"] == 6
    assert report["load"]["allowed"] == 6
    assert pool.parts
    assert "chronos" not in pool.parts
    assert asked and set(asked) == {2}
    anchor = next(row for row in report["rows"] if row["anchor"])
    assert anchor["with_chronos"] is True
    assert anchor["status"] == "ready"
    assert "moitié-moitié" in report["note"]


def test_a_pool_closed_by_another_sweep_falls_back_to_the_api(monkeypatch) -> None:
    from synchro.nextdata import sweep

    class Closed:
        def submit(self, *args, **kwargs):
            raise RuntimeError("cannot schedule new futures after shutdown")

    calls: list[dict] = []
    _offline(monkeypatch, calls)
    monkeypatch.setattr(sweep, "_sweep_pool", lambda cap: Closed())
    monkeypatch.setattr(sweep, "blind_machine", lambda: True)
    monkeypatch.setenv("SYNCHRO_NEXTDATA_WORKERS", "3")
    monkeypatch.setattr(sweep.os, "cpu_count", lambda: 8)
    report = run_sweep(_draws(40, seed=5), focus=50, covariates=["forme", "delta"], estimators=2, budget=60, lags=(1,))
    assert report["ok"] is True
    assert report["progress"]["complete"] is True
    assert report["load"]["allowed"] == 1
    assert calls


def test_rows_with_the_same_years_share_one_frame(monkeypatch) -> None:
    from synchro.nextdata import panel

    _offline(monkeypatch)
    built: list[tuple] = []
    original = panel.build_frame

    def counted(draws, **kwargs):
        built.append(tuple(kwargs.get("years") or ()))
        return original(draws, **kwargs)

    monkeypatch.setattr(panel, "build_frame", counted)
    report = run_sweep(
        _draws(160, start=date(2023, 6, 2), seed=4),
        focus=50,
        years=["n", "n-1", "n-2"],
        covariates=["forme", "delta", "lune"],
        estimators=2,
        budget=0,
        lags=(1,),
    )
    assert report["ok"] is True
    assert len(report["rows"]) == 1 + 2 + 2 + 3
    assert sorted(built) == sorted({("n",), ("n", "n-1"), ("n", "n-1", "n-2")})
    focus_row = next(row for row in report["rows"] if row["id"] == "focus-100")
    assert focus_row["focus"] == 100
    assert focus_row["status"] != "misaligned"
