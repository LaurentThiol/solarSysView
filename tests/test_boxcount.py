"""Comptage de boîtes : masque, relief 3D, mélange."""

from __future__ import annotations

import numpy as np
from fastapi.testclient import TestClient

from synchro.app import create_app
from synchro.fractal.boxcount import (
    X_SPAN,
    Y_GAIN,
    Z_SPAN,
    binary_box_count,
    column_shuffle,
    fractal_report,
    mesh_area_ratio,
    mesh_box_count,
    mesh_scales,
    surface_box_count,
    variogram_roughness,
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
    assert report["surface"]["sufficient"] is False
    assert report["roughness"]["sufficient"] is False
    assert report["area"]["ratio"] > 1.0
    assert "fractale" not in report["phrase"]
    assert "dimension" not in report["phrase"].lower()
    assert "pas de régime" in report["phrase"].lower()
    assert "masque" not in report["phrase"].lower()


def test_flat_area_is_one_and_plane_matches_its_slope() -> None:
    flat = mesh_area_ratio(np.zeros((90, 48)))
    assert abs(flat["ratio"] - 1.0) <= 1e-9
    draws = 90
    g = 0.8
    x = np.linspace(0.0, X_SPAN, draws)
    plane = (g * x / Y_GAIN)[:, None] * np.ones(48)
    tilted = mesh_area_ratio(plane)
    assert abs(tilted["ratio"] - np.sqrt(1.0 + g * g)) <= 1e-6

    slots = np.linspace(0.0, 1.0, 48)
    sheet = np.tile(slots, (draws, 1))
    slot_slope = Y_GAIN / Z_SPAN
    assert abs(mesh_area_ratio(sheet)["ratio"] - np.sqrt(1.0 + slot_slope**2)) <= 1e-6


def test_variogram_of_a_ramp_is_smooth_and_noise_is_rough() -> None:
    slots = np.linspace(0.0, 1.0, 48)
    ramp = np.tile(slots, (90, 1))
    smooth = variogram_roughness(ramp)
    assert smooth["exponent"] is not None
    assert smooth["exponent"] <= 0.02
    assert smooth["sufficient"] is True
    assert smooth["lags"] == [1, 2, 4, 8]

    noise = variogram_roughness(np.random.default_rng(0).random((90, 48)))
    assert noise["exponent"] > smooth["exponent"] + 0.5
    assert noise["sufficient"] is False


def test_shuffle_raises_area_and_roughness() -> None:
    slots = np.linspace(0.0, 1.0, 48)
    height = np.tile(slots, (90, 1))
    shuffled = column_shuffle(height, np.random.default_rng(1))
    assert mesh_area_ratio(shuffled)["ratio"] > mesh_area_ratio(height)["ratio"] + 0.2
    assert variogram_roughness(shuffled)["exponent"] > variogram_roughness(height)["exponent"] + 0.4


def test_mesh_flat_is_two_and_a_plane_stays_a_sheet() -> None:
    flat = mesh_box_count(np.zeros((90, 48)))
    assert abs(flat["dimension"] - 2.0) <= 1e-6
    assert flat["n_scales"] >= 4
    assert flat["sufficient"] is False
    successive = [flat["scales"][i + 1] / flat["scales"][i] for i in range(flat["n_scales"] - 1)]
    assert all(abs(ratio - 2.0) < 1e-9 for ratio in successive)

    draws = 90
    g = 0.8
    x = np.linspace(0.0, X_SPAN, draws)
    plane = (g * x / Y_GAIN)[:, None] * np.ones(48)
    tilted = mesh_box_count(plane)
    assert abs(tilted["dimension"] - 2.0) <= 0.05


def test_mesh_cliff_fills_the_face_and_noise_is_rougher() -> None:
    shape = (90, 48)
    flat = mesh_box_count(np.zeros(shape))
    cliff_height = np.zeros(shape)
    cliff_height[:, shape[1] // 2 :] = 2.0
    cliff = mesh_box_count(cliff_height)
    assert cliff["counts"][0] > flat["counts"][0] * 1.2
    assert abs(cliff["dimension"] - 2.0) <= 0.08

    rough = mesh_box_count(np.random.default_rng(0).random(shape))
    assert rough["dimension"] > flat["dimension"] + 0.25


def test_mesh_shuffle_roughens_a_smooth_sheet() -> None:
    draws = np.linspace(0.0, 4.0 * np.pi, 90)
    slots = np.linspace(0.0, 1.0, 48)
    height = 0.05 * np.sin(draws)[:, None] + slots[None, :]
    smooth = mesh_box_count(height)["dimension"]
    shuffled = column_shuffle(height, np.random.default_rng(1))
    rough = mesh_box_count(shuffled)["dimension"]
    assert rough > smooth + 0.15
    assert mesh_scales(90, 48).size >= 4


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
    height = np.full((90, 48), 0.2).tolist()
    response = client.post("/api/analysis/fractal", json={"height": height})
    assert response.status_code == 200
    body = response.json()
    assert abs(body["surface"]["dimension"] - 2.0) <= 1e-6
    assert abs(body["area"]["ratio"] - 1.0) <= 1e-9
    assert body["roughness"]["exponent"] == 0.0
    assert body["roughness"]["flat"] is True
    assert "fractale" not in body["phrase"]
    assert "nappe plate" in body["phrase"].lower()
    assert "masque" not in body["phrase"].lower()
    assert body["null"]["surface"]["count"] == 32
    assert body["null"]["area"]["count"] == 32
    assert body["null"]["roughness"]["count"] == 32
    moved = client.post("/api/analysis/fractal", json={"height": height, "floor": 40})
    assert moved.status_code == 200
    moved_body = moved.json()
    assert moved_body["surface"]["dimension"] == body["surface"]["dimension"]
    assert moved_body["area"]["ratio"] == body["area"]["ratio"]
