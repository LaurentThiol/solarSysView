"""Rétro-test : ces figures disent-elles quelque chose, ou rien ?

Deux questions, deux modèles nuls, et le verdict affiché tel quel — y compris
quand il est nul. C'est tout l'intérêt du module : construire une démarche de
choix sur ce qui a du répondant plutôt que sur ce qui a l'air convaincant.

1. **L'objectif a-t-il été atteint ?** Pour chaque cassure historique, la
   courbe a-t-elle rejoint la cible projetée avant invalidation. Comparé à un
   modèle nul qui applique *exactement la même mesure* à des points tirés au
   hasard sur la même courbe : même distance d'objectif, même niveau
   d'invalidation, même horizon. Ce qui reste après cette soustraction est ce
   que la figure apporte, et rien d'autre.

2. **Y a-t-il un signal sur les numéros ?** Quelles boules sont sorties dans
   les tirages suivant chaque déclenchement, comparé à l'uniforme, avec
   correction de Benjamini-Hochberg : cinquante tests simultanés produisent
   deux ou trois « découvertes » par pur hasard.

S'ajoute une mesure qui remet les figures à leur place : le **taux de base**.
Combien de marches aléatoires de même longueur portent la même figure ? Si une
tête & épaules apparaît sur trois fenêtres aléatoires sur quatre, en voir une
n'apprend presque rien.
"""

from __future__ import annotations

import math
import random
from typing import Any, Sequence

from synchro.analysis.common import as_date, numbers_of, ordered_draws, stars_of
from synchro.analysis.inference import bh_fdr, chi2_sf, wilson_interval
from synchro.chartisme.catalog import label_of
from synchro.chartisme.figures import detect_figures, target_reached

DEFAULT_TRIALS = 400
DEFAULT_HORIZON = 40
DEFAULT_FOLLOW = 5
BALL_COUNT = 50
BALLS_PER_DRAW = 5
STAR_COUNT = 12
STARS_PER_DRAW = 2


# --- Question 1 : l'objectif est-il atteint ? ---------------------------------


def _walk_forward(
    values: Sequence[float],
    start: int,
    level: float,
    goal: float,
    *,
    down: bool,
    horizon: int,
) -> str:
    stop = min(len(values), start + horizon + 1)
    for index in range(start + 1, stop):
        value = float(values[index])
        if (value <= goal) if down else (value >= goal):
            return "reached"
        if (value > level) if down else (value < level):
            return "invalidated"
    return "open"


def null_target_rate(
    values: Sequence[float],
    *,
    distance: float,
    down: bool,
    horizon: int = DEFAULT_HORIZON,
    trials: int = DEFAULT_TRIALS,
    seed: int = 0,
) -> dict[str, Any]:
    """Même mesure, points de départ tirés au hasard sur la même courbe.

    Le niveau d'invalidation est pris à la valeur du point de départ : c'est la
    transposition littérale de la règle appliquée aux vraies cassures, sans
    quoi la comparaison ne voudrait rien dire.
    """
    usable = len(values) - 2
    if usable < 2 or distance <= 0:
        return {"trials": 0, "reached": 0, "settled": 0, "rate": None}
    rng = random.Random(seed)
    reached = 0
    settled = 0
    for _ in range(trials):
        start = rng.randint(0, usable)
        level = float(values[start])
        goal = level - distance if down else level + distance
        status = _walk_forward(
            values, start, level, goal, down=down, horizon=horizon
        )
        if status == "reached":
            reached += 1
            settled += 1
        elif status == "invalidated":
            settled += 1
    return {
        "trials": trials,
        "reached": reached,
        "settled": settled,
        "rate": round(reached / settled, 4) if settled else None,
    }


def target_outcomes(
    curves: dict[str, dict[str, Any]],
    hits: Sequence[dict[str, Any]],
    *,
    horizon: int = DEFAULT_HORIZON,
    trials: int = DEFAULT_TRIALS,
    seed: int = 0,
) -> dict[str, Any]:
    """Objectif atteint, par figure, contre le modèle nul de la même courbe."""
    per_figure: dict[str, dict[str, Any]] = {}
    for hit in hits:
        breakout = hit.get("breakout")
        target = hit.get("target")
        curve = curves.get(str(hit.get("curve_id") or ""))
        if not breakout or not target or not curve:
            continue
        values = [float(v) for v in curve.get("values") or []]
        if not values:
            continue
        outcome = target_reached(values, hit, horizon=horizon)
        row = per_figure.setdefault(
            hit["figure"],
            {
                "figure": hit["figure"],
                "label": label_of(hit["figure"]),
                "reached": 0,
                "invalidated": 0,
                "open": 0,
                "distances": [],
                "curves": set(),
            },
        )
        status = outcome.get("status")
        if status in ("reached", "invalidated", "open"):
            row[status] += 1
        row["distances"].append(abs(float(target["value"]) - float(breakout["level"])))
        row["curves"].add(str(hit.get("curve_id")))

    out: list[dict[str, Any]] = []
    for figure, row in per_figure.items():
        settled = row["reached"] + row["invalidated"]
        rate, low, high = wilson_interval(row["reached"], settled) if settled else (None, None, None)
        distance = sum(row["distances"]) / len(row["distances"]) if row["distances"] else 0.0
        # Le modèle nul est tiré sur la première courbe concernée : la mesure
        # doit rester dans la même échelle de volatilité que les cassures.
        curve_id = sorted(row["curves"])[0] if row["curves"] else None
        curve = curves.get(str(curve_id or ""))
        null = (
            null_target_rate(
                [float(v) for v in curve.get("values") or []],
                distance=distance,
                down=True,
                horizon=horizon,
                trials=trials,
                seed=seed,
            )
            if curve
            else {"rate": None, "settled": 0}
        )
        out.append(
            {
                "figure": figure,
                "label": row["label"],
                "reached": row["reached"],
                "invalidated": row["invalidated"],
                "open": row["open"],
                "settled": settled,
                "hit_rate": None if rate is None else round(rate, 4),
                "wilson": None if rate is None else [round(low, 4), round(high, 4)],
                "mean_distance": round(distance, 3),
                "null_rate": null["rate"],
                "edge": (
                    None
                    if rate is None or null["rate"] is None
                    else round(rate - null["rate"], 4)
                ),
                "beats_null": (
                    None
                    if rate is None or null["rate"] is None
                    else bool(low is not None and low > null["rate"])
                ),
            }
        )
    out.sort(key=lambda row: -(row["settled"] or 0))
    return {
        "horizon": horizon,
        "figures": out,
        "verdict": _target_verdict(out),
    }


def _target_verdict(rows: Sequence[dict[str, Any]]) -> dict[str, Any]:
    measured = [row for row in rows if row["beats_null"] is not None]
    winners = [row["figure"] for row in measured if row["beats_null"]]
    return {
        "measured": len(measured),
        "beat_null": winners,
        # Formulé au négatif exprès : c'est le résultat attendu sur des
        # courbes de tirages, et le voir écrit vaut mieux que l'ignorer.
        "any_edge": bool(winners),
        "note": (
            "Aucune figure ne dépasse son modèle nul : sur ces courbes, "
            "l'objectif projeté est atteint à la fréquence du hasard."
            if not winners
            else "Figures dont l'intervalle de Wilson passe au-dessus du modèle nul."
        ),
    }


# --- Question 2 : y a-t-il un signal sur les numéros ? ------------------------


def following_draws(
    draws: Sequence[dict[str, Any]],
    date_text: str | None,
    *,
    count: int = DEFAULT_FOLLOW,
) -> list[dict[str, Any]]:
    """Les `count` tirages qui suivent strictement une date."""
    if not date_text:
        return []
    try:
        pivot = as_date(date_text)
    except (ValueError, TypeError):
        return []
    later = [d for d in draws if as_date(d["draw_date"]) > pivot]
    return later[:count]


def number_signal(
    draws: Sequence[dict[str, Any]],
    firings: Sequence[dict[str, Any]],
    *,
    follow: int = DEFAULT_FOLLOW,
    stars: bool = False,
) -> dict[str, Any]:
    """Les boules sorties après chaque déclenchement, contre l'uniforme."""
    ordered = ordered_draws(draws)
    size = STAR_COUNT if stars else BALL_COUNT
    per_draw = STARS_PER_DRAW if stars else BALLS_PER_DRAW
    counts = [0] * (size + 1)
    observed_draws = 0
    for firing in firings:
        date_text = firing.get("figure_date") or (firing.get("snapshot") or {}).get("to")
        for draw in following_draws(ordered, date_text, count=follow):
            observed_draws += 1
            picks = stars_of(draw) if stars else numbers_of(draw)
            for value in picks:
                if 1 <= value <= size:
                    counts[value] += 1
    if not observed_draws:
        return {
            "draws": 0,
            "expected_per_ball": None,
            "chi2": None,
            "chi2_p": None,
            "balls": [],
            "flagged": [],
            "verdict": "aucun tirage postérieur à mesurer",
        }
    total = observed_draws * per_draw
    expected = total / size
    chi = sum((counts[v] - expected) ** 2 / expected for v in range(1, size + 1))
    p_value = chi2_sf(chi, float(size - 1))
    probability = per_draw / size
    rows: list[dict[str, Any]] = []
    p_values: list[float] = []
    for value in range(1, size + 1):
        rate, low, high = wilson_interval(counts[value], observed_draws)
        p_ball = _binomial_two_sided(counts[value], observed_draws, probability)
        p_values.append(p_ball)
        rows.append(
            {
                "value": value,
                "count": counts[value],
                "rate": round(rate, 4),
                "wilson": [round(low, 4), round(high, 4)],
                "expected_rate": round(probability, 4),
                "p": round(p_ball, 4),
            }
        )
    # Cinquante tests simultanés produisent deux ou trois « découvertes » par
    # pur hasard : sans correction, ce tableau mentirait à chaque exécution.
    flags = bh_fdr(p_values, 0.05)
    for row, flag in zip(rows, flags):
        row["flagged"] = bool(flag)
    flagged = [row["value"] for row in rows if row["flagged"]]
    rows.sort(key=lambda row: -row["count"])
    return {
        "draws": observed_draws,
        "follow": follow,
        "expected_per_ball": round(expected, 3),
        "chi2": round(chi, 4),
        "chi2_df": size - 1,
        "chi2_p": round(p_value, 4),
        "balls": rows,
        "flagged": flagged,
        "verdict": (
            "Aucune boule ne se distingue de l'uniforme après correction : "
            "les tirages restent indépendants des figures observées."
            if not flagged
            else f"Boules retenues après correction BH : {flagged}."
        ),
    }


def _binomial_two_sided(successes: int, trials: int, probability: float) -> float:
    """Test binomial exact bilatéral, en log-factorielles pour éviter l'explosion."""
    if trials <= 0:
        return 1.0
    target = _log_binomial_pmf(successes, trials, probability)
    total = 0.0
    for k in range(trials + 1):
        value = _log_binomial_pmf(k, trials, probability)
        if value <= target + 1e-9:
            total += math.exp(value)
    return min(1.0, total)


def _log_binomial_pmf(k: int, n: int, p: float) -> float:
    if p <= 0:
        return 0.0 if k == 0 else -math.inf
    if p >= 1:
        return 0.0 if k == n else -math.inf
    return (
        math.lgamma(n + 1)
        - math.lgamma(k + 1)
        - math.lgamma(n - k + 1)
        + k * math.log(p)
        + (n - k) * math.log1p(-p)
    )


# --- Taux de base : combien de hasard porte la même figure ? ------------------


def random_walk(length: int, rng: random.Random, *, step: float = 1.0) -> list[float]:
    values = [100.0]
    for _ in range(length - 1):
        values.append(values[-1] + rng.gauss(0.0, step))
    return values


def figure_base_rate(
    *,
    length: int = 60,
    trials: int = 300,
    min_confidence: float = 0.6,
    seed: int = 0,
) -> dict[str, Any]:
    """Part des marches aléatoires portant chaque figure.

    Mesure inconfortable et nécessaire. Une figure dont le taux de base est
    élevé n'est pas une observation : c'est ce que produit n'importe quel
    tracé bruité de cette longueur.
    """
    rng = random.Random(seed)
    counts: dict[str, int] = {}
    carrying = 0
    for _ in range(trials):
        values = random_walk(length, rng)
        activity = [abs(values[i] - values[i - 1]) if i else 0.0 for i in range(len(values))]
        hits = detect_figures(values, activity=activity, min_confidence=min_confidence)
        if hits:
            carrying += 1
        for figure in {hit["figure"] for hit in hits}:
            counts[figure] = counts.get(figure, 0) + 1
    rows = [
        {
            "figure": figure,
            "label": label_of(figure),
            "count": count,
            "base_rate": round(count / trials, 4),
        }
        for figure, count in sorted(counts.items(), key=lambda kv: -kv[1])
    ]
    return {
        "trials": trials,
        "length": length,
        "min_confidence": min_confidence,
        "windows_with_any_figure": round(carrying / trials, 4),
        "figures": rows,
        "note": (
            "Taux de base sur marches aléatoires : une figure fréquente ici "
            "n'apprend rien quand on la voit sur une vraie courbe."
        ),
    }


# --- Le rapport complet -------------------------------------------------------


def run(
    curves: dict[str, dict[str, Any]],
    hits: Sequence[dict[str, Any]],
    *,
    draws: Sequence[dict[str, Any]] | None = None,
    firings: Sequence[dict[str, Any]] | None = None,
    horizon: int = DEFAULT_HORIZON,
    follow: int = DEFAULT_FOLLOW,
    trials: int = DEFAULT_TRIALS,
    base_rate_trials: int = 200,
    seed: int = 0,
) -> dict[str, Any]:
    """Les deux questions, plus le taux de base, en un seul rapport."""
    report: dict[str, Any] = {
        "figure_count": len(hits),
        "curve_count": len(curves),
        "targets": target_outcomes(
            curves, hits, horizon=horizon, trials=trials, seed=seed
        ),
        "base_rates": figure_base_rate(trials=base_rate_trials, seed=seed),
        "disclaimer": (
            "Les tirages sont indépendants. Une figure est une propriété du "
            "tracé, pas une prédiction. Ce rapport mesure l'écart entre les "
            "deux ; il ne le comble pas."
        ),
    }
    if draws:
        source = list(firings if firings is not None else hits)
        report["numbers"] = number_signal(draws, source, follow=follow)
        report["stars"] = number_signal(draws, source, follow=follow, stars=True)
    return report
