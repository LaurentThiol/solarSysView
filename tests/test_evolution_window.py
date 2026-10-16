"""La fenêtre de travail d’Évolution reste sous le bandeau."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_evolution_window_pins_under_the_banner() -> None:
    panel = (ROOT / "src/components/evolution-panel.tsx").read_text(encoding="utf-8")
    header = (ROOT / "src/components/startup-status.tsx").read_text(encoding="utf-8")
    slot = (ROOT / "src/components/site-header-slot.tsx").read_text(encoding="utf-8")
    pills = (ROOT / "src/components/ui/pill-tabs.tsx").read_text(encoding="utf-8")
    readme = (ROOT / "README.md").read_text(encoding="utf-8")

    assert "SiteHeaderSlot" in panel
    assert "data-evolution-window" in panel
    assert 'aria-label="Fenêtre de travail"' in panel
    assert "EvolutionWindowBar" in panel
    assert "sous le bandeau" in panel
    assert 'label: "20 derniers"' in panel
    assert "full: WINDOW_PRESET_LABELS.last_20" in panel
    periods = panel.split("const PERIODS", 1)[1].split("function SketchBridge", 1)[0]
    ids = [
        line.split('id: "', 1)[1].split('"', 1)[0]
        for line in periods.splitlines()
        if 'id: "' in line
    ]
    assert ids[ids.index("last_50") + 1] == "last_100"
    between = periods.split('id: "last_50"', 1)[1].split('id: "year"', 1)[0]
    assert 'label: "100 derniers"' in between
    assert "WINDOW_PRESET_LABELS.last_100" in between
    assert "SITE_HEADER_SLOT_ID" in header
    assert "--site-header-height" in header
    assert 'SITE_HEADER_SLOT_ID = "site-header-slot"' in slot
    assert "createPortal" in slot
    assert "compact?: boolean" in pills
    assert "wrap?: boolean" in pills
    bar = panel.split("function EvolutionWindowBar", 1)[1].split("function formatStat", 1)[0]
    assert "flex-wrap" in bar
    assert "sm:flex-row" not in bar
    assert "min-[100rem]:flex-row" in bar
    assert " wrap" in bar
    assert "sous le bandeau" in readme
    assert "EvolutionDraws" not in panel
    assert "Tirages de la fenêtre" not in panel
    assert not (ROOT / "src/components/evolution-draws.tsx").exists()
