"""Cycles physiques de l'onglet Réf : lunaire local, solaire local, SunPy optionnel."""

from datetime import date

import pytest
from fastapi.testclient import TestClient

from synchro.app import create_app
from synchro.ref.cycles import carrington, catalog, lunar_state, schwabe
from synchro.ref.solar_net import goes_search


def test_new_moon_and_full_moon_anchors() -> None:
    eclipse = lunar_state(date(2024, 4, 8))
    assert eclipse["phase"] == "nouvelle"
    assert eclipse["illumination"] < 0.02
    full = lunar_state(date(2024, 4, 23))
    assert full["phase"] == "pleine"
    assert full["illumination"] > 0.98
    assert full["age_days"] == pytest.approx(14.8, abs=0.6)


def test_carrington_rotation_one_starts_on_the_anchor_day() -> None:
    first = carrington(date(1853, 11, 9))
    assert first["number"] == 1
    assert first["fraction"] < 0.05
    later = carrington(date(1853, 12, 7))
    assert later["number"] == 2
    modern = carrington(date(2024, 6, 20))
    assert modern["number"] == 2285


def test_schwabe_cycle_25_after_the_2019_minimum() -> None:
    state = schwabe(date(2024, 10, 1))
    assert state["cycle"] == 25
    assert 0.3 < state["fraction"] < 0.6
    assert state["bounded_by_observed_minimum"] is False


def test_catalog_lists_candidates_beyond_lunar_and_solar() -> None:
    payload = catalog()
    ids = {item["id"] for item in payload["items"]}
    assert payload["active"] == ["lunaire", "solaire"]
    for needed in ("anomalistique", "draconitique", "saros", "hale", "f107", "kp", "enso"):
        assert needed in ids


def test_goes_search_reports_a_missing_sunpy(monkeypatch: pytest.MonkeyPatch) -> None:
    import builtins

    real_import = builtins.__import__

    def blocked(name, *args, **kwargs):
        if name == "sunpy" or name.startswith("sunpy."):
            raise ImportError("sunpy absent")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", blocked)
    with pytest.raises(RuntimeError, match="SunPy"):
        goes_search("2024-04-01", "2024-04-08", kind="xrs")


def test_ref_routes_serve_lunar_solar_and_catalog() -> None:
    client = TestClient(create_app())
    lunar = client.get("/api/ref/lunar", params={"date": "2024-04-08"})
    assert lunar.status_code == 200
    body = lunar.json()
    assert body["today"]["phase"] == "nouvelle"
    assert len(body["month"]) == 30
    solar = client.get("/api/ref/solar", params={"date": "2024-06-20"})
    assert solar.status_code == 200
    assert solar.json()["carrington"]["number"] == 2285
    listed = client.get("/api/ref/catalog")
    assert listed.status_code == 200
    assert listed.json()["items"]
    bad = client.get("/api/ref/lunar", params={"date": "pas-une-date"})
    assert bad.status_code == 400


def test_eclipse_day_is_near_perigee_and_a_node() -> None:
    from synchro.ref.phases import anomalistic_fraction, draconic_fraction, tropical_fraction

    eclipse = date(2024, 4, 8)
    assert anomalistic_fraction(eclipse) < 0.08
    assert draconic_fraction(eclipse) > 0.97 or draconic_fraction(eclipse) < 0.03
    assert tropical_fraction(date(2024, 3, 20)) < 0.02


def test_plane_joins_phases_and_draw_scalars() -> None:
    from synchro.harmo.archive import bundled_draws
    from synchro.ref.plane import plane

    payload = plane(bundled_draws("current"), "lunaire", "anomalistique", 20)
    assert len(payload["points"]) == 20
    point = payload["points"][-1]
    for key in ("x", "y", "sum", "star_sum", "n1", "n2", "n3", "n4", "n5", "e1", "e2"):
        assert key in point
    assert 0 <= point["x"] <= 1
    assert point["n1"] <= point["n5"]
    assert point["e1"] <= point["e2"]


def test_trace_marks_jackpot_winners() -> None:
    from datetime import date

    from synchro.ref.plane import trace

    draws = [
        {
            "draw_date": date(2024, 4, 8),
            "numbers": [1, 2, 3, 4, 5],
            "stars": [1, 2],
            "prizes": [
                {"rank": 1, "winners_fr": 0, "winners_eu": 2, "winners_total": 2, "prize": 50_000_000}
            ],
        },
        {
            "draw_date": date(2024, 4, 12),
            "numbers": [6, 7, 8, 9, 10],
            "stars": [3, 4],
            "winners_rank1_fr": 0,
            "winners_rank1_eu": 0,
            "prize_rank1": 0,
        },
        {
            "draw_date": date(2024, 4, 16),
            "numbers": [11, 12, 13, 14, 15],
            "stars": [5, 6],
        },
    ]
    by_date = {point["date"]: point for point in trace(draws, "lunaire", 20)["points"]}
    assert by_date["2024-04-08"]["jackpot"] is True
    assert by_date["2024-04-08"]["jackpot_eur"] == 50_000_000
    assert by_date["2024-04-12"]["jackpot"] is False
    assert by_date["2024-04-16"]["jackpot"] is None


def test_trace_and_plane_routes() -> None:
    client = TestClient(create_app())
    traced = client.get("/api/ref/trace", params={"cycle": "draconitique", "window": 50})
    assert traced.status_code == 200
    assert len(traced.json()["points"]) == 50
    board = client.get("/api/ref/plane", params={"x": "lunaire", "y": "tropique", "window": 100})
    assert board.status_code == 200
    body = board.json()
    assert 1 <= len(body["points"]) <= 100
    assert body["count"] == len(body["points"])
    refused = client.get("/api/ref/plane", params={"x": "f107", "y": "lunaire", "window": 20})
    assert refused.status_code == 400


def test_goes_route_is_503_without_sunpy(monkeypatch: pytest.MonkeyPatch) -> None:
    import synchro.ref.solar_net as solar_net

    def missing(*_args, **_kwargs):
        raise RuntimeError("SunPy n'est pas installé. pip install -r requirements-ref.txt")

    monkeypatch.setattr(solar_net, "goes_search", missing)
    client = TestClient(create_app())
    # The route imports goes_search inside the handler, so patch the module attribute
    # before the call — the handler does `from synchro.ref.solar_net import goes_search`.
    response = client.get(
        "/api/ref/solar/goes",
        params={"start": "2024-04-01", "end": "2024-04-08", "kind": "xrs"},
    )
    assert response.status_code == 503
    assert "SunPy" in response.json()["detail"]
