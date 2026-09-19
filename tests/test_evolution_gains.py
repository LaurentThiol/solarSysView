"""Bloc Évolution · gains dans le temps (FR / EU / hors FR + somme des numéros)."""

from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def test_gains_series_node() -> None:
    script = ROOT / "tests" / "test_evolution_gains.ts"
    result = subprocess.run(
        [
            "node",
            "--experimental-strip-types",
            "--test",
            str(script),
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stdout + result.stderr


def test_evolution_gains_block_is_wired() -> None:
    panel = (ROOT / "src/components/evolution-panel.tsx").read_text(encoding="utf-8")
    gains = (ROOT / "src/components/evolution-gains.tsx").read_text(encoding="utf-8")
    lib = (ROOT / "src/lib/draws.ts").read_text(encoding="utf-8")
    readme = (ROOT / "README.md").read_text(encoding="utf-8")

    assert 'from "@/components/evolution-gains"' in panel
    assert "draws={filtered}" in panel
    assert "history={archive}" in panel
    assert 'host="gains"' in panel
    assert "Évolution dans le temps · gains" in gains
    assert "Somme n°" in gains
    assert "Hors FR" in gains
    assert "On n’additionne pas FR et EU" in gains
    assert "Cette archive n’a que le rang 1" in gains
    assert "Longueur report" in gains
    assert "Empilée" in gains
    assert "échelle log" in gains.lower() or "Échelle log" in gains
    assert 'aria-label="Jour des tirages"' in gains
    assert "winnersOutsideFrance" in lib
    assert "toGainsChart" in lib
    assert "numbersSum" in lib
    gains_lib = (ROOT / "src/lib/gains.ts").read_text(encoding="utf-8")
    assert "winnersEu - winnersFr" in gains_lib
    assert "reportLengthsFromSteps" in gains_lib
    assert "échelle log" in readme
    assert "mardi / vendredi" in readme
    assert "longueur de report" in readme
    assert "masse empilée" in readme
    assert "on n’additionne pas FR + EU" in readme
    assert "somme des 5 numéros" in readme
