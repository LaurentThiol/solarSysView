"""Rétro-test : le modèle nul, la correction BH, le taux de base.

Ces tests défendent surtout l'honnêteté du rapport. Un rétro-test qui se
trompe en sa faveur est pire qu'aucun rétro-test, donc on vérifie que le
modèle nul applique bien *la même* mesure, que la correction de Benjamini-
Hochberg est réellement appliquée, et qu'un verdict nul reste un verdict nul.
"""

import math
from random import Random
from typing import Any

from synchro.analysis.tech import activity_from_close
from synchro.analysis.variables import series
from synchro.chartisme.backtest import (
    BALL_COUNT,
    STAR_COUNT,
    _binomial_two_sided,
    best_per_window,
    figure_base_rate,
    following_draws,
    null_target_rate,
    number_signal,
    run,
    shuffled_draws,
    target_outcomes,
    threshold_for_base_rate,
    threshold_for_figure,
)
from synchro.chartisme.figures import detect_figures


def _draw(index: int, *, numbers: list[int] | None = None) -> dict[str, Any]:
    rng = Random(index)
    return {
        "draw_date": f"2024-{1 + index // 28:02d}-{1 + index % 28:02d}",
        "weekday": "mardi" if index % 2 else "vendredi",
        "numbers": sorted(numbers or rng.sample(range(1, 51), 5)),
        "stars": sorted(rng.sample(range(1, 13), 2)),
        "star_pool": 12,
    }


DRAWS = [_draw(i) for i in range(120)]


def _walk(length: int, rng: Random, *, step: float = 1.0) -> list[float]:
    """Courbe synthétique pour éprouver les modèles nuls d'objectif.

    Une marche gaussienne ne sert plus de bruit au taux de base — elle est non
    bornée là où les vraies courbes ne le sont pas — mais elle reste une courbe
    quelconque commode pour vérifier que `null_target_rate` réagit à la distance.
    """
    values = [100.0]
    for _ in range(length - 1):
        values.append(values[-1] + rng.gauss(0.0, step))
    return values


def test_null_target_rate_declines_an_impossible_measure() -> None:
    """Sans distance d'objectif il n'y a rien à mesurer : on renvoie « rien »."""
    values = _walk(80, Random(0))
    assert null_target_rate(values, distance=0.0, down=True)["rate"] is None
    assert null_target_rate([1.0, 2.0], distance=5.0, down=True)["trials"] == 0


def test_null_target_rate_is_deterministic_per_seed() -> None:
    """Le rapport doit être reproductible, sinon le verdict n'est pas citable."""
    values = _walk(200, Random(1))
    left = null_target_rate(values, distance=3.0, down=True, trials=120, seed=7)
    right = null_target_rate(values, distance=3.0, down=True, trials=120, seed=7)
    assert left == right
    other = null_target_rate(values, distance=3.0, down=True, trials=120, seed=8)
    assert other["reached"] != left["reached"] or other["settled"] != left["settled"]


def test_null_target_rate_gets_easier_as_the_objective_shrinks() -> None:
    """Un objectif proche est atteint plus souvent — sinon la mesure est fausse.

    C'est le contrôle de cohérence du modèle nul : il doit réagir à la
    distance comme une vraie cassure, pas comme un tirage au sort.
    """
    values = _walk(400, Random(3), step=1.0)
    near = null_target_rate(values, distance=0.5, down=True, trials=400, seed=0)
    far = null_target_rate(values, distance=12.0, down=True, trials=400, seed=0)
    assert near["rate"] is not None and far["rate"] is not None
    assert near["rate"] > far["rate"]


def test_null_target_rate_counts_only_settled_trials() -> None:
    values = _walk(300, Random(5))
    null = null_target_rate(values, distance=4.0, down=True, trials=200, seed=2)
    assert null["trials"] == 200
    assert null["reached"] <= null["settled"] <= null["trials"]
    if null["settled"]:
        assert null["rate"] == round(null["reached"] / null["settled"], 4)


def test_target_outcomes_compares_each_figure_to_its_own_curve() -> None:
    from synchro.chartisme.export import build_curve
    from synchro.chartisme.scan import scan_curve

    curve = build_curve(DRAWS, "sum", None)
    hits = scan_curve(curve, min_confidence=0.0)
    report = target_outcomes({curve["id"]: curve}, hits, trials=80)
    assert report["figures"]
    for row in report["figures"]:
        assert row["settled"] == row["reached"] + row["invalidated"]
        if row["hit_rate"] is not None:
            low, high = row["wilson"]
            assert low <= row["hit_rate"] <= high
        if row["edge"] is not None:
            assert math.isclose(
                row["edge"], row["hit_rate"] - row["null_rate"], abs_tol=1e-9
            )
    # Le classement met en tête ce qui est le mieux mesuré.
    settled = [row["settled"] for row in report["figures"]]
    assert settled == sorted(settled, reverse=True)


def test_target_outcomes_ignores_figures_without_a_breakout() -> None:
    """Sans cassure il n'y a pas d'objectif, donc rien à rétro-tester."""
    curve = {"id": "x", "variable": "sum", "values": [float(v) for v in range(60)]}
    pending = {"curve_id": "x", "figure": "ete", "breakout": None, "target": None}
    report = target_outcomes({"x": curve}, [pending])
    assert report["figures"] == []
    assert report["verdict"]["measured"] == 0


def test_target_verdict_says_no_when_nothing_beats_the_null() -> None:
    """Le résultat attendu sur des courbes de tirages, écrit noir sur blanc."""
    curve = {"id": "x", "variable": "sum", "values": [float(v) for v in range(60)]}
    report = target_outcomes({"x": curve}, [])
    assert report["verdict"]["any_edge"] is False
    assert report["verdict"]["beat_null"] == []
    assert "hasard" in report["verdict"]["note"]


def test_following_draws_is_strictly_posterior() -> None:
    ordered = sorted(DRAWS, key=lambda d: d["draw_date"])
    pivot = ordered[10]["draw_date"]
    later = following_draws(ordered, pivot, count=5)
    assert len(later) == 5
    assert all(d["draw_date"] > pivot for d in later)
    assert later[0]["draw_date"] == ordered[11]["draw_date"]
    # La queue de l'archive ne doit pas lever.
    assert len(following_draws(ordered, ordered[-1]["draw_date"], count=5)) == 0
    assert following_draws(ordered, None) == []
    assert following_draws(ordered, "pas une date") == []


def test_number_signal_on_a_uniform_archive_finds_nothing() -> None:
    """Sur une archive sans structure, aucune boule ne doit être retenue.

    Le test qui compte : la correction BH doit absorber les faux positifs que
    cinquante tests simultanés produisent mécaniquement.
    """
    firings = [{"figure_date": d["draw_date"]} for d in DRAWS[:40]]
    report = number_signal(DRAWS, firings, follow=5)
    assert report["draws"] > 0
    assert report["chi2_df"] == BALL_COUNT - 1
    assert report["flagged"] == []
    assert report["chi2_p"] > 0.01
    assert "indépendants" in report["verdict"]
    assert math.isclose(
        report["expected_per_ball"], report["draws"] * 5 / BALL_COUNT, abs_tol=5e-3
    )
    for row in report["balls"]:
        low, high = row["wilson"]
        assert low <= row["rate"] <= high
        assert 0.0 <= row["p"] <= 1.0
    counts = [row["count"] for row in report["balls"]]
    assert counts == sorted(counts, reverse=True)


def test_number_signal_catches_a_planted_signal() -> None:
    """Contrôle positif : un biais grossier doit ressortir, sinon le test est aveugle.

    Les quarante-cinq boules jamais tirées sont retenues elles aussi, et c'est
    correct : une absence systématique s'écarte de l'uniforme autant qu'une
    présence systématique.
    """
    rigged = [_draw(i, numbers=[7, 8, 9, 10, 11]) for i in range(120)]
    firings = [{"figure_date": d["draw_date"]} for d in rigged[:40]]
    report = number_signal(rigged, firings, follow=5)
    assert set(report["flagged"]) >= {7, 8, 9, 10, 11}
    assert [row["value"] for row in report["balls"][:5]] == [7, 8, 9, 10, 11]
    assert report["balls"][0]["rate"] == 1.0
    assert report["chi2_p"] < 0.01
    assert "BH" in report["verdict"]


def test_number_signal_counts_each_posterior_draw_once() -> None:
    """Les fenêtres de suivi se chevauchent : sans déduplication, l'effectif mentirait.

    Quarante déclenchements consécutifs suivis sur cinq tirages produisent
    deux cents observations pour quarante-quatre tirages réels. Compter les
    doublons quintuple l'effectif sans apporter une observation, et le
    binomial transforme cette répétition en « découvertes ».
    """
    firings = [{"figure_date": d["draw_date"]} for d in DRAWS[:40]]
    report = number_signal(DRAWS, firings, follow=5)
    assert report["firings"] == 40
    assert report["draws"] == 44
    # Répéter le même déclenchement ne change rien au verdict.
    doubled = number_signal(DRAWS, firings * 3, follow=5)
    assert doubled["draws"] == report["draws"]
    assert doubled["chi2"] == report["chi2"]
    assert doubled["flagged"] == report["flagged"]


def test_number_signal_reads_the_date_from_the_snapshot() -> None:
    """Un déclenchement venu du journal n'a pas toujours `figure_date` en clair."""
    firings = [{"snapshot": {"to": d["draw_date"]}} for d in DRAWS[:20]]
    assert number_signal(DRAWS, firings, follow=3)["draws"] > 0


def test_number_signal_reads_a_raw_figure() -> None:
    """`run` sans journal mesure les figures elles-mêmes : leur date est `to`."""
    hits = [{"to": d["draw_date"], "figure": "ete"} for d in DRAWS[:20]]
    assert number_signal(DRAWS, hits, follow=3)["draws"] > 0


def test_number_signal_without_posterior_draws_says_so() -> None:
    report = number_signal(DRAWS, [])
    assert report["draws"] == 0
    assert report["chi2"] is None
    assert report["balls"] == []
    assert "aucun tirage" in report["verdict"]


def test_number_signal_handles_the_stars_pool() -> None:
    firings = [{"figure_date": d["draw_date"]} for d in DRAWS[:40]]
    report = number_signal(DRAWS, firings, follow=5, stars=True)
    assert report["chi2_df"] == STAR_COUNT - 1
    assert len(report["balls"]) == STAR_COUNT
    assert math.isclose(
        report["expected_per_ball"], report["draws"] * 2 / STAR_COUNT, abs_tol=5e-3
    )


def test_binomial_two_sided_matches_known_values() -> None:
    """Un test exact : on vérifie contre des valeurs calculables à la main."""
    assert _binomial_two_sided(0, 0, 0.1) == 1.0
    # Toute la masse est ≤ la pmf du mode quand p = 1/2 et n = 1.
    assert math.isclose(_binomial_two_sided(0, 1, 0.5), 1.0, abs_tol=1e-12)
    # 10 succès sur 10 avec p = 1/2 : 2 × (1/2)^10.
    assert math.isclose(_binomial_two_sided(10, 10, 0.5), 2 / 1024, rel_tol=1e-9)
    assert math.isclose(_binomial_two_sided(0, 10, 0.5), 2 / 1024, rel_tol=1e-9)
    # Le cas dégénéré p = 0 ne doit pas lever.
    assert _binomial_two_sided(0, 5, 0.0) <= 1.0


def test_binomial_two_sided_stays_a_probability() -> None:
    for successes in range(0, 21):
        p = _binomial_two_sided(successes, 20, 0.1)
        assert 0.0 <= p <= 1.0
    # Le mode est le moins surprenant : sa p-valeur est la plus grande.
    modal = _binomial_two_sided(2, 20, 0.1)
    assert modal > _binomial_two_sided(10, 20, 0.1)


def test_shuffled_draws_keeps_the_draws_and_the_calendar() -> None:
    """Un remaniement change l'ordre, pas les tirages ni les dates.

    Les dates doivent être réattribuées dans l'ordre croissant : `series` retrie
    ses tirages par date, donc un mélange qui garderait les dates d'origine
    serait défait aussitôt.
    """
    shuffled = shuffled_draws(DRAWS, Random(0))
    assert len(shuffled) == len(DRAWS)
    assert [str(d["draw_date"]) for d in shuffled] == sorted(
        str(d["draw_date"]) for d in DRAWS
    )
    assert sorted(tuple(d["numbers"]) for d in shuffled) == sorted(
        tuple(d["numbers"]) for d in DRAWS
    )
    assert [d["numbers"] for d in shuffled] != [d["numbers"] for d in DRAWS]


def test_figure_base_rate_is_the_uncomfortable_measure() -> None:
    """Une figure fréquente sur du bruit n'apprend rien sur une vraie courbe.

    Le chiffre est élevé et c'est le point : il doit apparaître dans le
    rapport plutôt que rester implicite.
    """
    report = figure_base_rate(
        draws=DRAWS, variables=(("sum", None),), length=60, trials=60, min_confidence=0.6, seed=0
    )
    assert report["trials"] == 60
    assert 0.0 <= report["windows_with_any_figure"] <= 1.0
    assert report["windows_with_any_figure"] > 0.4
    assert report["figures"]
    rates = [row["base_rate"] for row in report["figures"]]
    assert rates == sorted(rates, reverse=True)
    for row in report["figures"]:
        assert 0.0 <= row["base_rate"] <= 1.0
        assert row["label"]
    assert "n'apprend rien" in report["note"]


def test_figure_base_rate_needs_draws_to_shuffle() -> None:
    """Sans tirages il n'y a pas de bruit à fabriquer : le rapport se taise."""
    empty = figure_base_rate(draws=[], variables=(("sum", None),), length=60)
    assert empty["trials"] == 0
    assert empty["windows_with_any_figure"] is None
    assert empty["figures"] == []
    assert "non mesuré" in empty["note"]


def test_figure_base_rate_falls_when_the_bar_rises() -> None:
    low = figure_base_rate(draws=DRAWS, length=60, trials=60, min_confidence=0.5, seed=1)
    high = figure_base_rate(draws=DRAWS, length=60, trials=60, min_confidence=0.95, seed=1)
    assert high["windows_with_any_figure"] <= low["windows_with_any_figure"]


def test_figure_base_rate_grows_with_the_length() -> None:
    """Une fenêtre longue offre plus de pivots, donc plus d'occasions d'ajuster.

    C'est pourquoi le taux de base doit suivre l'échelle balayée : le comparer
    à celui de 60 tirages quand on lit à l'échelle 20 fausse la lecture des deux
    côtés — une figure courte est moins banale qu'une longue, et sa confiance
    est pourtant plus haute.
    """
    short = figure_base_rate(draws=DRAWS, length=20, trials=150, min_confidence=0.6, seed=2)
    long = figure_base_rate(draws=DRAWS, length=120, trials=150, min_confidence=0.6, seed=2)
    assert short["length"] == 20
    assert short["windows_with_any_figure"] < long["windows_with_any_figure"]


def test_figure_base_rate_is_louder_on_a_bounded_curve() -> None:
    """Le point de la mesure : une courbe par paliers est bien plus bruitée.

    « Paires consécutives » ne prend que quelques valeurs entières et produit des
    ex æquo à chaque tirage, donc des sommets et des creux plats à profusion. Une
    marche gaussienne n'en produit jamais et sous-estimait ce bruit — c'est
    précisément ce que le remaniement corrige. L'écart doit être franc, sans quoi
    la correction ne servirait à rien.
    """
    report = figure_base_rate(
        draws=DRAWS,
        variables=(("consecutive", None), ("sum", None)),
        length=60,
        trials=80,
        min_confidence=0.6,
        seed=0,
    )
    rates = {row["variable"]: row["windows_with_any_figure"] for row in report["by_variable"]}
    assert rates["consecutive"] > rates["sum"]
    # Le classement guide la lecture : le plus bruité d'abord.
    ordered = [row["windows_with_any_figure"] for row in report["by_variable"]]
    assert ordered == sorted(ordered, reverse=True)
    assert report["variables"] == 2
    assert "n'y dit donc pas la même chose" in report["note"]


def test_figure_base_rate_shares_a_window_budget() -> None:
    """Une série par remaniement coûte : le budget se partage, il ne se multiplie pas."""
    many = [(name, None) for name in ("sum", "spread", "parity", "high_low", "consecutive")]
    report = figure_base_rate(
        draws=DRAWS, variables=many, length=60, trials=200, max_windows=200, seed=0
    )
    assert report["windows"] <= 200 + len(many)
    assert report["trials"] == 40  # plancher : en dessous le taux ne dirait rien
    # Un appelant qui demande peu de remaniements en obtient peu, pas le plancher.
    frugal = figure_base_rate(draws=DRAWS, variables=many, length=60, trials=10, seed=0)
    assert frugal["trials"] == 10


def _windows(bests: list[float]) -> list[dict[str, float]]:
    """Un échantillon de bruit réduit à ce que l'inversion lit : la meilleure par fenêtre."""
    return [{} if best <= 0 else {"double_top": best} for best in bests]


def test_threshold_for_base_rate_finds_the_bar_that_holds_the_target() -> None:
    """L'inversion doit tenir la cible, pas s'en approcher par le dessus.

    Dix fenêtres, une cible de 20 % : deux fenêtres porteuses sont tolérées, donc
    le seuil doit dépasser la troisième meilleure confiance (0.80) et pas la
    deuxième — sans quoi trois fenêtres passeraient.
    """
    sample = _windows([0.95, 0.90, 0.80, 0.70, 0.60, 0.50, 0.40, 0.30, 0.20, 0.10])
    found = threshold_for_base_rate(sample, target=0.2)
    assert found["threshold"] == 0.81
    assert found["achieved"] == 0.2
    assert found["trials"] == 10


def test_threshold_for_base_rate_truncates_the_tolerance() -> None:
    """Viser 20 % sur 9 fenêtres autorise 1 fenêtre, pas 1,8.

    Arrondir au plus proche laisserait passer deux fenêtres sur neuf, soit 22 % —
    au-dessus de la cible. La mesure doit se tromper du côté sévère.
    """
    sample = _windows([0.95, 0.90, 0.80, 0.70, 0.60, 0.50, 0.40, 0.30, 0.20])
    found = threshold_for_base_rate(sample, target=0.2)
    assert found["threshold"] == 0.91
    assert found["achieved"] <= 0.2


def test_threshold_for_base_rate_declines_when_the_target_is_out_of_reach() -> None:
    """Sur une courbe trop bruitée, aucun seuil lisible ne tient la cible.

    Au-delà de 0.95 un seuil ne sépare plus le bruit de la figure : il rejette
    les deux. Le dire vaut mieux que rendre un seuil qui vide le tracé en
    laissant croire qu'on a réglé quelque chose.
    """
    found = threshold_for_base_rate(_windows([0.99] * 10), target=0.2)
    assert found["threshold"] is None
    assert found["required"] == 1.0


def test_threshold_for_base_rate_lets_everything_through_at_full_target() -> None:
    """Tolérer toutes les fenêtres ne demande aucun seuil."""
    found = threshold_for_base_rate(_windows([0.5, 0.4]), target=1.0)
    assert found["threshold"] == 0.0
    assert threshold_for_base_rate([], target=0.2)["threshold"] is None


def test_threshold_for_figure_does_not_inherit_the_loudest_pattern() -> None:
    """Un double creux rare ne doit pas être jugé au seuil des rectangles banals.

    C'est le bug de l'onglet vide : le seuil d'ensemble, dicté par le motif le
    plus bruyant, enterrait les lectures distinctives en même temps que le bruit.
    """
    per = []
    for index in range(10):
        row = {"rectangle": 0.9}
        if index < 2:
            row["double_bottom"] = 0.4
        per.append(row)
    any_bar = threshold_for_base_rate(per, target=0.2)
    double = threshold_for_figure(per, "double_bottom", target=0.2)
    rect = threshold_for_figure(per, "rectangle", target=0.2)
    assert any_bar["threshold"] is not None
    assert double["threshold"] is not None
    assert rect["threshold"] is not None
    assert double["threshold"] < any_bar["threshold"]
    assert double["threshold"] < rect["threshold"]
    # Un 0.40 est rare pour le double creux, banal pour le rectangle.
    assert 0.4 >= double["threshold"]
    assert 0.4 < rect["threshold"]


def test_threshold_for_figure_on_an_absent_pattern_is_permissive() -> None:
    """Le hasard n'a pas produit ce motif : n'importe quelle occurrence est distinctive."""
    per = [{"rectangle": 0.8} for _ in range(10)]
    found = threshold_for_figure(per, "ete", target=0.2)
    assert found["threshold"] == 0.01
    assert found["figure"] == "ete"


def test_threshold_for_base_rate_is_monotone_in_the_target() -> None:
    """Viser plus rare durcit le seuil : c'est ce qui rend le curseur lisible."""
    sample = _windows([i / 100 for i in range(99, 0, -1)])
    bars = [threshold_for_base_rate(sample, target=t)["required"] for t in (0.5, 0.3, 0.1, 0.05)]
    assert bars == sorted(bars)


def test_figure_base_rate_says_the_bar_each_curve_would_need() -> None:
    """Le rapport dit l'inverse du taux, courbe par courbe.

    C'est ce qui rend un seuil comparable : sur « paires consécutives » il faut
    monter beaucoup plus haut que sur la somme pour atteindre la même rareté, et
    parfois plus haut qu'un seuil ne peut aller.
    """
    report = figure_base_rate(
        draws=DRAWS,
        variables=(("consecutive", None), ("sum", None)),
        length=60,
        trials=60,
        target=0.2,
        seed=0,
    )
    rows = {row["variable"]: row for row in report["by_variable"]}
    assert report["target"] == 0.2
    assert rows["consecutive"]["required_for_target"] > rows["sum"]["required_for_target"]
    assert rows["sum"]["threshold_for_target"] == rows["sum"]["required_for_target"]
    assert "il faudrait un seuil" in report["note"]


def test_figure_base_rate_counts_the_same_at_a_given_bar() -> None:
    """Échantillonner sans seuil puis relire doit compter comme compter au seuil.

    L'échantillon est pris à seuil zéro pour servir à n'importe quel seuil ; si la
    relecture ne redonnait pas le même taux, le gain se paierait d'un biais.
    """
    for bar in (0.5, 0.6, 0.8):
        report = figure_base_rate(
            draws=DRAWS, variables=(("sum", None),), length=60, trials=40, min_confidence=bar, seed=3
        )
        rng = Random("3:sum")
        pool = DRAWS[-(60 + 200) :]
        carrying = 0
        for _ in range(40):
            values = [
                float(v) for v in series(shuffled_draws(pool, rng), "sum", None)["values"][-60:]
            ]
            if detect_figures(
                values, activity=activity_from_close(values), min_confidence=bar
            ):
                carrying += 1
        assert report["windows_with_any_figure"] == round(carrying / 40, 4)


def test_run_assembles_the_whole_report() -> None:
    from synchro.chartisme.export import build_curve
    from synchro.chartisme.scan import scan_curve

    curve = build_curve(DRAWS, "sum", None)
    curves = {curve["id"]: curve}
    hits = scan_curve(curve, min_confidence=0.0)
    report = run(
        curves,
        hits,
        draws=DRAWS,
        horizon=20,
        follow=3,
        trials=60,
        base_rate_trials=30,
    )
    assert report["figure_count"] == len(hits)
    assert report["curve_count"] == 1
    assert report["targets"]["horizon"] == 20
    assert report["base_rates"]["trials"] == 30
    assert report["base_rates"]["length"] == 60
    assert report["numbers"]["follow"] == 3
    assert report["stars"]["chi2_df"] == STAR_COUNT - 1
    assert "indépendants" in report["disclaimer"]


def test_run_measures_the_base_rate_at_the_scanned_length() -> None:
    """L'onglet balaie parfois des fenêtres de 20 tirages : le nul doit suivre."""
    curve = {"id": "x", "variable": "sum", "values": [float(v) for v in range(60)]}
    report = run({"x": curve}, [], base_rate_trials=10, base_length=20)
    assert report["base_rates"]["length"] == 20


def test_run_without_draws_skips_the_number_question() -> None:
    curve = {"id": "x", "variable": "sum", "values": [float(v) for v in range(60)]}
    report = run({"x": curve}, [], base_rate_trials=10)
    assert "numbers" not in report
    assert "stars" not in report
    assert report["targets"]["figures"] == []
