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
Combien de fenêtres de bruit de même longueur portent la même figure ? Le bruit
vient des mêmes tirages remis dans un ordre quelconque, ce qui garde les bornes
et les paliers de chaque courbe — une marche gaussienne les ignorait et
sous-estimait le bruit partout où la courbe est bornée, c'est-à-dire presque
partout. Si une tête & épaules apparaît sur trois fenêtres de bruit sur quatre,
en voir une n'apprend presque rien.
"""

from __future__ import annotations

import math
import random
from typing import Any, Sequence

from synchro.analysis.common import as_date, numbers_of, ordered_draws, stars_of
from synchro.analysis.inference import bh_fdr, chi2_sf, wilson_interval
from synchro.analysis.tech import activity_from_close
from synchro.analysis.variables import series
from synchro.chartisme.catalog import label_of
from synchro.chartisme.export import curve_label
from synchro.chartisme.figures import detect_figures, target_reached

DEFAULT_TRIALS = 400
DEFAULT_HORIZON = 40
DEFAULT_FOLLOW = 5
DEFAULT_BASE_LENGTH = 60
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


def _firing_date(firing: dict[str, Any]) -> str | None:
    """Date de fin de fenêtre, qu'on parte d'un déclenchement ou d'une figure brute."""
    raw = (
        firing.get("figure_date")
        or (firing.get("snapshot") or {}).get("to")
        or firing.get("to")
    )
    return str(raw) if raw else None


def number_signal(
    draws: Sequence[dict[str, Any]],
    firings: Sequence[dict[str, Any]],
    *,
    follow: int = DEFAULT_FOLLOW,
    stars: bool = False,
) -> dict[str, Any]:
    """Les boules sorties après chaque déclenchement, contre l'uniforme.

    Chaque tirage postérieur ne compte **qu'une fois**, même s'il suit dix
    déclenchements. Les fenêtres de suivi se chevauchent massivement — un
    balayage multi-échelle repère la même zone à plusieurs reprises — et
    compter les doublons multiplierait l'effectif sans ajouter une seule
    observation. Le binomial et le χ² supposent des tirages indépendants :
    sans cette déduplication, la répétition seule suffirait à fabriquer des
    « découvertes » significatives sur une archive parfaitement uniforme.
    """
    ordered = ordered_draws(draws)
    size = STAR_COUNT if stars else BALL_COUNT
    per_draw = STARS_PER_DRAW if stars else BALLS_PER_DRAW
    counts = [0] * (size + 1)
    seen: set[str] = set()
    for firing in firings:
        for draw in following_draws(ordered, _firing_date(firing), count=follow):
            key = str(draw["draw_date"])
            if key in seen:
                continue
            seen.add(key)
            picks = stars_of(draw) if stars else numbers_of(draw)
            for value in picks:
                if 1 <= value <= size:
                    counts[value] += 1
    observed_draws = len(seen)
    if not observed_draws:
        return {
            "draws": 0,
            "follow": follow,
            "firings": len(firings),
            "expected_per_ball": None,
            "chi2": None,
            "chi2_df": size - 1,
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
        # L'écart entre `firings` et `draws` dit le chevauchement des fenêtres :
        # c'est l'effectif réel qui porte le verdict, pas le nombre de figures.
        "firings": len(firings),
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


#: Tirages de contexte gardés devant la fenêtre simulée.
#:
#: Le retard d'une boule doit avoir vu passer cette boule au moins une fois,
#: faute de quoi ses premiers points ne sont qu'une rampe « jamais sortie »
#: qu'aucune vraie fenêtre ne montre ; la MM20 doit avoir ses vingt points.
SIMULATED_CONTEXT = 200


def shuffled_draws(
    draws: Sequence[dict[str, Any]], rng: random.Random
) -> list[dict[str, Any]]:
    """Les mêmes tirages dans un autre ordre, dates réattribuées par ordre croissant.

    La réattribution n'est pas cosmétique : `series` retrie ses tirages par date,
    donc un mélange qui garderait les dates d'origine serait défait aussitôt.
    """
    dates = sorted(as_date(d["draw_date"]) for d in draws)
    picks = list(draws)
    rng.shuffle(picks)
    return [{**pick, "draw_date": dates[i]} for i, pick in enumerate(picks)]


#: Plafond au-delà duquel un seuil ne trie plus rien.
#:
#: C'est celui du curseur de confiance de l'onglet, et il ne s'arrête pas là par
#: hasard : une confiance de 0.95 exige un ajustement quasi parfait, que presque
#: aucune figure réelle n'atteint. Au-dessus, le seuil ne sépare plus le bruit de
#: la figure — il rejette les deux.
MAX_THRESHOLD = 0.95

#: Pas du seuil rendu : plus fin, il afficherait une précision qu'il n'a pas.
THRESHOLD_STEP = 0.01


def best_per_window(per_window: Sequence[dict[str, float]]) -> list[float]:
    """Meilleure confiance par fenêtre de bruit, 0 quand la fenêtre n'a rien porté."""
    return [max(window.values(), default=0.0) for window in per_window]


def threshold_for_base_rate(
    per_window: Sequence[dict[str, float]], *, target: float
) -> dict[str, Any]:
    """L'inverse du taux de base : quel seuil obtient la rareté visée ?

    Le taux de base décroît quand le seuil monte, donc l'inversion se lit
    directement dans la distribution des meilleures confiances obtenues sur le
    bruit. Pour n'accepter qu'une part `target` de fenêtres porteuses, le seuil
    doit dépasser la (target·N + 1)-ième meilleure : au-dessus d'elle il n'en
    reste au plus que target·N.

    L'intérêt du renversement est qu'un seuil de confiance ne veut pas dire la
    même chose d'une courbe à l'autre — 0.60 laisse passer presque tout le bruit
    sur « paires consécutives » et un peu plus de la moitié sur la somme. Une
    rareté visée, elle, dit la même chose partout.

    `threshold` vaut `None` quand la cible est hors d'atteinte ; `required` dit
    alors de combien on manque.
    """
    trials = len(per_window)
    if not trials:
        return {"trials": 0, "target": target, "threshold": None, "achieved": 0.0, "required": 1.0}
    bests = sorted(best_per_window(per_window), reverse=True)
    rate = lambda bar: sum(1 for best in bests if best >= bar) / trials  # noqa: E731
    # Nombre de fenêtres porteuses tolérées. Tronqué, jamais arrondi : viser 20 %
    # sur 120 remaniements autorise 24 fenêtres, pas 24,4.
    allowed = int(target * trials)
    if allowed >= trials:
        return {
            "trials": trials,
            "target": target,
            "threshold": 0.0,
            "achieved": round(rate(0.0), 4),
            "required": 0.0,
        }
    # La valeur qu'il faut dépasser, et le premier cran de la grille qui la dépasse.
    required = min(1.0, round((int(bests[allowed] / THRESHOLD_STEP + 1e-9) + 1) * THRESHOLD_STEP, 2))
    return {
        "trials": trials,
        "target": target,
        "threshold": None if required > MAX_THRESHOLD else required,
        "achieved": round(rate(required), 4),
        "required": required,
    }


def figure_base_rate(
    *,
    draws: Sequence[dict[str, Any]],
    variables: Sequence[tuple[str, int | None]] = (("sum", None),),
    length: int = DEFAULT_BASE_LENGTH,
    trials: int = 200,
    max_windows: int = 600,
    min_confidence: float = 0.6,
    target: float = 0.2,
    seed: int = 0,
) -> dict[str, Any]:
    """Part des fenêtres de bruit portant chaque figure, bruit tiré des tirages.

    Mesure inconfortable et nécessaire. Une figure dont le taux de base est
    élevé n'est pas une observation : c'est ce que produit n'importe quel tracé
    bruité de cette longueur.

    Le bruit vient des tirages remis dans un ordre quelconque, non d'une marche
    gaussienne. Une marche est non bornée et sans rapport avec la courbe lue :
    elle sous-estimait le bruit partout où la courbe est bornée, et la plupart le
    sont. `n1` ne descend pas sous 1 et passe l'essentiel de son temps entre 1 et
    10, si bien que deux passages sur le plancher forment un plancher et non un
    double creux ; la parité tient dans 0–5 avec des ex æquo à chaque tirage,
    qu'une marche continue ne produit jamais. Le remaniement garde exactement les
    bornes, les paliers et les ex æquo de la courbe regardée.

    Le taux dépend donc de la variable, et il est mesuré pour chacune de celles
    qui ont été balayées. Les courbes indexées par boule sont regroupées sous
    leur variable : sous remaniement les cinquante boules ne se distinguent que
    par leur fréquence observée, et un taux par boule coûterait cinquante fois
    plus pour un écart que l'intervalle de Wilson ne trancherait pas.

    `max_windows` répartit un budget de fenêtres entre les variables plutôt que
    de multiplier `trials` par leur nombre : recalculer une série par remaniement
    coûte, et douze variables à deux cents remaniements tiennent une route HTTP
    plusieurs secondes. Le nombre de remaniements réellement fait est renvoyé
    avec chaque taux, ainsi que son intervalle de Wilson — un budget réparti
    élargit l'intervalle, il ne doit pas le cacher.

    Les confiances sont retenues toutes, et le comptage se fait à la relecture :
    un échantillon sert alors à n'importe quel seuil, et surtout à l'inversion.
    Chaque variable dit donc aussi le seuil qu'il faudrait pour que le hasard n'y
    produise plus qu'une part `target` de fenêtres porteuses — ou qu'aucun seuil
    lisible n'y parvient, ce qui est un résultat.
    """
    pool = list(draws)[-(length + SIMULATED_CONTEXT) :]
    # Dédoublonnage par variable en gardant le premier indice rencontré : l'ordre
    # d'arrivée vient du catalogue, donc il est stable d'un rapport à l'autre.
    wanted: dict[str, int | None] = {}
    for name, n in variables:
        wanted.setdefault(name, n)
    if len(pool) < max(2, length) or not wanted:
        return {
            "trials": 0,
            "length": length,
            "min_confidence": min_confidence,
            "target": target,
            "windows_with_any_figure": None,
            "figures": [],
            "by_variable": [],
            "note": (
                "Pas assez de tirages pour simuler une fenêtre de "
                f"{length} : taux de base non mesuré."
            ),
        }
    # Part du budget, avec un plancher pour que le taux garde un sens, mais jamais
    # plus que demandé : un appelant qui veut dix remaniements en veut dix.
    per_run = min(trials, max(40, max_windows // len(wanted)))
    counts: dict[str, int] = {}
    per_variable: list[dict[str, Any]] = []
    carrying = 0
    windows = 0
    for name, n in wanted.items():
        # Une graine par variable, dérivée de la graine du rapport : deux
        # variables ne doivent pas partager la même suite de remaniements, et le
        # rapport doit rester reproductible.
        rng = random.Random(f"{seed}:{name}")
        # Toutes les confiances, seuil zéro : le seuil s'applique à la relecture,
        # ce qui permet de compter à n'importe lequel et de l'inverser.
        #
        # `max_overlap=1.0` désactive le dédoublonnage, et il le faut pour que la
        # relecture compte juste. `dedupe` classe une cassure confirmée devant une
        # figure plus confiante de même nom : à seuil zéro, une cassure peu
        # confiante évince donc une figure que le seuil aurait gardée, et le taux
        # relu serait plus bas que le taux mesuré au seuil. Sans dédoublonnage,
        # une figure est présente au seuil `b` exactement quand sa meilleure
        # confiance atteint `b`, ce qui rend la relecture exacte.
        per_window: list[dict[str, float]] = []
        for _ in range(per_run):
            values = [
                float(v) for v in series(shuffled_draws(pool, rng), name, n)["values"][-length:]
            ]
            best: dict[str, float] = {}
            for hit in detect_figures(
                values,
                activity=activity_from_close(values),
                min_confidence=0.0,
                max_overlap=1.0,
            ):
                figure = str(hit["figure"])
                confidence = float(hit["confidence"])
                if confidence > best.get(figure, -1.0):
                    best[figure] = confidence
            per_window.append(best)
        local = 0
        for window in per_window:
            windows += 1
            above = {
                figure
                for figure, confidence in window.items()
                if confidence >= min_confidence
            }
            if above:
                carrying += 1
                local += 1
            for figure in above:
                counts[figure] = counts.get(figure, 0) + 1
        _, lo, hi = wilson_interval(local, per_run)
        inverted = threshold_for_base_rate(per_window, target=target)
        per_variable.append(
            {
                "variable": name,
                "n": n,
                "label": curve_label(name, n),
                "trials": per_run,
                "windows_with_any_figure": round(local / per_run, 4),
                "interval": [round(lo, 4), round(hi, 4)],
                # Le seuil qu'il faudrait pour lire cette courbe à la rareté
                # visée, `None` quand elle est hors d'atteinte.
                "threshold_for_target": inverted["threshold"],
                "required_for_target": inverted["required"],
            }
        )
    per_variable.sort(key=lambda row: -row["windows_with_any_figure"])
    rows = [
        {
            "figure": figure,
            "label": label_of(figure),
            "count": count,
            "base_rate": round(count / windows, 4),
        }
        for figure, count in sorted(counts.items(), key=lambda kv: -kv[1])
    ]
    note = (
        "Taux de base sur les mêmes tirages remis dans un ordre quelconque : "
        "une figure fréquente ici n'apprend rien quand on la voit sur une vraie "
        "courbe. Le bruit garde les bornes et les paliers de chaque courbe, ce "
        "qu'une marche gaussienne ignorait. Il teste que l'ordre des tirages "
        "porte une forme, pas que les tirages soient équiprobables."
    )
    if len(per_variable) > 1:
        loud, quiet = per_variable[0], per_variable[-1]
        note += (
            f" Le bruit ne se répartit pas également : {loud['label']} porte une "
            f"figure sur {round(loud['windows_with_any_figure'] * 100)} % des "
            f"fenêtres de bruit, {quiet['label']} sur "
            f"{round(quiet['windows_with_any_figure'] * 100)} %. Un même seuil de "
            "confiance n'y dit donc pas la même chose, et le taux moyen ci-dessus "
            "n'est qu'un résumé."
        )
        unreachable = [row for row in per_variable if row["threshold_for_target"] is None]
        note += (
            f" Pour n'en garder qu'une sur {round(1 / target) if target else 1}, il "
            f"faudrait un seuil de {loud['required_for_target']:.2f} sur "
            f"{loud['label']} et {quiet['required_for_target']:.2f} sur "
            f"{quiet['label']}"
        )
        note += (
            f" ; {len(unreachable)} variable(s) sur {len(per_variable)} n'y arrivent "
            f"à aucun seuil lisible, le chartisme n'y a rien à dire."
            if unreachable
            else ", ce qu'un seuil unique ne peut pas faire."
        )
    _, lo, hi = wilson_interval(carrying, windows)
    return {
        "trials": per_run,
        "length": length,
        "min_confidence": min_confidence,
        "target": target,
        "variables": len(per_variable),
        "windows": windows,
        "windows_with_any_figure": round(carrying / windows, 4),
        "interval": [round(lo, 4), round(hi, 4)],
        "figures": rows,
        "by_variable": per_variable,
        "note": note,
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
    base_length: int = DEFAULT_BASE_LENGTH,
    min_confidence: float = 0.6,
    numbers: bool = True,
    seed: int = 0,
) -> dict[str, Any]:
    """Les deux questions, plus le taux de base, en un seul rapport.

    `base_length` suit l'échelle réellement balayée. Un taux de base mesuré sur
    60 tirages ne dit rien d'une lecture faite à l'échelle 20 : la confiance est
    escomptée selon la part de fenêtre couverte, donc la même figure y passe
    plus facilement le seuil. Comparer les deux serait se rassurer à bon compte.

    Le taux de base est mesuré sur les variables des courbes réellement balayées,
    et pas sur une variable de convention : le bruit est tiré des tirages, donc
    il dépend des bornes et des paliers de chaque courbe. Sans `draws` il n'y a
    rien à remanier, et il n'est pas mesuré du tout — mieux vaut un rapport qui
    se taise qu'un rapport qui rassure.
    """
    report: dict[str, Any] = {
        "figure_count": len(hits),
        "curve_count": len(curves),
        "targets": target_outcomes(
            curves, hits, horizon=horizon, trials=trials, seed=seed
        ),
        "base_rates": figure_base_rate(
            draws=draws or [],
            variables=[
                (str(curve.get("variable") or ""), curve.get("n"))
                for curve in curves.values()
                if curve.get("variable")
            ]
            or (("sum", None),),
            length=base_length,
            trials=base_rate_trials,
            min_confidence=min_confidence,
            seed=seed,
        ),
        "disclaimer": (
            "Les tirages sont indépendants. Une figure est une propriété du "
            "tracé, pas une prédiction. Ce rapport mesure l'écart entre les "
            "deux ; il ne le comble pas."
        ),
    }
    if draws and numbers:
        source = list(firings if firings is not None else hits)
        report["numbers"] = number_signal(draws, source, follow=follow)
        report["stars"] = number_signal(draws, source, follow=follow, stars=True)
    return report
