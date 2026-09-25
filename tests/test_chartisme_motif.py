"""Graphe de visibilité et motifs stables."""

from synchro.chartisme.figures import detect_figures
from synchro.chartisme.graph import EDGE_DIM, NODE_DIM, build_graph
from synchro.chartisme.motif import (
    build_network,
    horizontal_visibility,
    read_figures,
    same_motif,
)


def _piecewise(points: list[tuple[int, float]]) -> list[float]:
    values: list[float] = []
    for (start, y0), (stop, y1) in zip(points, points[1:]):
        for index in range(start, stop):
            values.append(y0 + (y1 - y0) * (index - start) / (stop - start))
    values.append(points[-1][1])
    return values


def _ete() -> list[float]:
    return _piecewise([(0, 10), (5, 6), (12, 16), (18, 6), (24, 10), (30, 4), (40, 3)])


def _rectangle() -> list[float]:
    return [10.0 if (index // 8) % 2 == 0 else 4.0 for index in range(41)]


def test_horizontal_visibility_blocks_the_head_and_joins_a_double_top() -> None:
    blocked = horizontal_visibility([2, 5, 2])
    assert (0, 2) not in blocked
    assert (0, 1) in blocked and (1, 2) in blocked
    seen = horizontal_visibility([2, 1, 2])
    assert (0, 2) in seen


def test_ete_is_stable_across_tolerances() -> None:
    hits = read_figures(_ete())
    ete = next(hit for hit in hits if hit["figure"] == "ete")
    assert ete["persistence"] == 1.0
    assert {pivot["role"] for pivot in ete["pivots"]} >= {
        "left_shoulder",
        "head",
        "right_shoulder",
        "neck_left",
        "neck_right",
    }
    assert ete["detector"] == "motif"


def test_rectangle_survives_two_tolerances() -> None:
    hits = read_figures(_rectangle())
    rectangle = next(hit for hit in hits if hit["figure"] == "rectangle")
    assert rectangle["persistence"] >= 2 / 3 - 1e-9
    assert rectangle["confidence"] > 0.5


def test_shuffled_noise_is_not_a_stable_motif() -> None:
    import random

    rng = random.Random(0)
    noise = [0.0]
    for _ in range(80):
        noise.append(noise[-1] + rng.uniform(-1, 1))
    assert read_figures(noise) == []


def test_agreement_confirms_geometry_without_replacing_it() -> None:
    values = _ete()
    alone = detect_figures(values, motifs=False)
    both = detect_figures(values)
    geo = next(hit for hit in alone if hit["figure"] == "ete")
    agreed = next(hit for hit in both if hit["figure"] == "ete")
    assert agreed["detector"] == "geometric"
    assert agreed["pivots"] == geo["pivots"]
    assert agreed["agreed"] is True
    assert agreed["confidence"] + 1e-9 >= geo["confidence"]


def test_same_motif_tolerates_a_few_bars() -> None:
    left = {"figure": "ete", "pivots": [{"role": "head", "index": 10}, {"role": "top", "index": 4}]}
    right = {"figure": "ete", "pivots": [{"role": "head", "index": 12}, {"role": "top", "index": 4}]}
    shifted = {"figure": "ete", "pivots": [{"role": "head", "index": 20}, {"role": "top", "index": 4}]}
    assert same_motif(left, right)
    assert not same_motif(left, shifted)


def test_graph_v2_adds_visibility_without_touching_v1_dimensions() -> None:
    values = _ete()
    current = build_graph(values)
    newer = build_graph(values, version=2)
    assert current["graph_version"] == 1
    assert current["node_dim"] == NODE_DIM
    assert current["edge_dim"] == EDGE_DIM
    assert len(current["nodes"][0]) == NODE_DIM
    assert newer["graph_version"] == 2
    assert newer["node_dim"] == 12
    assert newer["edge_dim"] == 11
    assert "hvg" in newer["edge_kinds"]
    assert "nvg" in newer["edge_kinds"]
    assert newer["word"]
    network = build_network(values, tau=0.04)
    assert network["graph_version"] == 2
    assert any(edge["kind"] == "hvg" for edge in network["edges"])
