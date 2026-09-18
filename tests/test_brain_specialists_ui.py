from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_specialists_panel_is_a_roster_with_atelier() -> None:
    view = (ROOT / "src/lib/brain/specialist-view.ts").read_text(encoding="utf-8")
    card = (ROOT / "src/components/brain/specialist-card.tsx").read_text(encoding="utf-8")
    panel = (ROOT / "src/components/brain/brain-specialists.tsx").read_text(encoding="utf-8")
    assert "export function skillBar" in view
    assert "verdictTone" in view
    assert "targetGlyph" in view
    assert "SpecialistCard" in panel
    assert "Nouvel atelier" in panel
    assert "data-specialist-roster" in panel
    assert "data-specialist-atelier" in panel
    assert "Score vs hasard" in card
    assert "s’abstient" in card
    assert "Épingler" in card
    assert "Réinférer" in card
