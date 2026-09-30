"""Le tableau triable remplace les horloges de fréquence."""

from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]

SCREENS = [
    "src/components/evolution-heat.tsx",
    "src/components/combinaisons/combinaisons-panel.tsx",
    "src/components/analysis/numbers-panel.tsx",
]


def test_frequency_board_node() -> None:
    script = ROOT / "tests" / "test_frequency_board.ts"
    result = subprocess.run(
        ["node", "--experimental-strip-types", "--test", str(script)],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stdout + result.stderr


def test_clocks_are_gone_and_tables_sort() -> None:
    lib = (ROOT / "src/lib/frequency-board.ts").read_text(encoding="utf-8")
    assert "export function meterReading" in lib
    assert "export function sortFrequencyRows" in lib
    assert "trait est à 50 %" in lib

    meter = (ROOT / "src/components/expected-meter.tsx").read_text(encoding="utf-8")
    assert "w-0.5" in meter
    assert "formatMeterRatio" in meter

    table = (ROOT / "src/components/frequency-table.tsx").read_text(encoding="utf-8")
    assert "Numéro" in table
    assert "Retard" in table
    assert "Sorties" in table
    assert "Attendu" in table
    assert "aria-sort" in table
    assert "ExpectedMeter" in table

    css = (ROOT / "src/app/globals.css").read_text(encoding="utf-8")
    assert "heat-clock" not in css
    assert not (ROOT / "src/components/heat-clock.tsx").exists()
    assert not (ROOT / "src/lib/heat-clock.ts").exists()

    for rel in SCREENS:
        text = (ROOT / rel).read_text(encoding="utf-8")
        assert "FrequencyTable" in text, rel
        assert "HeatClock" not in text, rel
        assert "heat-clock" not in text, rel

    cards = (ROOT / "src/components/frequency-card.tsx").read_text(encoding="utf-8")
    assert "ExpectedMeter" in cards
    panel = (ROOT / "src/components/evolution-panel.tsx").read_text(encoding="utf-8")
    assert 'meterOf="delay"' in panel
