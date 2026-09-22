"""Moteur Pronostic (Node) + bornes de rang côté Jeux Python."""

from itertools import combinations
from pathlib import Path
import subprocess

from synchro.analysis.jeux import evaluate_pool, TOTAL_NUMBER_WAYS

ROOT = Path(__file__).resolve().parents[1]


def _run_node() -> None:
    result = subprocess.run(
        ["node", "--experimental-strip-types", "--test", str(ROOT / "tests" / "test_pronostic.ts")],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stdout + result.stderr


def test_pronostic_node() -> None:
    _run_node()


def _spec(kind: str, **kwargs):
    meta_pool = 50 if kind == "numbers" else 12
    spec = {
        "kind": kind,
        "chance": {i: 100 for i in range(1, meta_pool + 1)},
        "threshold": 1,
        "forced": [],
        "min_sum": 15 if kind == "numbers" else 3,
        "max_sum": 240 if kind == "numbers" else 23,
        "min_even": 0,
        "max_even": 5 if kind == "numbers" else 2,
        "min_spread": 4 if kind == "numbers" else 1,
        "max_spread": 49 if kind == "numbers" else 11,
        "min_consecutive": 0,
        "max_consecutive": 4 if kind == "numbers" else 1,
        "decade_min": [0, 0, 0, 0, 0],
        "decade_max": [5, 5, 5, 5, 5],
    }
    spec.update(kwargs)
    return spec


def test_slot_bands_unrestricted_is_universe():
    result = evaluate_pool(
        _spec(
            "numbers",
            slot_bands=[
                {"lo": 1, "hi": 46},
                {"lo": 2, "hi": 47},
                {"lo": 3, "hi": 48},
                {"lo": 4, "hi": 49},
                {"lo": 5, "hi": 50},
            ],
        )
    )
    assert result["count"] == TOTAL_NUMBER_WAYS


def test_slot_bands_match_brute_stars():
    bands = [{"lo": 1, "hi": 6}, {"lo": 5, "hi": 12}]
    spec = _spec("stars", slot_bands=bands, min_sum=3, max_sum=23)
    got = evaluate_pool(spec)["count"]
    expected = 0
    for a, b in combinations(range(1, 13), 2):
        if bands[0]["lo"] <= a <= bands[0]["hi"] and bands[1]["lo"] <= b <= bands[1]["hi"]:
            expected += 1
    assert got == expected


def test_slot_bands_plus_sum_zero_when_contradictory():
    spec = _spec(
        "numbers",
        min_sum=15,
        max_sum=20,
        slot_bands=[
            {"lo": 1, "hi": 10},
            {"lo": 2, "hi": 20},
            {"lo": 3, "hi": 30},
            {"lo": 4, "hi": 40},
            {"lo": 40, "hi": 50},
        ],
    )
    assert evaluate_pool(spec)["count"] == 0


def test_forced_plus_slots_uses_visit_path():
    spec = _spec(
        "stars",
        forced=[1],
        slot_bands=[{"lo": 1, "hi": 4}, {"lo": 2, "hi": 8}],
        min_sum=3,
        max_sum=23,
    )
    got = evaluate_pool(spec)["count"]
    expected = 0
    for b in range(2, 13):
        combo = [1, b]
        if combo[0] >= 1 and combo[0] <= 4 and combo[1] >= 2 and combo[1] <= 8:
            expected += 1
    assert got == expected
