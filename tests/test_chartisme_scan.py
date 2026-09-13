"""Balayage de l'archive, export des courbes et cycle autonome."""

import math
from random import Random
from typing import Any

from synchro.chartisme.export import (
    BALL_VARIABLES,
    PLAIN_VARIABLES,
    STAR_VARIABLES,
    build_curve,
    bundle_index,
    curve_id,
    curve_label,
    curve_specs,
    export_curves,
    manifest,
    parse_curve_id,
    read_bundle,
    write_bundle,
)
from synchro.chartisme.graph import build_graph, graph_summary
from synchro.chartisme.pivots import swing_pivots
from synchro.chartisme.scan import (
    DEFAULT_SCALES,
    MIN_WINDOW,
    collapse_zones,
    live_in_window,
    outcome_stats,
    sample_by_figure,
    scan_bundle,
    scan_curve,
    slice_curve,
    window_starts,
    windows_for_training,
    windows_of,
)
from synchro.chartisme.synth import make_dataset

def _draw(index: int) -> dict[str, Any]:
    rng = Random(index)
    return {
        "draw_date": f"2024-{1 + index // 28:02d}-{1 + index % 28:02d}",
        "weekday": "mardi" if index % 2 else "vendredi",
        "numbers": sorted(rng.sample(range(1, 51), 5)),
        "stars": sorted(rng.sample(range(1, 13), 2)),
        "star_pool": 12,
    }


DRAWS = [_draw(i) for i in range(150)]


def test_window_starts_always_reaches_the_tail() -> None:
    """Sans la dernière fenêtre, une figure toute fraîche serait invisible."""
    starts = window_starts(100, 30, 7)
    assert starts[0] == 0
    assert starts[-1] == 70
    assert window_starts(10, 30, 5) == []
    assert window_starts(30, 30, 5) == [0]
    # Un pas nul ne doit pas boucler à l'infini.
    assert window_starts(50, 20, 0)


def test_export_builds_one_curve_per_variable() -> None:
    specs = curve_specs()
    assert len(specs) == len(PLAIN_VARIABLES) + len(BALL_VARIABLES) * 50 + len(
        STAR_VARIABLES
    ) * 12
    assert ("sum", None) in specs
    assert ("delay", 50) in specs
    assert ("star_hit", 12) in specs
    # Les cinq numéros et les deux étoiles sont des courbes à part entière, pour
    # qu'une règle puisse viser n1 sans viser n5.
    for rank in range(1, 6):
        assert (f"n{rank}", None) in specs
    assert ("e1", None) in specs
    assert ("e2", None) in specs


def test_order_statistic_curves_differ_from_one_another() -> None:
    """Cinq courbes séparées, pas cinq vues de la même : chacune son régime."""
    smallest = build_curve(DRAWS, "n1", None)
    largest = build_curve(DRAWS, "n5", None)
    assert smallest["values"] != largest["values"]
    # Invariant du rang : tirage par tirage, le plus petit ne dépasse jamais le
    # plus grand. Si cette assertion tombe, le tri a été perdu quelque part.
    assert all(a <= b for a, b in zip(smallest["values"], largest["values"]))
    assert all(1 <= v <= 50 for v in smallest["values"] + largest["values"])
    stars = build_curve(DRAWS, "e1", None)
    assert all(1 <= v <= 12 for v in stars["values"])


def test_curve_id_round_trip() -> None:
    assert curve_id("sum", None) == "sum"
    assert curve_id("delay", 7) == "delay:7"
    assert parse_curve_id("sum") == ("sum", None)
    assert parse_curve_id("delay:7") == ("delay", 7)
    # Un suffixe illisible ne doit pas lever.
    assert parse_curve_id("delay:abc") == ("delay", None)
    assert "boule 7" in curve_label("delay", 7)
    assert "étoile 3" in curve_label("star_delay", 3)


def test_build_curve_carries_dates_values_and_activity() -> None:
    curve = build_curve(DRAWS, "sum", None)
    assert curve["id"] == "sum"
    assert len(curve["dates"]) == len(curve["values"]) == len(curve["activity"])
    assert curve["draw_count"] == len(DRAWS)
    assert curve["from_date"] == curve["dates"][0]
    assert curve["to_date"] == curve["dates"][-1]
    # L'activité est le déplacement absolu, jamais négative.
    assert all(a >= 0 for a in curve["activity"])
    assert curve["activity"][0] == curve["activity"][1]


def test_export_restricted_to_a_selection() -> None:
    bundle = export_curves(DRAWS, only=["sum", "delay:7"])
    ids = {curve["id"] for curve in bundle["curves"]}
    assert ids == {"sum", "delay:7"}
    assert bundle["curve_count"] == 2
    assert bundle["draw_count"] == len(DRAWS)
    index = bundle_index(bundle)
    assert set(index) == ids


def test_manifest_drops_the_series() -> None:
    """Le bundle complet pèse plusieurs mégaoctets : le manifeste voyage seul."""
    bundle = export_curves(DRAWS, only=["sum", "spread"])
    info = manifest(bundle)
    assert info["curve_count"] == 2
    for row in info["curves"]:
        assert "values" not in row
        assert "dates" not in row
        assert set(row) == {"id", "variable", "n", "label", "draw_count"}


def test_bundle_round_trip(tmp_path) -> None:
    bundle = export_curves(DRAWS, only=["sum"])
    path = write_bundle(bundle, tmp_path / "curves.json")
    assert read_bundle(path) == bundle
    assert read_bundle(tmp_path / "absent.json") is None
    (tmp_path / "broken.json").write_text("{ pas du json", encoding="utf-8")
    assert read_bundle(tmp_path / "broken.json") is None


def test_scan_curve_rebases_indices_onto_the_curve() -> None:
    """Une figure trouvée dans une fenêtre doit se situer dans la courbe."""
    curve = build_curve(DRAWS, "sum", None)
    hits = scan_curve(curve, min_confidence=0.0)
    assert hits
    for hit in hits:
        assert 0 <= hit["from_index"] < hit["to_index"] < len(curve["values"])
        assert hit["curve_id"] == "sum"
        assert hit["variable"] == "sum"
        assert hit["scale"] in DEFAULT_SCALES
        assert hit["window_start"] + hit["scale"] <= len(curve["values"])
        assert hit["from"] == curve["dates"][hit["from_index"]]
        assert hit["to"] == curve["dates"][hit["to_index"]]
        for pivot in hit["pivots"]:
            assert pivot["date"] == curve["dates"][pivot["index"]]
        if hit["breakout"]:
            index = hit["breakout"]["index"]
            assert hit["breakout"]["date"] == curve["dates"][index]
        assert hit["outcome"]["status"] in (
            "reached",
            "invalidated",
            "open",
            "no_breakout",
        )


def test_scan_honours_a_single_scale() -> None:
    curve = build_curve(DRAWS, "sum", None)
    hits = scan_curve(curve, scales=(60,), min_confidence=0.0)
    assert {hit["scale"] for hit in hits} <= {60}


def test_scan_skips_windows_shorter_than_the_minimum() -> None:
    short = {"id": "x", "values": [1.0] * (MIN_WINDOW - 1), "dates": [], "activity": []}
    assert scan_curve(short) == []


def test_slice_curve_keeps_the_window_and_counts_its_context() -> None:
    """Le contexte précède la fenêtre : il est calculé, il n'est pas étudié."""
    curve = build_curve(DRAWS, "sum", None)
    start = curve["dates"][100]
    end = curve["dates"][119]
    cut = slice_curve(curve, start=start, end=end, context=30)
    assert cut["draw_count"] == 20
    assert cut["context_count"] == 30
    assert cut["from_date"] == start
    assert cut["to_date"] == end
    # La série transporte le contexte, les bornes ne parlent que de la fenêtre.
    assert len(cut["values"]) == len(cut["dates"]) == len(cut["activity"]) == 50
    assert cut["dates"][30] == start
    assert cut["dates"][-1] == end
    # Les valeurs sont découpées, pas recalculées : un retard reste un retard.
    assert cut["values"] == curve["values"][70:120]


def test_slice_curve_takes_what_context_exists_at_the_start_of_the_archive() -> None:
    curve = build_curve(DRAWS, "sum", None)
    cut = slice_curve(curve, start=curve["dates"][5], context=40)
    assert cut["context_count"] == 5
    assert cut["draw_count"] == len(DRAWS) - 5


def test_slice_curve_on_an_empty_window() -> None:
    curve = build_curve(DRAWS, "sum", None)
    cut = slice_curve(curve, start="2099-01-01")
    assert cut["draw_count"] == 0
    assert cut["values"] == []
    assert cut["from_date"] is None


def test_live_in_window_keeps_figures_that_end_inside_it() -> None:
    """Une figure entièrement en amont appartient au passé calculé, pas à la fenêtre."""
    assert live_in_window({"to_index": 5}, 0) is True
    assert live_in_window({"to_index": 29}, 30) is False
    assert live_in_window({"to_index": 30}, 30) is True
    # Une cassure dans la fenêtre suffit, même si la forme se noue en amont.
    assert live_in_window({"to_index": 25, "breakout": {"index": 32}}, 30) is True
    assert live_in_window({"to_index": 25, "breakout": None}, 30) is False


def test_slicing_then_scanning_only_reports_figures_of_the_window() -> None:
    """Le rétro-test borné ne doit pas compter les figures du contexte."""
    curve = build_curve(DRAWS, "sum", None)
    cut = slice_curve(curve, start=curve["dates"][60], context=59)
    hits = scan_curve(cut, scales=(30,), min_confidence=0.0)
    inside = [h for h in hits if live_in_window(h, cut["context_count"])]
    assert hits
    assert len(inside) < len(hits)
    for hit in inside:
        end = max(hit["to_index"], (hit["breakout"] or {}).get("index") or 0)
        assert end >= cut["context_count"]


def test_collapse_zones_keeps_one_reading_and_files_the_rest() -> None:
    curve = build_curve(DRAWS, "sum", None)
    hits = scan_curve(curve, min_confidence=0.0)
    zones = collapse_zones(hits)
    assert len(zones) <= len(hits)
    alternatives = sum(len(zone["alternatives"]) for zone in zones)
    assert len(zones) + alternatives == len(hits)
    for zone in zones:
        for other in zones:
            if zone is other:
                continue
            lo = max(zone["from_index"], other["from_index"])
            hi = min(zone["to_index"], other["to_index"])
            shortest = min(
                zone["to_index"] - zone["from_index"],
                other["to_index"] - other["from_index"],
            )
            if hi > lo and shortest > 0:
                assert (hi - lo) / shortest <= 0.2


def test_windows_of_covers_the_bundle_and_respects_the_limit() -> None:
    bundle = export_curves(DRAWS, only=["sum", "spread"])
    windows = windows_of(bundle, size=40, stride=20)
    assert windows
    assert {w["curve_id"] for w in windows} == {"sum", "spread"}
    for window in windows:
        assert len(window["values"]) == 40
        assert window["to_index"] - window["from_index"] == 39
    assert len(windows_of(bundle, size=40, stride=1, limit=5)) == 5
    assert windows_of(bundle, size=40, stride=20, curve="sum")
    assert windows_of(bundle, size=40, stride=20, curve="absente") == []
    # Une fenêtre plus longue que la courbe ne produit rien.
    assert windows_of(bundle, size=10_000) == []


def test_scan_bundle_summarizes() -> None:
    bundle = export_curves(DRAWS, only=["sum", "spread"])
    report = scan_bundle(bundle, min_confidence=0.0, limit_per_curve=5)
    assert report["curve_count"] == 2
    assert len(report["figures"]) <= 10
    assert report["summary"]["count"] == len(report["figures"])


def test_outcome_stats_computes_a_hit_rate() -> None:
    curve = build_curve(DRAWS, "sum", None)
    hits = scan_curve(curve, min_confidence=0.0)
    stats = outcome_stats(hits)
    for row in stats.values():
        assert row["settled"] == row["reached"] + row["invalidated"]
        if row["settled"]:
            assert row["hit_rate"] == round(row["reached"] / row["settled"], 4)
        else:
            assert row["hit_rate"] is None


def test_sample_by_figure_balances_the_classes() -> None:
    """Sans rééquilibrage, l'entraînement ne verrait que la figure dominante."""
    curve = build_curve(DRAWS, "sum", None)
    hits = scan_curve(curve, min_confidence=0.0)
    sampled = sample_by_figure(hits, per_figure=2)
    counts: dict[str, int] = {}
    for hit in sampled:
        counts[hit["figure"]] = counts.get(hit["figure"], 0) + 1
    assert counts
    assert max(counts.values()) <= 2


def test_windows_for_training_ends_on_the_breakout() -> None:
    """La fenêtre d'entraînement doit contenir la cassure, sinon rien à apprendre."""
    curve = build_curve(DRAWS, "sum", None)
    hits = scan_curve(curve, min_confidence=0.0)
    rows = windows_for_training(curve, hits, size=48)
    assert rows
    for row in rows:
        assert len(row["values"]) == len(row["activity"])
        assert row["to_index"] - row["from_index"] + 1 == len(row["values"])
        assert row["curve_id"] == "sum"
        assert row["figure"]


def test_graph_nodes_and_edges_are_coherent() -> None:
    sample = make_dataset(per_class=1, figures=["ete"], seed=0)[0]
    values = list(sample["values"])
    pivots = swing_pivots(values, None)
    graph = build_graph(values, activity=sample["activity"], pivots=pivots, k=12, cubic=True)
    nodes = graph["nodes"]
    edges = graph["edge_index"]
    assert nodes
    assert len(edges) == 2
    assert len(edges[0]) == len(edges[1]) == len(graph["edge_attr"])
    # Toute arête pointe vers un nœud existant, et les features sont finies.
    for src, dst in zip(edges[0], edges[1]):
        assert 0 <= src < len(nodes)
        assert 0 <= dst < len(nodes)
    for row in nodes:
        assert all(math.isfinite(v) for v in row)
    for row in graph["edge_attr"]:
        assert all(math.isfinite(v) for v in row)
    assert graph_summary(graph)["node_count"] == len(nodes)


def test_graph_is_resolution_free() -> None:
    """Mise à l'échelle de la courbe : le graphe ne doit pas bouger.

    C'est l'argument du module contre une grille de pixels — la topologie est
    une propriété de la forme, pas de l'unité de la variable.
    """
    sample = make_dataset(per_class=1, figures=["triple_top"], seed=3)[0]
    values = list(sample["values"])
    scaled = [v * 41.0 + 900.0 for v in values]
    left = build_graph(values, pivots=swing_pivots(values, None), k=12)
    right = build_graph(scaled, pivots=swing_pivots(scaled, None), k=12)
    assert left["edge_index"] == right["edge_index"]
    for a, b in zip(left["nodes"], right["nodes"]):
        for x, y in zip(a, b):
            assert abs(x - y) < 1e-9
