from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHART = (ROOT / "src/components/draw-chart.tsx").read_text(encoding="utf-8")
HELP = (ROOT / "src/components/chart-draw/sketch-toolbar.tsx").read_text(
    encoding="utf-8"
)
MOVE = (ROOT / "src/lib/chart-draw/move.ts").read_text(encoding="utf-8")
MAGNET = (ROOT / "src/lib/chart-draw/magnet.ts").read_text(encoding="utf-8")


def test_free_drawing_can_pick_up_an_existing_handle() -> None:
    assert "moveSketchHandle" in CHART
    assert "nearestSketchHandle" in CHART
    assert "beginMove" in CHART
    assert "commitMove" in CHART
    assert "reprendre" in HELP
    assert "function moveSketchHandle" in MOVE
    assert "function nearestSketchHandle" in MAGNET
    assert "canFreeMoveHandle" in MAGNET
    assert "Clique ou glisse ce point" in CHART
