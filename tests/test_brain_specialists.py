from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from fastapi.testclient import TestClient

from synchro.app import create_app
from synchro.brain_specialists import (
    delete_specialist,
    infer_specialist,
    list_specialists,
    load_specialist,
    train_specialist,
)
from synchro.brain_specialists.features import series_matrix, validate_indicators
from synchro.brain_specialists.store import slugify
from synchro.brain_specialists.train import build_dataset, make_uniform_draws


def test_slugify_strips_accents() -> None:
    assert slugify("Père impair") == "pere-impair"
    assert slugify("Somme totale") == "somme-totale"


def test_unknown_indicator_is_rejected() -> None:
    try:
        validate_indicators(["rsi", "not-a-feature"])
    except ValueError as exc:
        assert "inconnu" in str(exc)
    else:
        raise AssertionError("expected ValueError")


def test_features_are_causal_prefix_equals_full() -> None:
    values = [float(x) for x in range(80)]
    names = ["lag1", "lag2", "rsi", "macd", "bollinger", "sma", "zscore", "slope"]
    full = series_matrix(values, names)
    for t in range(40, 80):
        prefix = series_matrix(values[: t + 1], names)
        np.testing.assert_allclose(prefix[-1], full[t], equal_nan=True, rtol=1e-9, atol=1e-9)


def test_features_ignore_the_future() -> None:
    values = [float((i * 17) % 50) for i in range(60)]
    names = ["rsi", "macd", "bollinger", "lag1", "lag2"]
    base = series_matrix(values, names)
    mutated = list(values)
    mutated[-1] = 999.0
    other = series_matrix(mutated, names)
    np.testing.assert_allclose(base[-2], other[-2], equal_nan=True)


def test_dataset_target_is_next_draw_not_current() -> None:
    draws = make_uniform_draws(80, seed=3)
    data = build_dataset(draws, target="sum", indicators=["lag1"], task="regression", horizon="value")
    values = data["values"]
    for row_i, feat_i in enumerate(data["feature_index"]):
        assert data["y"][row_i] == values[feat_i + 1]
        assert data["x"][row_i, 0] == values[feat_i]


def test_iid_mlp_does_not_beat_chance_by_much(tmp_path: Path) -> None:
    draws = make_uniform_draws(280, seed=11)
    record = train_specialist(
        draws,
        name="Hasard somme",
        target="sum",
        indicators=["lag1", "lag2", "rsi", "bollinger"],
        instructions="Série i.i.d. : le skill doit rester près de zéro.",
        task="regression",
        epochs=40,
        hidden=8,
        seed=11,
        force=True,
        root=tmp_path,
    )
    assert record["saved"] is True
    skill = float(record["skill"] or 0)
    assert skill < 0.35, skill


def test_save_load_infer_roundtrip(tmp_path: Path) -> None:
    draws = make_uniform_draws(120, seed=5)
    record = train_specialist(
        draws,
        name="Père impair",
        target="parity",
        indicators=["lag1", "lag2", "rsi"],
        instructions="Forecast du nombre de pairs. Pas une grille.",
        task="classes",
        epochs=30,
        hidden=8,
        seed=5,
        force=True,
        root=tmp_path,
    )
    assert record["saved"] is True
    packed = load_specialist("pere-impair", root=tmp_path)
    assert packed["config"]["target"] == "parity"
    assert (tmp_path / "pere-impair" / "weights.npz").exists()
    inferred = infer_specialist(draws, "pere-impair", root=tmp_path)
    assert inferred["forecast"]["ok"] is True
    assert inferred["forecast"]["value"] is not None
    assert "pas d’une grille" in (inferred["disclaimer"] or "")


def test_refuses_to_save_when_skill_not_positive(tmp_path: Path) -> None:
    draws = make_uniform_draws(160, seed=2)
    record = train_specialist(
        draws,
        name="Somme totale",
        target="sum",
        indicators=["lag1", "rsi", "macd"],
        instructions="Ne sauver que si le skill bat le nul.",
        task="regression",
        epochs=25,
        hidden=8,
        seed=2,
        force=False,
        root=tmp_path,
    )
    if record["skill"] is not None and float(record["skill"]) <= 0:
        assert record["saved"] is False
        assert record["reason"]
        assert not (tmp_path / "somme-totale" / "weights.npz").exists()


def test_instructions_are_required() -> None:
    try:
        train_specialist(
            make_uniform_draws(40, seed=1),
            name="X",
            target="sum",
            indicators=["lag1"],
            instructions="  ",
            force=True,
        )
    except ValueError as exc:
        assert "Instructions" in str(exc)
    else:
        raise AssertionError("expected ValueError")


def _patch_specialists(monkeypatch, tmp_path: Path, draws: list) -> None:
    monkeypatch.setattr("synchro.db.database_configured", lambda: False)
    monkeypatch.setattr("synchro.app.ROOT", tmp_path)
    snapshot = tmp_path / "src" / "data"
    snapshot.mkdir(parents=True)
    snapshot.joinpath("euromillions-2026.json").write_text(json.dumps(draws), encoding="utf-8")

    def train(draws_, **kwargs):
        kwargs["root"] = tmp_path
        return train_specialist(draws_, **kwargs)

    monkeypatch.setattr("synchro.brain_specialists.train_specialist", train)
    monkeypatch.setattr(
        "synchro.brain_specialists.list_specialists",
        lambda **kwargs: list_specialists(root=tmp_path),
    )
    monkeypatch.setattr(
        "synchro.brain_specialists.infer_specialist",
        lambda draws_, slug, **kwargs: infer_specialist(draws_, slug, root=tmp_path),
    )
    monkeypatch.setattr(
        "synchro.brain_specialists.delete_specialist",
        lambda slug, **kwargs: delete_specialist(slug, root=tmp_path),
    )
    monkeypatch.setattr(
        "synchro.brain_specialists.load_specialist",
        lambda slug, **kwargs: load_specialist(slug, root=tmp_path),
    )


def test_specialist_api_train_list_infer_delete(tmp_path: Path, monkeypatch) -> None:
    draws = make_uniform_draws(140, seed=9)
    _patch_specialists(monkeypatch, tmp_path, draws)
    with TestClient(create_app()) as client:
        created = client.post(
            "/api/brain/specialists",
            json={
                "name": "Père impair",
                "target": "parity",
                "indicators": ["lag1", "lag2", "rsi"],
                "instructions": "Forecast pair/impair. Pas une grille.",
                "task": "classes",
                "force": True,
                "epochs": 20,
                "hidden": 8,
            },
        )
        assert created.status_code == 200, created.text
        body = created.json()
        assert body["saved"] is True
        assert body["handle"] == "specialist.pere-impair"

        listed = client.get("/api/brain/specialists")
        assert listed.status_code == 200
        slugs = [item["slug"] for item in listed.json()["items"]]
        assert "pere-impair" in slugs

        inferred = client.post("/api/brain/specialists/pere-impair/infer")
        assert inferred.status_code == 200, inferred.text
        assert inferred.json()["forecast"]["ok"] is True

        features = client.get("/api/brain/specialists/features")
        assert features.status_code == 200
        ids = [item["id"] for item in features.json()["items"]]
        assert "rsi" in ids and "lag1" in ids

        deleted = client.delete("/api/brain/specialists/pere-impair")
        assert deleted.status_code == 200
        assert client.get("/api/brain/specialists").json()["items"] == []


def test_brain_prompt_allows_specialist_forecast() -> None:
    src = (Path(__file__).resolve().parents[1] / "src/lib/brain/prompt.ts").read_text(encoding="utf-8")
    assert "@specialist" in src
    assert "tu PEUX citer leur forecast" in src
    assert "hypothèse" in src
    assert "refuse" not in src
