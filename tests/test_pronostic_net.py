from __future__ import annotations

from datetime import date, timedelta

from fastapi.testclient import TestClient

from synchro.app import create_app
from synchro.pronostic_net import project_moments, run_confrontation, sigma_scale
from synchro.pronostic_net.committee import run_scope


def _draw(index: int, numbers: list[int], stars: list[int], weekday: str = "mardi") -> dict:
    day = date(2026, 1, 1) + timedelta(days=index)
    return {
        "date": day.isoformat(),
        "numbers": numbers,
        "stars": stars,
        "weekday": weekday,
    }


def _constant_series(n: int, weekday: str = "mardi") -> list[dict]:
    return [_draw(i, [1, 2, 3, 4, 5], [1, 2], weekday if i % 2 == 0 else "vendredi") for i in range(n)]


def test_sigma_scale_needs_five_priors_and_grows_when_sigma_is_small() -> None:
    assert sigma_scale([2.0, 2.0, 2.0, 2.0]) == 1.0
    assert sigma_scale([0.0, 0.0, 0.0, 0.0, 0.0]) == 1.0
    grown = sigma_scale([3.0, 3.0, 3.0, 3.0, 3.0])
    assert grown > 1.5


def test_project_orders_ranks_and_keeps_the_sum_near_them() -> None:
    mu = [10.0, 2.5, 10.0, 3.0, 20.0, 1.0, 40.0, 1.0, 1.0, 8.0, 2.0]
    sigma = [0.0] * 11
    out = project_moments(mu, sigma)
    ranks = out[2:7]
    assert ranks == sorted(ranks)
    assert ranks[0] >= 1 and ranks[-1] <= 50
    assert all(ranks[i] <= ranks[i + 1] for i in range(4))
    assert abs(out[0] - sum(ranks)) <= 1.0
    assert out[9] <= out[10]
    assert 1 <= out[9] <= 11
    assert 2 <= out[10] <= 12
    assert 0 <= out[1] <= 5
    assert 0 <= out[8] <= 2


def test_constant_series_does_not_see_the_outlier() -> None:
    draws = _constant_series(24)
    draws[-1] = _draw(24, [10, 20, 30, 40, 50], [11, 12], "vendredi")
    report = run_scope(draws, 20, epochs=2, seed=0)
    row = report["rows"][-1]
    by_id = {axis["id"]: axis for axis in row["axes"]}
    assert by_id["sum"]["actual"] == 150
    assert by_id["sum"]["mu"] == 15
    assert by_id["n1"]["mu"] == 1
    assert by_id["n5"]["mu"] == 5
    assert by_id["e2"]["mu"] == 2
    assert row["fellBackAll"] is True


def test_scored_draw_does_not_change_its_own_forecast() -> None:
    base = []
    for i in range(16):
        shift = i % 5
        base.append(_draw(i, [1 + shift, 8, 15, 22, 30], [1 + (i % 3), 6], "mardi" if i % 2 == 0 else "vendredi"))
    other = [dict(item) for item in base]
    other[-1] = _draw(15, [6, 16, 26, 36, 46], [3, 9], "vendredi")
    left = run_scope(base, 8, epochs=2, seed=1)
    right = run_scope(other, 8, epochs=2, seed=1)
    assert left["rows"][-1]["axes"][0]["mu"] == right["rows"][-1]["axes"][0]["mu"]
    assert left["rows"][-1]["axes"][0]["sigma"] == right["rows"][-1]["axes"][0]["sigma"]
    assert left["rows"][-1]["axes"][0]["actual"] != right["rows"][-1]["axes"][0]["actual"]
    assert left["next"]["axes"][0]["mu"] != right["next"]["axes"][0]["mu"] or left["next"]["fellBackAll"]


def test_short_day_has_no_rate_and_mixte_keeps_undated_draws() -> None:
    draws = _constant_series(21)
    draws[0] = {**draws[0], "weekday": ""}
    report = run_confrontation(draws, 20, epochs=1, seed=0)
    assert report["scopes"]["mixte"]["available"] == 21
    assert len(report["scopes"]["mixte"]["rows"]) == 1
    assert report["scopes"]["mardi"]["rows"] == []
    assert report["scopes"]["vendredi"]["rows"] == []
    assert "actual" not in report["scopes"]["mixte"]["next"]["axes"][0]


def test_committee_route_accepts_a_long_archive_and_skips_a_bad_draw() -> None:
    app = create_app()
    client = TestClient(app)
    empty = client.post(
        "/api/pronostic/committee",
        content=b"",
        headers={"content-type": "application/json"},
    )
    assert empty.status_code == 400
    assert isinstance(empty.json()["detail"], str)
    foreign = client.post("/api/pronostic/committee", json={"lookback": "auto", "draws": []})
    assert foreign.status_code == 400
    assert "20 ou 50" in foreign.json()["detail"]
    many = client.post(
        "/api/pronostic/committee",
        json={
            "lookback": 20,
            "draws": [{"date": index, "numbers": [None], "stars": [], "weekday": 2} for index in range(450)],
        },
    )
    assert many.status_code == 200
    mixed = client.post(
        "/api/pronostic/committee",
        json={
            "lookback": "20",
            "draws": [
                {"date": 20260102, "numbers": [1, None, 3, 4, 5], "stars": [1, 2], "weekday": 2},
                *_constant_series(3),
            ],
        },
    )
    assert mixed.status_code == 200
    assert mixed.json()["scopes"]["mixte"]["available"] == 3


def test_parallel_scopes_match_the_sequential_committee() -> None:
    from synchro.pronostic_net.workers import close_scope_pool

    draws = []
    for i in range(48):
        shift = i % 5
        draws.append(
            _draw(i, [1 + shift, 8, 15, 22, 30], [1 + (i % 3), 6], "mardi" if i % 2 == 0 else "vendredi")
        )
    try:
        alone = run_confrontation(draws, 20, epochs=1, seed=2, parallel=False)
        together = run_confrontation(draws, 20, epochs=1, seed=2, parallel=True)
    finally:
        close_scope_pool()
    assert together["workers"] >= 2
    assert alone["workers"] == 1
    left = alone["scopes"]["mixte"]["next"]["axes"]
    right = together["scopes"]["mixte"]["next"]["axes"]
    assert [axis["mu"] for axis in left] == [axis["mu"] for axis in right]
    assert [axis["fellBack"] for axis in left] == [axis["fellBack"] for axis in right]
    assert len(alone["scopes"]["mixte"]["rows"]) == len(together["scopes"]["mixte"]["rows"])


def test_fit_stays_inside_the_lookback_window() -> None:
    from unittest.mock import patch

    from synchro.pronostic_net import committee as committee_mod

    seen: list[int] = []
    real_axis = committee_mod._fit_predict_axis
    real_global = committee_mod._fit_predict_global

    def axis(x, y, query, epochs, seed):
        seen.append(int(y.shape[0]))
        return real_axis(x, y, query, epochs, seed)

    def global_fit(x, y, query, epochs, seed):
        seen.append(int(y.shape[0]))
        return real_global(x, y, query, epochs, seed)

    draws = []
    for i in range(80):
        shift = i % 5
        draws.append(
            _draw(i, [1 + shift, 8, 15, 22, 30], [1 + (i % 3), 6], "mardi" if i % 2 == 0 else "vendredi")
        )
    with (
        patch.object(committee_mod, "_fit_predict_axis", side_effect=axis),
        patch.object(committee_mod, "_fit_predict_global", side_effect=global_fit),
    ):
        report = committee_mod.run_scope(draws, 20, epochs=1, seed=0)
    assert seen
    assert max(seen) <= 20
    assert report["available"] == 80
    assert len(report["rows"]) == 60


def test_committee_route_rejects_a_foreign_window_and_scores_twenty() -> None:
    app = create_app()
    client = TestClient(app)
    bad = client.post("/api/pronostic/committee", json={"lookback": 100, "draws": []})
    assert bad.status_code == 400
    ok = client.post(
        "/api/pronostic/committee",
        json={"lookback": 20, "draws": _constant_series(21)},
    )
    assert ok.status_code == 200
    body = ok.json()
    assert body["ok"] is True
    assert body["lookback"] == 20
    assert set(body["scopes"]) == {"mixte", "mardi", "vendredi"}
    row = body["scopes"]["mixte"]["rows"][0]
    assert len(row["axes"]) == 11
    assert row["axes"][0]["id"] == "sum"
