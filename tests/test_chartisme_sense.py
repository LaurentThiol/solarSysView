"""Sens d'une fenêtre : monte / baisse / stable, registres 05, 1, sup."""

import math
from pathlib import Path
import subprocess

from synchro.chartisme.scan import MIN_WINDOW
from synchro.chartisme.sense import (
    MIN_SENSE_LENGTH,
    name_sense,
    register_of,
    sense_sentence,
    sense_shift_sentence,
    series_sigma,
)

ROOT = Path(__file__).resolve().parents[1]


def _bump() -> list[float]:
    values = [0.0] * MIN_SENSE_LENGTH
    values[8] = 4.0
    return values


def test_length_matches_the_shortest_readable_window() -> None:
    assert MIN_SENSE_LENGTH == MIN_WINDOW


def test_clean_rise_and_fall_are_tight() -> None:
    rise = name_sense([float(i) for i in range(20)], 8)
    assert rise is not None
    assert rise["symbol"] == "monte:05"
    assert rise["sigma"] == 0
    fall = name_sense([float(i) for i in range(19, -1, -1)], 8)
    assert fall is not None
    assert fall["symbol"] == "baisse:05"


def test_a_flat_line_stays_stable_and_tight() -> None:
    named = name_sense([4.0] * 20, 3)
    assert named is not None
    assert named["symbol"] == "stable:05"
    assert named["delta"] == 0


def test_registers_are_exclusive_bands_of_the_habit() -> None:
    values = _bump()
    sigma = series_sigma(values)
    assert sigma > 0
    assert name_sense(values, sigma / 0.25)["register"] == "05"
    assert name_sense(values, sigma / 0.75)["register"] == "1"
    assert name_sense(values, sigma / 2)["register"] == "sup"
    assert name_sense(values, sigma / 0.25)["sense"] == "stable"


def test_register_edges_include_the_bound() -> None:
    assert register_of(0.5) == "05"
    assert register_of(0.5 + 1e-9) == "1"
    assert register_of(1) == "1"
    assert register_of(1.01) == "sup"
    assert register_of(math.inf) == "sup"


def test_a_move_inside_the_cloud_is_stable() -> None:
    values = [0.0] * MIN_SENSE_LENGTH
    values[-1] = 1.0
    values[8] = 30.0
    named = name_sense(values, 1)
    assert named is not None
    assert named["sense"] == "stable"
    assert named["register"] == "sup"
    assert abs(named["delta"]) <= named["sigma"]


def test_short_or_unscaled_windows_abstain() -> None:
    assert name_sense([1.0] * (MIN_SENSE_LENGTH - 1), 1) is None
    assert name_sense([float(i) for i in range(20)], None) is None
    assert name_sense([float(i) for i in range(20)], -1) is None
    assert name_sense([float(i) for i in range(20)], math.nan) is None


def test_a_flat_history_names_a_noisy_window_as_wild() -> None:
    still = name_sense([2.0] * 16, 0)
    assert still is not None
    assert still["symbol"] == "stable:05"
    assert still["ratio"] == 0
    # Une droite parfaite a un nuage vide : le registre reste serré.
    clean = name_sense([float(i) for i in range(16)], 0)
    assert clean is not None
    assert clean["symbol"] == "monte:05"
    noisy = [float(i) for i in range(16)]
    noisy[8] += 5
    named = name_sense(noisy, 0)
    assert named is not None
    assert named["symbol"] == "monte:sup"
    assert named["ratio"] is None


def test_sentence_leads_with_the_symbol() -> None:
    named = name_sense([float(i) for i in range(20)], 8)
    assert sense_sentence(named) == (
        "monte:05 — la fenêtre monte, et le nuage autour de la droite "
        "tient dans la moitié de l'écart-type habituel."
    )
    assert sense_sentence(None) == "Fenêtre trop courte pour nommer le sens."


def test_shift_sentence_compares_two_windows() -> None:
    rise = name_sense([float(i) for i in range(20)], 8)
    fall = name_sense([float(i) for i in range(19, -1, -1)], 8)
    assert rise is not None and fall is not None
    assert sense_shift_sentence(rise, fall, True) == "Le sens change : baisse:05, puis monte:05."
    assert sense_shift_sentence(rise, rise, True) == "Le sens tient : les deux fenêtres sont monte:05."
    assert sense_shift_sentence(rise, fall, False) == "Pas de fenêtre antérieure de même longueur."
    assert (
        sense_shift_sentence(None, None, True)
        == "Les deux fenêtres sont trop courtes pour comparer le sens."
    )
    assert (
        sense_shift_sentence(rise, None, True)
        == "L'une des deux fenêtres est trop courte pour comparer le sens."
    )
    looser = dict(rise)
    looser["register"] = "1"
    looser["symbol"] = "monte:1"
    assert sense_shift_sentence(looser, rise, True) == (
        "Le sens tient (monte), le registre passe de 05 à 1."
    )
    assert sense_shift_sentence({"sense": "nope"}, rise, True) == (
        "L'une des deux fenêtres est trop courte pour comparer le sens."
    )


def test_sense_twin_node() -> None:
    result = subprocess.run(
        [
            "node",
            "--experimental-strip-types",
            "--import",
            str(ROOT / "tests" / "node-register.mjs"),
            "--test",
            str(ROOT / "tests" / "test_chartisme_sense.ts"),
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stdout + result.stderr
