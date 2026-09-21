"""Le choix du jour d’Harmo reste sous le bandeau, comme Évolution."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_harmo_day_choice_pins_under_the_banner() -> None:
    lab = (ROOT / "src/components/harmo/harmo-lab.tsx").read_text(encoding="utf-8")
    bar = (ROOT / "src/components/analysis/window-bar.tsx").read_text(encoding="utf-8")
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    nav = (ROOT / "src/lib/nav.ts").read_text(encoding="utf-8")

    assert "SiteHeaderSlot" in lab
    assert "HarmoDayBar" in lab
    assert "data-harmo-window" in lab
    assert 'aria-label="Jour des tirages"' in lab
    assert "WeekdayScopeControl" in lab
    assert "sous le bandeau" in lab
    assert "showWeekday={false}" in lab
    assert "showWeekday = true" in bar
    assert "WeekdayScopeControl" in bar
    harmo = readme.split("## Harmo", 1)[1].split("\n## ", 1)[0]
    assert "sous le bandeau" in harmo
    assert "Mardi ou Vendredi" in harmo
    assert "comme Évolution" in nav
