from datetime import date
from unittest.mock import patch

from fastapi.testclient import TestClient

from synchro.app import create_app


def _client() -> TestClient:
    return TestClient(create_app())


DRAWS = [
    {
        "draw_date": date(2026, 8, 21),
        "weekday": "mardi",
        "numbers": [1, 2, 3, 4, 5],
        "stars": [1, 2],
        "star_pool": 12,
    },
    {
        "draw_date": date(2026, 8, 25),
        "weekday": "vendredi",
        "numbers": [1, 6, 7, 8, 9],
        "stars": [1, 3],
        "star_pool": 12,
    },
    {
        "draw_date": date(2026, 8, 28),
        "weekday": "mardi",
        "numbers": [1, 10, 11, 12, 13],
        "stars": [4, 5],
        "star_pool": 12,
    },
]


def test_proba_does_not_need_neon() -> None:
    with _client() as client:
        response = client.get("/api/analysis/proba")
    assert response.status_code == 200
    body = response.json()
    assert body["total_grids"] == 139_838_160
    assert abs(sum(row["p"] for row in body["ranks"]) - 1.0) < 1e-9


def test_variables_uses_provided_draws() -> None:
    with (
        patch("synchro.db.database_configured", return_value=True),
        patch("synchro.db.all_draws", return_value=DRAWS) as loaded,
    ):
        with _client() as client:
            response = client.get("/api/analysis/variables?name=sum&era=current")
    assert response.status_code == 200
    body = response.json()
    assert body["draw_count"] == 3
    assert body["values"] == [15.0, 31.0, 47.0]
    loaded.assert_called_once_with(era="current")


def test_from_date_filters_draws() -> None:
    with (
        patch("synchro.db.database_configured", return_value=True),
        patch("synchro.db.all_draws", return_value=DRAWS),
    ):
        with _client() as client:
            response = client.get("/api/analysis/variables?name=sum&from_date=2026-08-25")
    assert response.json()["draw_count"] == 2
    assert response.json()["values"] == [31.0, 47.0]


def test_ohlc_and_inference_and_lab() -> None:
    with (
        patch("synchro.db.database_configured", return_value=True),
        patch("synchro.db.all_draws", return_value=DRAWS),
    ):
        with _client() as client:
            ohlc = client.get("/api/analysis/ohlc?block=window&window=2&heikin=true")
            inf = client.get("/api/analysis/inference")
            mc = client.get("/api/analysis/montecarlo?n=20&seed=0")
            lab = client.get("/api/analysis/lab?n_sim=20")
            ta = client.get("/api/analysis/ta?name=sum&window=2")
    assert ohlc.status_code == 200
    assert "heikin_ashi" in ohlc.json()
    assert inf.json()["draw_count"] == 3
    assert mc.json()["seed"] == 0
    assert lab.json()["variable"]["values"] == [15.0, 31.0, 47.0]
    assert "indépendant" in lab.json()["ta"]["disclaimer"]
    assert lab.json()["ta"]["periods"]["sma"] == 20
    assert ta.status_code == 200
    assert ta.json()["last"]["sma"] == 39.0
    assert "extended" in ta.json()
    assert "window" in ta.json()


def test_lab_last_n_window() -> None:
    with (
        patch("synchro.db.database_configured", return_value=True),
        patch("synchro.db.all_draws", return_value=DRAWS),
    ):
        with _client() as client:
            lab = client.get("/api/analysis/lab?n_sim=5&last_n=2&warmup=1")
    body = lab.json()
    assert body["variable"]["values"] == [31.0, 47.0]
    assert body["window"]["warmup_count"] == 1
    assert body["draw_count"] == 2
