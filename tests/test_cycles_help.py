"""Aide en ligne des champs de la page Cycles."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LAB = (ROOT / "src/components/cycles/cycles-lab.tsx").read_text(encoding="utf-8")
CHARTS = (ROOT / "src/components/cycles/cycle-charts.tsx").read_text(encoding="utf-8")
BAR = (ROOT / "src/components/analysis/window-bar.tsx").read_text(encoding="utf-8")


def test_cycles_form_fields_name_their_help() -> None:
    assert 'title: "Lire le TFT"' in LAB
    assert 'title: "torch"' in LAB
    assert 'title: "Effectif de la fenêtre"' in LAB
    assert "warmupHelp={WINDOW_HELP}" in LAB
    assert "footnote={WINDOW_FOOTNOTE}" in LAB
    assert "encodeur" in LAB
    assert "warmupHelp?" in BAR
    assert "footnote?" in BAR


def test_cycles_fit_metrics_have_help() -> None:
    for title in (
        "Perte d’entraînement",
        "Perte de test",
        "Base",
        "Rapport",
        "Couverture",
        "Raie Harmo",
    ):
        assert f'title: "{title}"' in LAB
    assert "<FitMetric" in LAB


def test_cycles_channels_have_help() -> None:
    for key in ("lunar:", "carrington:", "schwabe:", "tropical:"):
        assert key in LAB
    for key in (
        '"harmo:court"',
        '"chartisme:occupancy"',
        '"chartisme:etendue"',
        '"morpho:gap_span"',
        '"relief:centroid"',
        '"pronostic:z"',
    ):
        assert key in LAB
    assert "function channelHelp" in LAB
    assert "<ChannelName" in LAB
    assert 'title: "Futur connu"' in LAB
    assert 'title: "Passé observé"' in LAB
    assert 'label: "Phase"' in LAB
    assert 'label: "Tirages"' in LAB


def test_cycles_charts_name_each_toggle() -> None:
    for label in ("Lune", "Carrington", "Raie Harmo", "Cycle court", "Année"):
        assert f'label: "{label}"' in CHARTS
        assert "help:" in CHARTS
    for label in (
        "Figure chartiste",
        "Activité",
        "Forme Morpho",
        "Centroïde Relief",
        "Résidu",
    ):
        assert f'label: "{label}"' in CHARTS
    assert "<HelpWrap" in CHARTS
    assert "<TitleHelp" in CHARTS
    assert 'title: "Couverture dans l’archive"' in CHARTS
    assert 'title="Écart"' in CHARTS
    assert 'label: "Écart"' in CHARTS
    assert "help?: HelpCopy" in CHARTS
    assert 'title: "Trois nuls"' in LAB
    assert 'label: "Remaniement de l’ordre"' in LAB
    assert 'label: "Permutation des phases"' in LAB
    assert 'label: "Entrées i.i.d."' in LAB
