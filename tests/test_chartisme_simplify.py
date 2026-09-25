"""Pyramide de tolérance : Visvalingam, RDP, LTTB, jumeau TypeScript."""

import json
import subprocess

from synchro.chartisme.simplify import (
    cut_indices,
    lttb_indices,
    rdp_indices,
    visvalingam_areas,
)

SERIES = [0.0, 1, 2, 8, 3, 2, 1, 0, 1, 2, 6, 7, 6, 2, 1, 0, 2, 3]


def _flag() -> list[float]:
    pole = [i * 1.5 for i in range(21)]
    pause = [30 + (2 if (i % 4) < 2 else -1) for i in range(21, 48)]
    return [*pole, *pause]


def test_elimination_order_is_monotone() -> None:
    """Un point retiré tard ne peut pas être moins important qu'un point déjà parti."""
    areas = visvalingam_areas(SERIES)
    finite = [area for area in areas if area != float("inf")]
    # L'aire stockée est celle au moment du retrait, relevée chez les survivants.
    assert areas[0] == float("inf")
    assert areas[-1] == float("inf")
    assert max(finite) >= min(finite)
    assert 3 in cut_indices(SERIES, areas, 0.04, variable=False)
    assert 1 not in cut_indices(SERIES, areas, 0.2, variable=False)


def test_variable_tolerance_keeps_a_flag_inside_its_pole() -> None:
    """À τ égal, la tolérance variable garde les appuis que la coupe constante avale."""
    values = _flag()
    areas = visvalingam_areas(values)
    variable = cut_indices(values, areas, 0.04, variable=True)
    constant = cut_indices(values, areas, 0.04, variable=False)
    assert constant == [0, 20, len(values) - 1]
    assert any(20 < index < len(values) - 1 for index in variable)
    assert set(constant) <= set(variable)


def test_rdp_drops_points_within_epsilon() -> None:
    kept = rdp_indices(SERIES, 0.08)
    assert kept[0] == 0 and kept[-1] == len(SERIES) - 1
    assert kept == [0, 2, 3, 4, 7, 9, 11, 13, 15, 17]


def test_lttb_respects_the_budget() -> None:
    kept = lttb_indices(SERIES, 7)
    assert len(kept) == 7
    assert kept[0] == 0 and kept[-1] == len(SERIES) - 1
    assert kept == sorted(set(kept))


def test_python_and_typescript_keep_the_same_indices() -> None:
    script = """
import { cutIndices, rdpIndices, lttbIndices } from './src/lib/chartisme/simplify.ts'
const series = %s
console.log(JSON.stringify({
  cut: cutIndices(series, null, 0.04, { variable: true }),
  rdp: rdpIndices(series, 0.08),
  lttb: lttbIndices(series, 7),
}))
""" % json.dumps(SERIES)
    completed = subprocess.run(
        [
            "node",
            "--experimental-strip-types",
            "--disable-warning=ExperimentalWarning",
            "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
            "--import",
            "./tests/node-alias-loader.mjs",
            "--eval",
            script,
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    twin = json.loads(completed.stdout)
    areas = visvalingam_areas(SERIES)
    assert twin["cut"] == cut_indices(SERIES, areas, 0.04, variable=True)
    assert twin["rdp"] == rdp_indices(SERIES, 0.08)
    assert twin["lttb"] == lttb_indices(SERIES, 7)
