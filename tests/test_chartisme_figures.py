"""Les 18 détecteurs, mesurés sur les figures d'école puis sur du bruit."""

import random

import pytest

from synchro.chartisme.catalog import FIGURE_IDS, kind_of
from synchro.chartisme.figures import (
    ACTIVITY_PERIOD,
    activity_ratio,
    best_figure,
    dedupe,
    detect_figures,
    rank_key,
    summarize,
    target_reached,
)
from synchro.chartisme.synth import GENERATORS, make_sample

TEXTBOOK = [f for f in FIGURE_IDS if f != "none"]


def _activity(values: list[float]) -> list[float]:
    out = [abs(values[i] - values[i - 1]) if i else 0.0 for i in range(len(values))]
    if len(out) > 1:
        out[0] = out[1]
    return out


def _clean(figure: str, seed: int = 0) -> tuple[list[float], list[float]]:
    """Figure d'école : le générateur sans bruit, sans porteuse, sans symétrie."""
    sample = make_sample(
        figure,
        random.Random(seed),
        length=72,
        jitter=0.0,
        flip=False,
        warp=False,
        noise=0.0,
        carrier=0.0,
    )
    return list(sample["values"]), list(sample["activity"])


SEEDS = range(40)


def _read(figure: str, seed: int) -> list[str]:
    values, activity = _clean(figure, seed)
    return [hit["figure"] for hit in detect_figures(values, activity=activity, min_confidence=0.0)]


@pytest.mark.parametrize("figure", TEXTBOOK)
def test_textbook_figure_is_among_the_top_readings(figure: str) -> None:
    """Chaque figure d'école se retrouve dans les trois premières lectures.

    Mesuré sur quarante tirages du générateur, pas sur un seul : les
    paramètres sont aléatoires et une graine malheureuse ne prouve rien. Trois
    lectures et non une, parce qu'une zone en porte légitimement plusieurs —
    la ligne de cou d'une ETE est aussi un double creux, et un rectangle est
    toujours un triple sommet moins spécifique.
    """
    top3 = sum(1 for seed in SEEDS if figure in _read(figure, seed)[:3])
    assert top3 >= 0.7 * len(SEEDS), f"{figure}: {top3}/{len(SEEDS)} seulement"


@pytest.mark.parametrize("figure", TEXTBOOK)
def test_textbook_figure_is_never_invisible(figure: str) -> None:
    """Ne rien renvoyer est le pire échec : l'onglet n'a alors rien à montrer.

    Pire qu'une mauvaise lecture, qui laisse au moins voir la zone et se
    corrige à l'atelier.
    """
    blind = sum(1 for seed in SEEDS if not _read(figure, seed))
    assert blind <= 0.2 * len(SEEDS), f"{figure}: {blind}/{len(SEEDS)} fenêtres muettes"


def test_textbook_rates_stay_high() -> None:
    """Mesure d'ensemble, celle qui documente la précision du détecteur."""
    top1 = top3 = total = 0
    for figure in TEXTBOOK:
        for seed in SEEDS:
            names = _read(figure, seed)
            total += 1
            top1 += names[:1] == [figure]
            top3 += figure in names[:3]
    assert top1 / total >= 0.7, f"première lecture: {top1}/{total}"
    assert top3 / total >= 0.9, f"trois premières: {top3}/{total}"


def test_hits_carry_the_full_geometry() -> None:
    """Une détection sans géométrie ne se dessine pas : on exige tout."""
    values, activity = _clean("ete")
    hit = best_figure(values, activity=activity)
    assert hit is not None
    assert hit["figure"] == "ete"
    assert hit["kind"] == kind_of("ete")
    assert hit["label"] and hit["signal"]
    assert 0.0 <= hit["confidence"] <= 1.0
    assert hit["from_index"] < hit["to_index"]
    roles = {pivot["role"] for pivot in hit["pivots"]}
    assert {"left_shoulder", "head", "right_shoulder"} <= roles
    assert any(guide["role"] == "neckline" for guide in hit["guides"])
    # La cassure d'une ETE se fait par le bas, et l'objectif est sous le cou.
    assert hit["breakout"]["direction"] == "down"
    assert hit["target"]["value"] < hit["breakout"]["level"]


def test_inverted_ete_mirrors_the_direction() -> None:
    values, activity = _clean("ete_inv")
    hit = best_figure(values, activity=activity)
    assert hit is not None and hit["figure"] == "ete_inv"
    assert hit["breakout"]["direction"] == "up"
    assert hit["target"]["value"] > hit["breakout"]["level"]


def test_target_follows_the_reference_table() -> None:
    """Objectif = distance tête↔cou reportée sous la ligne de cou."""
    values, activity = _clean("ete")
    hit = best_figure(values, activity=activity)
    assert hit is not None
    head = max(p["value"] for p in hit["pivots"] if p["role"] == "head")
    level = hit["breakout"]["level"]
    projected = level - (head - level)
    assert abs(hit["target"]["value"] - projected) < 0.5 * abs(head - level)


def test_golden_rule_needs_volume_above_the_moving_average() -> None:
    """Sans activité au-dessus de la MM20, la cassure est un fake breakout."""
    values, activity = _clean("ete")
    confirmed = best_figure(values, activity=activity)
    assert confirmed is not None and confirmed["breakout"]["volume_ok"]
    assert confirmed["breakout"]["confirmed"]

    # Activité écrasée juste sur la cassure : la règle d'or ne passe plus.
    index = confirmed["breakout"]["index"]
    muted = list(activity)
    muted[index] = 0.0
    again = detect_figures(values, activity=muted, min_confidence=0.0)
    ete = next((h for h in again if h["figure"] == "ete"), None)
    assert ete is not None
    assert not ete["breakout"]["volume_ok"]
    assert not ete["breakout"]["confirmed"]
    assert ete["breakout"]["fake"]


def test_activity_ratio_compares_to_its_own_average() -> None:
    flat = [10.0] * 40
    assert activity_ratio(flat, 30) == pytest.approx(1.0)
    spike = list(flat)
    spike[30] = 40.0
    assert activity_ratio(spike, 30) > 1.0
    # Hors bornes : aucune preuve, donc aucun crédit.
    assert activity_ratio(flat, -1) == 0.0
    assert activity_ratio(flat, 999) == 0.0
    assert activity_ratio([], 0) == 0.0
    assert ACTIVITY_PERIOD == 20


def test_confidence_separates_figures_from_noise() -> None:
    """Une marche aléatoire doit marquer moins qu'une figure construite.

    Ce test a une histoire : une droite passant par deux points a une erreur
    d'ajustement nulle par construction, ce qui donnait 0.99 de confiance à
    n'importe quel bruit. La pénalité d'indétermination corrige cela.
    """
    rng = random.Random(3)
    noise_scores = []
    for _ in range(60):
        walk = [100.0]
        for _ in range(71):
            walk.append(walk[-1] + rng.gauss(0.0, 1.0))
        hit = best_figure(walk, activity=_activity(walk))
        if hit:
            noise_scores.append(hit["confidence"])

    figure_scores = []
    for figure in TEXTBOOK:
        values, activity = _clean(figure)
        hit = best_figure(values, activity=activity)
        if hit:
            figure_scores.append(hit["confidence"])

    assert figure_scores
    assert noise_scores
    mean_noise = sum(noise_scores) / len(noise_scores)
    mean_figure = sum(figure_scores) / len(figure_scores)
    assert mean_figure > mean_noise


def test_random_walks_carry_figures_often() -> None:
    """Le résultat inconfortable, écrit noir sur blanc.

    La plupart des marches aléatoires portent une figure. C'est pourquoi le
    module expose un taux de base : une figure fréquente sur du bruit
    n'apprend rien quand on la voit sur une vraie courbe.
    """
    rng = random.Random(11)
    carrying = 0
    trials = 50
    for _ in range(trials):
        walk = [100.0]
        for _ in range(59):
            walk.append(walk[-1] + rng.gauss(0.0, 1.0))
        if detect_figures(walk, activity=_activity(walk), min_confidence=0.6):
            carrying += 1
    assert carrying > trials * 0.5


def test_min_confidence_filters() -> None:
    values, activity = _clean("triple_top")
    loose = detect_figures(values, activity=activity, min_confidence=0.0)
    strict = detect_figures(values, activity=activity, min_confidence=0.9)
    assert len(strict) <= len(loose)
    assert all(hit["confidence"] >= 0.9 for hit in strict)


def test_tunnel_droit_has_parallel_bounds() -> None:
    """Le canal incliné n'est plus un trou : rectangle reste plat, tunnel a une pente."""
    values, activity = _clean("tunnel_droit", seed=1)
    hits = detect_figures(values, activity=activity, min_confidence=0.0)
    names = [hit["figure"] for hit in hits]
    assert "tunnel_droit" in names[:3]
    hit = next(hit for hit in hits if hit["figure"] == "tunnel_droit")
    roles = {guide["role"] for guide in hit["guides"]}
    assert {"upper", "lower"} <= roles
    assert hit["kind"] == "continuation"


def test_dedupe_keeps_one_reading_per_figure_and_zone() -> None:
    values, activity = _clean("rectangle")
    hits = detect_figures(values, activity=activity, min_confidence=0.0)
    seen: dict[str, list[tuple[int, int]]] = {}
    for hit in hits:
        spans = seen.setdefault(hit["figure"], [])
        for start, stop in spans:
            lo, hi = max(start, hit["from_index"]), min(stop, hit["to_index"])
            shortest = min(stop - start, hit["to_index"] - hit["from_index"])
            if hi > lo and shortest > 0:
                assert (hi - lo) / shortest <= 0.2
        spans.append((hit["from_index"], hit["to_index"]))
    assert dedupe(hits) == hits


def test_ranking_puts_confirmed_breakouts_first() -> None:
    values, activity = _clean("ete")
    hits = detect_figures(values, activity=activity, min_confidence=0.0)
    keys = [rank_key(hit) for hit in hits]
    assert keys == sorted(keys)


def test_dates_flow_into_the_hits() -> None:
    values, activity = _clean("double_top")
    dates = [f"2020-01-{i % 28 + 1:02d}" for i in range(len(values))]
    hit = best_figure(values, dates, activity)
    assert hit is not None
    assert hit["from"] == dates[hit["from_index"]]
    assert hit["to"] == dates[hit["to_index"]]
    assert all(pivot["date"] == dates[pivot["index"]] for pivot in hit["pivots"])


def test_no_dates_leaves_none_rather_than_crashing() -> None:
    values, activity = _clean("double_top")
    hit = best_figure(values, None, activity)
    assert hit is not None
    assert hit["from"] is None
    assert all(pivot["date"] is None for pivot in hit["pivots"])


def test_target_reached_reads_the_outcome() -> None:
    values, activity = _clean("ete")
    hit = best_figure(values, activity=activity)
    assert hit is not None
    outcome = target_reached(values, hit)
    assert outcome["status"] in ("reached", "invalidated", "open")
    # Horizon nul : rien n'a le temps de se produire.
    assert target_reached(values, hit, horizon=0)["status"] == "open"
    # Sans cassure, il n'y a rien à mesurer.
    assert target_reached(values, {**hit, "breakout": None})["status"] == "no_breakout"


def test_short_and_degenerate_windows_are_safe() -> None:
    assert detect_figures([], activity=[]) == []
    assert detect_figures([1.0, 2.0], activity=[0.0, 1.0]) == []
    assert detect_figures([5.0] * 40, activity=[0.0] * 40) == []
    assert best_figure([5.0] * 40) is None


def test_summarize_counts_the_breakout_states() -> None:
    values, activity = _clean("triangle_asc")
    hits = detect_figures(values, activity=activity, min_confidence=0.0)
    summary = summarize(hits)
    assert summary["count"] == len(hits)
    assert summary["confirmed"] + summary["fake"] + summary["pending"] == len(hits)
    assert sum(summary["by_figure"].values()) == len(hits)


def test_every_figure_has_a_generator() -> None:
    assert set(GENERATORS) == set(FIGURE_IDS)
