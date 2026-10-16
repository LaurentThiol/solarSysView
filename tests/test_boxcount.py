"""Comptage de boîtes : masque, relief, mélange."""

from __future__ import annotations

import numpy as np
from fastapi.testclient import TestClient

from synchro.app import create_app
from synchro.fractal.boxcount import (
    binary_box_count,
    column_shuffle,
    fractal_report,
    surface_box_count,
)


def _powers_of_two(scales: list[int]) -> None:
    assert scales == sorted(set(scales))
    assert all(scale >= 2 and scale & (scale - 1) == 0 for scale in scales)


def _sierpinski(n_points: int = 20000, size: int = 512, seed: int = 0) -> np.ndarray:
    rng = np.random.default_rng(seed)
    vertices = np.array([[0.0, 0.0], [1.0, 0.0], [0.5, np.sqrt(3) / 2.0]])
    points = np.zeros((n_points, 2))
    for index in range(1, n_points):
        points[index] = (points[index - 1] + vertices[int(rng.integers(0, 3))]) / 2.0
    span = points.max(axis=0) - points.min(axis=0)
    unit = (points - points.min(axis=0)) / span
    columns = np.clip(np.floor(unit[:, 0] * (size - 1)).astype(int), 0, size - 1)
    rows = np.clip(np.floor(unit[:, 1] * (size - 1)).astype(int), 0, size - 1)
    mask = np.zeros((size, size), dtype=bool)
    mask[rows, columns] = True
    return mask


def test_sierpinski_dimension() -> None:
    fit = binary_box_count(_sierpinski())
    assert fit["dimension"] is not None
    assert 1.50 <= fit["dimension"] <= 1.67
    assert fit["r_squared"] > 0.99
    _powers_of_two(fit["scales"])


def test_line_is_one_and_rectangle_is_two() -> None:
    side = 256
    line = np.zeros((side, side), dtype=bool)
    index = np.arange(side)
    line[index, index] = True
    line_fit = binary_box_count(line)
    assert abs(line_fit["dimension"] - 1.0) <= 0.08
    _powers_of_two(line_fit["scales"])

    full = np.ones((side, side), dtype=bool)
    full_fit = binary_box_count(full)
    assert abs(full_fit["dimension"] - 2.0) <= 0.05
    assert full_fit["sufficient"] is False
    assert full_fit["counts"] == [(side // scale) ** 2 for scale in full_fit["scales"]]


def test_flat_relief_is_two_and_noise_is_rougher() -> None:
    flat = np.full((128, 64), 0.3)
    rough = np.random.default_rng(0).random((128, 64))
    flat_fit = surface_box_count(flat)
    rough_fit = surface_box_count(rough)
    assert abs(flat_fit["dimension"] - 2.0) <= 0.05
    assert rough_fit["dimension"] > flat_fit["dimension"] + 0.3


def test_short_axis_has_no_fractal_regime() -> None:
    height = np.zeros((12, 12))
    height[::2, ::3] = 1.0
    fit = binary_box_count(height >= 0.5)
    report = fractal_report(height, 0.5)
    assert fit["sufficient"] is False
    assert report["mask"]["sufficient"] is False
    assert report["relief"]["sufficient"] is False
    assert "fractale" not in report["phrase"]
    assert "pas de régime fractal" in report["phrase"].lower()


def test_scales_are_distinct_powers_of_two() -> None:
    fit = binary_box_count(np.ones((80, 48), dtype=bool))
    _powers_of_two(fit["scales"])
    assert fit["scales"][0] == 2


def test_shuffle_roughens_a_smooth_relief() -> None:
    draws = np.linspace(0.0, 4.0 * np.pi, 128)
    slots = np.linspace(0.0, 1.0, 64)
    height = np.sin(draws)[:, None] + slots[None, :]
    smooth = surface_box_count(height)["dimension"]
    shuffled = column_shuffle(height, np.random.default_rng(1))
    rough = surface_box_count(shuffled)["dimension"]
    assert rough > smooth + 0.15
    for row, mixed in zip(height, shuffled, strict=True):
        assert np.array_equal(np.sort(row), np.sort(mixed))


def test_edge_band_counts_the_remainder() -> None:
    mask = np.ones((20, 18), dtype=bool)
    fit = binary_box_count(mask)
    assert fit["scales"] == [2, 4]
    # Le minimum sur les décalages couvre le rectangle : ceil(n / s) par côté.
    assert fit["counts"][0] == 10 * 9
    assert fit["counts"][1] == 5 * 5


def test_undivided_rectangle_stays_at_two() -> None:
    assert abs(surface_box_count(np.zeros((200, 50)))["dimension"] - 2.0) <= 1e-9
    assert abs(binary_box_count(np.ones((200, 50), dtype=bool))["dimension"] - 2.0) <= 1e-9


def test_constant_and_empty_have_no_division() -> None:
    constant = surface_box_count(np.zeros((64, 32)))
    assert abs(constant["dimension"] - 2.0) <= 0.05
    empty = binary_box_count(np.zeros((64, 32), dtype=bool))
    assert empty["dimension"] is None
    assert empty["sufficient"] is False


def test_fractal_endpoint() -> None:
    client = TestClient(create_app())
    ragged = client.post("/api/analysis/fractal", json={"height": [[1, 2], [3]], "floor": 0})
    assert ragged.status_code == 400
    height = np.full((64, 32), 0.2).tolist()
    response = client.post("/api/analysis/fractal", json={"height": height, "floor": 0.2})
    assert response.status_code == 200
    body = response.json()
    assert abs(body["relief"]["dimension"] - 2.0) <= 0.05
    assert "fractale" not in body["phrase"]
    assert body["null"]["relief"]["count"] == 32
