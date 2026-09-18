from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def test_specialists_panel_is_a_roster_with_atelier() -> None:
    view = (ROOT / "src/lib/brain/specialist-view.ts").read_text(encoding="utf-8")
    card = (ROOT / "src/components/brain/specialist-card.tsx").read_text(encoding="utf-8")
    panel = (ROOT / "src/components/brain/brain-specialists.tsx").read_text(encoding="utf-8")
    assert "export function skillBar" in view
    assert "verdictTone" in view
    assert "targetGlyph" in view
    assert "specialistFeaturesHelp" in view
    assert "specialistFeatureHelp" in view
    assert "SpecialistCard" in panel
    assert "Nouvel atelier" in panel
    assert "data-specialist-roster" in panel
    assert "data-specialist-atelier" in panel
    assert "specialistFeaturesHelp(features)" in panel
    assert "specialistFeatureHelp(feature)" in panel
    assert "Score vs hasard" in card
    assert "s’abstient" in card
    assert "Épingler" in card
    assert "Réinférer" in card
    assert "specialistIndicatorHelpItems" in card
    assert "HelpTip" in card


def test_specialist_indicator_help_node() -> None:
    script = ROOT / "tests" / "test_brain_specialists_view.ts"
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
