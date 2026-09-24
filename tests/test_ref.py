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
