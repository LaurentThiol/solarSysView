"""Onglet Annuel : trois années en barres, somme des numéros, trait de fin de mois."""

from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def test_annual_sum_node() -> None:
    script = ROOT / "tests" / "test_annual_sum.ts"
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


def test_annual_tab_is_wired() -> None:
    panel = (ROOT / "src/components/evolution-panel.tsx").read_text(encoding="utf-8")
    view = (ROOT / "src/components/evolution-annual.tsx").read_text(encoding="utf-8")
    page = (ROOT / "src/app/evolution/page.tsx").read_text(encoding="utf-8")
    glossary = (ROOT / "src/lib/copy.ts").read_text(encoding="utf-8")
    pack = (ROOT / "src/lib/capture/pack.ts").read_text(encoding="utf-8")

    assert 'id: "annuel"' in panel
    assert "EvolutionAnnual" in panel
    assert "data-annual-pants" in view
    assert "data-month-end" in view
    assert 'data-annual-synthese="continu"' in view
    assert "trait continu" in view
    assert "aria-pressed" in view
    assert "mardi + vendredi" in view
    assert "ne tire pas le mercredi" in glossary
    assert "Annuel" in page
    assert 'term: "Annuel"' in glossary
    assert "Annuel · somme des 5 numéros" in pack or "reading" in pack
