"""Contrats des tableaux chaud / retard de l’onglet Évolution."""

from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def test_frequency_rank_node() -> None:
    script = ROOT / "tests" / "test_frequency_rank.ts"
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


def test_evolution_tables_use_lookback_and_thresholds() -> None:
    draws = (ROOT / "src/lib/draws.ts").read_text(encoding="utf-8")
    assert "history?: Draw[]" in draws
    assert "lookback" in draws
    assert "from \"@/lib/frequency-rank\"" in draws

    panel = (ROOT / "src/components/evolution-panel.tsx").read_text(encoding="utf-8")
    assert "numberFrequencyTable(filtered, archive)" in panel
    assert "starFrequencyTable(filtered, 12, archive)" in panel
    assert "hottest(numberBoard, 10, { minCount: expectedN })" in panel
    assert "overdue(numberBoard, 10, { minDelay: expectedNDelay })" in panel
    assert "hottest(starBoard, 6, { minCount: expectedS })" in panel
    assert "overdue(starBoard, 6, { minDelay: expectedSDelay })" in panel

    card = (ROOT / "src/components/frequency-card.tsx").read_text(encoding="utf-8")
    assert "<table" in card
    assert "rangé par ordre décroissant" in card
    assert ">Retard<" in card
    assert ">Sorties<" in card
