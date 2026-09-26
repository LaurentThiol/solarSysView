from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_coord_hud_is_docked_above_the_chart() -> None:
    hud = (ROOT / "src/components/chart-draw/coord-hud.tsx").read_text(encoding="utf-8")
    chart = (ROOT / "src/components/draw-chart.tsx").read_text(encoding="utf-8")
    toolbar = (ROOT / "src/components/chart-draw/sketch-toolbar.tsx").read_text(
        encoding="utf-8"
    )
    readme = (ROOT / "README.md").read_text(encoding="utf-8")

    assert "const [detached, setDetached] = useState(false)" in hud
    assert "data-coord-hud={detached ? \"float\" : \"docked\"}" in hud
    assert "live.clientX" not in hud
    assert "live.clientY" not in hud
    assert "clampHudPosition" in hud
    assert "Carte détachée" in hud
    assert "data-coord-hud-slot" in hud
    assert chart.index("<CoordHud") < chart.index("<ChartContainer")
    assert "bandeau Coordonnées" in toolbar
    assert "fenêtre flottante" not in toolbar
    assert "bandeau de coordonnées au-dessus du graphique" in readme
    assert "hors courbe" in hud
    assert "Hors courbe" in toolbar
    assert "arrivée démagnétisable au Alt" in readme
