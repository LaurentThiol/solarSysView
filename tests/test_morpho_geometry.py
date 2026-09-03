from synchro.morpho.board import (
    canvas_size,
    cell_center,
    number_cell,
    numbers_origin,
    pixel_to_norm,
    point_to_number,
    star_cell,
)
from synchro.morpho.geometry import detect
from synchro.morpho.lexicon import MOTIF_IDS


def test_cells() -> None:
    assert number_cell(1) == (0, 0)
    assert number_cell(10) == (0, 9)
    assert number_cell(23) == (2, 2)
    assert number_cell(50) == (4, 9)
    assert star_cell(1) == (0, 0)
    assert star_cell(7) == (1, 0)
    assert star_cell(12) == (1, 5)


def test_horizontal_line() -> None:
    p = detect([1, 2, 3, 4, 5], [1, 2])
    assert "align_h" in p["motifs"]
    assert "line" in p["motifs"]
    assert "top" in p["motifs"]
    assert "cluster" in p["motifs"]
    assert "stars_adj" in p["motifs"]
    assert "stars_same_row" in p["motifs"]
    assert "wedge" not in p["motifs"]


def test_vertical_and_diagonal() -> None:
    vertical = detect([1, 11, 21, 31, 41], [1, 12])
    assert "align_v" in vertical["motifs"]
    assert "line" in vertical["motifs"]
    assert "left" in vertical["motifs"]
    assert "stars_adj" not in vertical["motifs"]

    diagonal = detect([1, 12, 23, 34, 45], [3, 4])
    assert "diagonal" in diagonal["motifs"]
    assert "line" in diagonal["motifs"]


def test_cluster_center_mirror_w() -> None:
    cluster = detect([22, 23, 24, 32, 33], [5, 6])
    assert "cluster" in cluster["motifs"]
    assert "center" in cluster["motifs"]

    mirror = detect([1, 10, 21, 30, 45], [2, 8])
    assert "mirror_v" in mirror["motifs"]

    assert set(cluster["motifs"]).issubset(set(MOTIF_IDS))
    assert len(cluster["flags"]) == len(MOTIF_IDS)


def test_w_shape_detector() -> None:
    # 11+20 / 25 / 31+40 : rangées 1-2-3, effectifs 2-1-2
    p = detect([11, 20, 25, 31, 40], [1, 2])
    assert "w_shape" in p["motifs"]


def test_point_projection_roundtrip() -> None:
    n = 23
    row, col = number_cell(n)
    cx, cy = cell_center(numbers_origin(), row, col)
    xn, yn = pixel_to_norm(cx, cy)
    assert point_to_number(xn, yn) == n
    width, height = canvas_size()
    assert width > 0 and height > 0
