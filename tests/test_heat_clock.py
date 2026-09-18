from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

GRIDS = [
    "src/components/evolution-heat.tsx",
    "src/components/combinaisons/combinaisons-panel.tsx",
    "src/components/analysis/numbers-panel.tsx",
]


def test_heat_grids_use_clock_not_tint() -> None:
    lib = (ROOT / "src/lib/heat-clock.ts").read_text(encoding="utf-8")
    assert "export function clockRatio" in lib
    assert "export function clockScale" in lib
    assert "export function clockOverheat" in lib
    assert "export function heatClockFace" in lib

    component = (ROOT / "src/components/heat-clock.tsx").read_text(encoding="utf-8")
    assert "HeatClockLegend" in component
    assert "heatClockFace" in component
    assert "surchauffe" in component

    css = (ROOT / "src/app/globals.css").read_text(encoding="utf-8")
    assert "--heat-clock-pie" in css
    assert "--heat-clock-well" in css
    assert "--heat-clock-hot" in css

    for rel in GRIDS:
        text = (ROOT / rel).read_text(encoding="utf-8")
        assert "HeatClock" in text, rel
        assert "function heatStyle" not in text, rel
        assert "14 + t * 62" not in text, rel
