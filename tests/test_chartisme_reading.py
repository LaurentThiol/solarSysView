"""Fiche, lectures, rareté d'ensemble et règles : le contrat d'affichage."""

from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
LAB = (ROOT / "src/components/chartisme/chartisme-lab.tsx").read_text(encoding="utf-8")
COMPARE = (ROOT / "src/components/chartisme/window-compare.tsx").read_text(encoding="utf-8")
PANEL = (ROOT / "src/components/chartisme/backtest-panel.tsx").read_text(encoding="utf-8")
RULES = (ROOT / "src/components/chartisme/rules-panel.tsx").read_text(encoding="utf-8")
MAP = (ROOT / "src/components/chartisme/curve-map.tsx").read_text(encoding="utf-8")


def test_reading_helpers_node() -> None:
    result = subprocess.run(
        [
            "node",
            "--experimental-strip-types",
            "--import",
            str(ROOT / "tests" / "node-register.mjs"),
            "--test",
            str(ROOT / "tests" / "test_chartisme_reading.ts"),
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stdout + result.stderr


def test_selected_figure_carries_its_own_bar_and_the_other_readings() -> None:
    assert "verdictSentence" in LAB
    assert "outcomePhrase" in LAB
    assert "curveFamilies" in LAB
    assert "hitListCaption" in LAB
    assert "ArrowLeft" in LAB
    assert "ArrowRight" in LAB
    assert "nearestOnCurve" in LAB
    assert "senseSentence" in LAB
    assert "nameSense" in LAB
    assert "senseSentence(senseRead.named)" in LAB
    assert "Fenêtre étudiée · {senseSentence(sense)}" in COMPARE
    assert "senseSentence(previousSense)" in COMPARE
    assert "models: true" in LAB
    assert "Backend Python injoignable ou réseaux absents" in LAB
    assert "40 premières" not in LAB or "hitListCaption" in LAB


def test_trace_note_keeps_the_ensemble_threshold() -> None:
    assert "Intervalle de Wilson du taux d'ensemble" in LAB
    assert "Lecture géométrique d’abord" not in LAB
    assert "celui annoncé sous le tracé" in MAP


def test_backtest_splits_seen_shapes_from_the_ensemble_bar() -> None:
    assert "splitByEnsemble" in PANEL
    assert "Formes vues" in PANEL
    assert "seuil d’ensemble" in PANEL
    assert "hits={annotatedHits}" in LAB


def test_rules_preview_does_not_write_the_journal() -> None:
    assert "SelectedRulePreview" in RULES
    assert "Aucune règle active ne correspond" in RULES
    assert "Évaluer sur la courbe affichée" in RULES
    preview = RULES.split("function SelectedRulePreview", 1)[1].split("export function RulesPanel", 1)[0]
    assert "recordFirings" not in preview
    assert "evaluateRules" in preview
