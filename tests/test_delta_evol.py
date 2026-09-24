"""Bloc DeltaEvol : écart n − n−1 après la courbe d’évolution."""

from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def test_delta_series_node() -> None:
    script = ROOT / "tests" / "test_delta_evol.ts"
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


def test_delta_evol_block_follows_the_time_chart() -> None:
    panel = (ROOT / "src/components/evolution-panel.tsx").read_text(encoding="utf-8")
    block = (ROOT / "src/components/evolution-delta.tsx").read_text(encoding="utf-8")
    readme = (ROOT / "README.md").read_text(encoding="utf-8")

    assert 'from "@/components/evolution-delta"' in panel
    assert "<EvolutionDelta draws={filtered} />" in panel
    body = panel.split("function EvolutionContent", 1)[1]
    assert body.index("</PillTabPanel>") < body.index("<EvolutionDelta")
    assert body.index("<EvolutionDelta") < body.index("<EvolutionGains")
    assert "DeltaEvol" in block
    assert "Δ n1" in block
    assert "Δ somme n" in block
    assert "Δ somme E" in block
    assert "Bollinger" in block
    assert "glissement" in block
    assert "Histogramme des pas" in block
    assert "mélange" in block
    assert "DeltaEvol" in readme
    assert "écarts n − n−1" in panel
