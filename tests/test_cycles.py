"""Registre de cycles, panneau, et TFT quand torch est là."""

from datetime import date, timedelta

import numpy as np
import pytest
from fastapi.testclient import TestClient

from synchro.app import create_app
from synchro.cycles.interpret import compare_signatures, fold_attention
from synchro.cycles.panel import build_panel, registry_payload
from synchro.cycles.registry import dominant_period, lunar_phase, sincos


def _draws(n: int = 80, seed: int = 1) -> list[dict]:
    import random

    from synchro.analysis.montecarlo import simulate_draw

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


def test_lunar_phase_matches_ref_fraction() -> None:
    from synchro.ref.cycles import lunar_state

    day = date(2024, 4, 8)
    phase = lunar_phase([day])[0]
    assert phase == pytest.approx(lunar_state(day)["fraction"])
    sine, cosine = sincos(np.array([0.0, 0.25]))
    assert sine[0] == pytest.approx(0.0, abs=1e-9)
    assert cosine[1] == pytest.approx(0.0, abs=1e-9)


def test_dominant_period_of_a_sine() -> None:
    t = np.arange(128)
    values = np.sin(2 * np.pi * t / 16.0)
    packed = dominant_period(values, 104.0)
    assert packed["period_draws"] == pytest.approx(16.0, abs=0.6)


def test_registry_aligns_clocks_on_the_draw_index() -> None:
    panel = build_panel(_draws(60), variable="sum", warmup=8)
    payload = registry_payload(panel)
    ids = {row["id"] for row in payload["channels"]}
    for needed in (
        "lunar:sin",
        "carrington:sin",
        "harmo:sin",
        "chartisme:occupancy",
        "morpho:gap_std",
        "relief:centroid",
        "pronostic:z",
        "series:sum",
    ):
        assert needed in ids
    lunar = next(row for row in payload["channels"] if row["id"] == "lunar:sin")
    assert lunar["module"] == "ref"
    assert lunar["role"] == "known"
    assert lunar["phase"] is not None
    from synchro.cycles.panel import panel_payload

    view = panel_payload(panel)
    for key in ("target", "lunar", "harmo", "occupancy", "activity", "morpho", "relief", "residual"):
        assert key in view["series"]
        assert len(view["series"][key]) == len(view["dates"])
    assert panel["past"].shape[0] == panel["known"].shape[0] == 60
    assert panel["past"].shape[1] == 23
    delay = build_panel(_draws(40), variable="delay", n=7, warmup=0)
    assert any(note["id"] == "delay_saw" for note in delay["notes"])


def test_fold_attention_locks_a_constant_phase_bin() -> None:
    attention = np.zeros((2, 1, 4))
    attention[:, 0, :] = 1.0
    phases = np.linspace(0.0, 0.2, 12)
    origins = np.array([4, 8])
    mass = fold_attention(attention, phases, origins, encoder=4, bins=8)
    assert abs(sum(mass) - 1.0) < 1e-6
    assert max(mass) > 0.5
    next_step = fold_attention(attention, phases, origins, encoder=4, bins=8, step=0)
    assert next_step == mass


def test_fold_attention_keeps_the_first_step_apart() -> None:
    attention = np.zeros((1, 2, 4))
    attention[0, 0, 0] = 1.0
    attention[0, 1, 3] = 1.0
    phases = np.array([0.0, 0.1, 0.2, 0.9, 0.0])
    origins = np.array([4])
    horizon = fold_attention(attention, phases, origins, encoder=4, bins=8)
    nxt = fold_attention(attention, phases, origins, encoder=4, bins=8, step=0)
    assert horizon[0] == pytest.approx(0.5)
    assert horizon[-1] == pytest.approx(0.5)
    assert nxt[0] == pytest.approx(1.0)
    assert nxt[-1] == pytest.approx(0.0)


def test_baseline_and_grouped_weights() -> None:
    from synchro.cycles.interpret import _baseline_pinball, _group_weights

    train = np.array([0.0, 1.0, 2.0, 3.0, 4.0])
    future = np.array([[1.0, 2.0], [3.0, 0.0]])
    loss = _baseline_pinball(train, future)
    assert loss > 0
    grouped = _group_weights(
        np.array([0.1, 0.2, 0.3, 0.05]),
        [
            {"id": "lunar", "label": "Lune", "columns": [1, 2]},
            {"id": "weekday", "label": "Mardi", "columns": [0]},
        ],
    )
    assert grouped[0]["id"] == "lunar"
    assert grouped[0]["value"] == pytest.approx(0.5)
    assert grouped[1]["value"] == pytest.approx(0.1)


def test_quantile_head_is_ordered() -> None:
    torch = pytest.importorskip("torch")
    from synchro.cycles.model import TemporalFusion

    torch.manual_seed(0)
    model = TemporalFusion(n_past=3, n_known=4, n_static=2, d_model=8)
    past = torch.randn(5, 6, 3)
    known = torch.randn(5, 8, 4)
    static = torch.randn(5, 2)
    out = model(past, known, static, encoder_len=6)
    q = out["quantiles"]
    assert torch.all(q[..., 0] <= q[..., 1] + 1e-6)
    assert torch.all(q[..., 1] <= q[..., 2] + 1e-6)


def test_compare_signatures_cosine() -> None:
    left = {"vsn_known": [1.0, 0.0], "vsn_past": [1.0, 0.0], "known_ids": ["a", "b"]}
    right = {"vsn_known": [1.0, 0.0], "vsn_past": [0.0, 1.0], "known_ids": ["a", "b"]}
    out = compare_signatures(left, right)
    assert out["cosine_known"] == pytest.approx(1.0)
    assert out["cosine_past"] == pytest.approx(0.0)


def test_cycles_registry_route() -> None:
    from unittest.mock import patch

    draws = _draws(48)
    with (
        patch("synchro.db.database_configured", return_value=True),
        patch("synchro.db.all_draws", return_value=draws),
    ):
        with TestClient(create_app()) as client:
            response = client.get("/api/cycles/registry?variable=sum&preset=last_50&warmup=0")
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["draw_count"] >= 16
    assert any(row["id"] == "lunar:sin" for row in body["channels"])


def test_cycles_fit_walk_forward() -> None:
    from unittest.mock import patch

    pytest.importorskip("torch")
    draws = _draws(90)
    with (
        patch("synchro.db.database_configured", return_value=True),
        patch("synchro.db.all_draws", return_value=draws),
    ):
        with TestClient(create_app()) as client:
            response = client.post(
                "/api/cycles/fit?variable=sum&preset=last_100&warmup=0"
                "&encoder=16&horizon=4&hidden=8&epochs=2&seed=0"
            )
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    signature = body["signature"]
    assert len(signature["vsn_known"]) == len(signature["known_ids"])
    assert len(signature["vsn_past_without_target"]) == len(signature["past_ids"])
    assert signature["copy_id"] == "series:sum"
    assert "copy_weight" in signature
    grouped_ids = {row["id"] for row in signature["vsn_known_grouped"]}
    assert "lunar" in grouped_ids
    assert "harmo" in grouped_ids
    lunar = next(row for row in signature["vsn_known_grouped"] if row["id"] == "lunar")
    sin_i = signature["known_ids"].index("lunar:sin")
    cos_i = signature["known_ids"].index("lunar:cos")
    assert lunar["value"] == pytest.approx(
        signature["vsn_known"][sin_i] + signature["vsn_known"][cos_i], abs=1e-4
    )
    assert body["baseline_loss"] == signature["baseline_loss"]
    assert body["loss_ratio"] == signature["loss_ratio"]
    assert 0.0 <= body["coverage"] <= 1.0
    fold = signature["attention"]["lunar"]
    assert len(fold["mass_next"]) == len(fold["mass"])
    assert {row["id"] for row in signature["nulls"]} == {"shuffle", "phase", "iid"}
    assert next(row["label"] for row in signature["nulls"] if row["id"] == "iid") == "Entrées i.i.d."
    assert signature["ablation"]
    for row in signature["ablation"]:
        assert row["wins"] == (row["delta"] > 0 and signature["beats_baseline"])
        assert row["beats_nulls"] == signature["beats_nulls"]
    for point in body["ribbon"]:
        assert point["q10"] <= point["q50"] <= point["q90"]
