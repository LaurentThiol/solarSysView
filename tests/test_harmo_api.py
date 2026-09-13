from datetime import date, timedelta
from unittest.mock import patch

from fastapi.testclient import TestClient

from synchro.analysis.montecarlo import simulate_draw
from synchro.app import create_app


def _client() -> TestClient:
    return TestClient(create_app())


def _draws(n: int = 80, seed: int = 0) -> list[dict]:
    import random

    rng = random.Random(seed)
    day = date(2018, 1, 2)
    rows: list[dict] = []
    while len(rows) < n:
        if day.weekday() in (1, 4):
            nums, stars = simulate_draw(rng)
            rows.append(
                {
                    "draw_date": day,
                    "weekday": "mardi" if day.weekday() == 1 else "vendredi",
                    "numbers": nums,
                    "stars": stars,
                    "star_pool": 12,
                }
            )
        day += timedelta(days=1)
    return rows


def test_harmo_status_does_not_need_neon() -> None:
    with _client() as client:
        response = client.get("/api/harmo/status")
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["scipy"] is True
    assert "disclaimer" in body


def test_harmo_unmix_shape() -> None:
    draws = _draws(80)
    with (
        patch("synchro.db.database_configured", return_value=True),
        patch("synchro.db.all_draws", return_value=draws),
    ):
        with _client() as client:
            response = client.get(
                "/api/harmo/unmix?variable=sum&era=current&preset=last_100&last_n=80"
            )
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    shares = body["shares"]
    assert abs(sum(shares.values()) - 1.0) < 1e-6
    assert set(shares) == {"grid", "mechanical", "acoustic"}
    assert "components" in body
    assert body["draw_count"] == 80
    assert body["variable"] == "sum"


def test_harmo_spectrum_and_stft() -> None:
    draws = _draws(64)
    with (
        patch("synchro.db.database_configured", return_value=True),
        patch("synchro.db.all_draws", return_value=draws),
    ):
        with _client() as client:
            spec = client.get("/api/harmo/spectrum?variable=sum&last_n=64&preset=last_100")
            stft = client.get("/api/harmo/stft?variable=sum&last_n=64&preset=last_100")
            env = client.get("/api/harmo/envelope?variable=sum&last_n=64&preset=last_100")
            welch = client.get("/api/harmo/welch?variable=sum&last_n=64&preset=last_100")
    assert spec.status_code == 200
    assert spec.json()["fft"]["points"]
    assert spec.json()["lombscargle"]["points"]
    assert stft.json()["stft"]["z"]
    assert env.json()["envelope"]
    assert welch.json()["welch"]["points"]


def test_harmo_short_window() -> None:
    draws = _draws(40)
    with (
        patch("synchro.db.database_configured", return_value=True),
        patch("synchro.db.all_draws", return_value=draws),
    ):
        with _client() as client:
            response = client.get("/api/harmo/spectrum?variable=sum&last_n=8&preset=last_100")
    body = response.json()
    assert response.status_code == 200
    assert body["ok"] is False
    assert "trop courte" in body["error"]


def test_harmo_delay_notes() -> None:
    draws = _draws(48)
    with (
        patch("synchro.db.database_configured", return_value=True),
        patch("synchro.db.all_draws", return_value=draws),
    ):
        with _client() as client:
            response = client.get(
                "/api/harmo/unmix?variable=delay&n=7&last_n=48&preset=last_100"
            )
    body = response.json()
    assert response.status_code == 200
    ids = {note["id"] for note in body["notes"]}
    assert "delay_saw" in ids


def test_harmo_null() -> None:
    draws = _draws(40)
    with (
        patch("synchro.db.database_configured", return_value=True),
        patch("synchro.db.all_draws", return_value=draws),
    ):
        with _client() as client:
            response = client.get(
                "/api/harmo/null?variable=sum&last_n=40&preset=last_100&n_sim=8"
            )
    body = response.json()
    assert response.status_code == 200
    assert body["n_sim"] == 8
    assert 0.0 <= body["peak"]["p_ge_observed"] <= 1.0
