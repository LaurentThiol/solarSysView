from __future__ import annotations

from unittest.mock import patch

from fastapi.testclient import TestClient

from synchro.app import create_app
from synchro.db import (
    DEFAULT_GRID_LABEL,
    MAX_GRID_LABEL,
    normalize_grid_label,
)


def _client() -> TestClient:
    return TestClient(create_app())


def test_normalize_grid_label_trims_and_defaults() -> None:
    assert normalize_grid_label("  Retards   longs  ") == "Retards longs"
    assert normalize_grid_label("   ") == DEFAULT_GRID_LABEL
    assert normalize_grid_label(None) == DEFAULT_GRID_LABEL
    assert normalize_grid_label("x" * 200) == "x" * MAX_GRID_LABEL
    assert normalize_grid_label(DEFAULT_GRID_LABEL) == DEFAULT_GRID_LABEL


def test_patch_grid_renames_label() -> None:
    row = {
        "id": 7,
        "label": "Retards longs",
        "numbers": [12, 18, 35, 36, 45],
        "stars": [4, 5],
        "active": True,
    }
    with patch("synchro.db.update_grid_label", return_value=row) as updated:
        with _client() as client:
            response = client.patch("/api/grids/7", json={"label": "Retards longs"})
    assert response.status_code == 200
    assert response.json()["id"] == 7
    assert response.json()["label"] == "Retards longs"
    updated.assert_called_once_with(7, "Retards longs")


def test_patch_grid_missing_returns_404() -> None:
    with patch("synchro.db.update_grid_label", return_value=None):
        with _client() as client:
            response = client.patch("/api/grids/99", json={"label": "Ancienne"})
    assert response.status_code == 404


def test_patch_grid_requires_label() -> None:
    with _client() as client:
        response = client.patch("/api/grids/1", json={})
    assert response.status_code == 422
