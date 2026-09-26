from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHART = (ROOT / "src/components/draw-chart.tsx").read_text(encoding="utf-8")
HELP = (ROOT / "src/components/chart-draw/sketch-toolbar.tsx").read_text(
    encoding="utf-8"
)
MOVE = (ROOT / "src/lib/chart-draw/move.ts").read_text(encoding="utf-8")
MAGNET = (ROOT / "src/lib/chart-draw/magnet.ts").read_text(encoding="utf-8")


def test_free_segment_offers_a_parallel_line() -> None:
    hook = (ROOT / "src/components/chart-draw/use-sketch-chart.ts").read_text(encoding="utf-8")
    place = (ROOT / "src/lib/chart-draw/place.ts").read_text(encoding="utf-8")
    assert "parallelOf" in CHART
    assert "parallelOf" in hook
    assert "fitFreeParallel" in place
    assert "droite parallèle" in HELP
    assert "Échap garde le segment seul" in HELP


def test_option_click_keeps_the_magnet_release() -> None:
    hook = (ROOT / "src/components/chart-draw/use-magnet-hold.ts").read_text(encoding="utf-8")
    sketch = (ROOT / "src/components/chart-draw/use-sketch-chart.ts").read_text(encoding="utf-8")
    assert "useMagnetHold" in CHART
    assert "useMagnetHold" in sketch
    assert "notePointerDown" in CHART
    assert "notePointerDown" in sketch
    assert "Hors courbe" in HELP
    # preventDefault au keydown Option retire altKey des clics macOS.
    assert "shouldPreventAltKeyDown" in hook
    assert "retire altKey des clics" in hook
    assert "shouldReleaseAltHold" in hook


def test_median_and_off_curve_buttons_have_their_own_help() -> None:
    assert "const MEDIAN_HELP" in HELP
    assert "const OFF_CURVE_HELP" in HELP
    assert "<HelpTip {...MEDIAN_HELP} />" in HELP
    assert "<HelpTip {...OFF_CURVE_HELP} />" in HELP
    assert "(borne haute + borne basse) / 2" in HELP
    assert "fourchette d’Andrews" in HELP
    assert "Option+clic est souvent avalé" in HELP
    assert "Seule l’arrivée est libre" in HELP


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
