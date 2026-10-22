"""Lien pointillé : reprise d’un numéro ou d’une étoile au tirage suivant."""

from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def test_repeat_link_node() -> None:
    script = ROOT / "tests" / "test_repeat_link.ts"
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


def test_each_number_offers_the_link_option() -> None:
    chart = (ROOT / "src/components/draw-chart.tsx").read_text(encoding="utf-8")
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    assert "Lien (éteint par défaut)" in chart
    assert "data-repeat-link-toggle" in chart
    assert "data-repeat-links" in chart
    assert "**Lien** (éteint)" in readme
    assert "Chaque numéro et Chaque étoile" in readme
