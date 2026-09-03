from synchro.morpho.board import cell_center, number_cell, numbers_origin, pixel_to_norm
from synchro.morpho.vlm import (
    analyze,
    geometry_queries,
    grounding_score,
    parse_label,
    project_points,
    status,
)


def test_parse_label() -> None:
    assert parse_label("The cluster is compact and tight", "compact|spread|mixed") == "compact"
    assert parse_label("yes they line up", "yes|no") == "yes"
    assert parse_label("unclear", "adjacent|apart|unclear") == "unclear"
    assert parse_label("nothing useful", "yes|no") is None


def test_grounding_and_projection() -> None:
    assert grounding_score([1, 2, 3], [1, 2, 3]) == 1.0
    assert grounding_score([1, 2], [1, 2, 3]) == 2 / 3
    assert grounding_score([], [1]) == 0.0
    n = 7
    row, col = number_cell(n)
    cx, cy = cell_center(numbers_origin(), row, col)
    x, y = pixel_to_norm(cx, cy)
    assert project_points([{"x": x, "y": y}], kind="number") == [n]


def test_analyze_without_backend_uses_geometry() -> None:
    state = analyze([1, 2, 3, 4, 5], [1, 2])
    assert state["vlm"] is False
    assert state["backend"] is None
    assert "align_h" in state["motifs"]
    queries = geometry_queries(state)
    assert queries["collinear"] == "yes"
    assert queries["stars"] == "adjacent"
    assert status()["loaded"] is False
    assert "prompt_id" in status()
