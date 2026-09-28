"""Forme · décennies : courbe du nombre de bandes touchées par tirage."""

from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def test_decade_occupied_node() -> None:
    script = ROOT / "tests" / "test_decade_occupied.ts"
    result = subprocess.run(
        [
            "node",
            "--experimental-strip-types",
            "--import",
            str(ROOT / "tests" / "node-register.mjs"),
            "--test",
            str(script),
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stdout + result.stderr


def test_decades_view_plots_observed_count() -> None:
    shape = (ROOT / "src/components/evolution-shape.tsx").read_text(encoding="utf-8")
    draws = (ROOT / "src/lib/draws.ts").read_text(encoding="utf-8")
    assert 'decades: ["d0", "d1", "d2", "d3", "d4", "decadeOccupied"]' in shape
    assert 'decadeOccupied: { label: "Observées"' in shape
    assert "de 1 à 5" in shape
    assert "Forme · décennies, étendue, consécutifs" in shape
    assert "decadeOccupied: decadeOccupied(decades)" in draws
