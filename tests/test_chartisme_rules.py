"""Espace de règles : normalisation, correspondance, journal.

Le point à protéger ici n'est pas la mécanique mais la promesse : une règle
est **descriptive**. Les cinq actions écrivent dans le journal et nulle part
ailleurs, et un test le vérifie explicitement plus bas.
"""

from typing import Any

from synchro.chartisme.rules import (
    ACTION_TYPES,
    BREAKOUT_STATES,
    describe,
    describe_actions,
    describe_condition,
    draft_rule_from_hit,
    evaluate_all,
    evaluate_rules,
    match_condition,
    normalize_actions,
    normalize_condition,
    normalize_rule,
    state_from_hit,
    summarize_firings,
)


def _hit(**over: Any) -> dict[str, Any]:
    hit: dict[str, Any] = {
        "figure": "ete",
        "label": "tête & épaules",
        "kind": "reversal_down",
        "signal": "cassure de la ligne de cou",
        "confidence": 0.82,
        "curve_id": "delay:7",
        "variable": "delay",
        "from": "2024-01-05",
        "to": "2024-03-11",
        "from_index": 10,
        "to_index": 60,
        "detector": "geometric",
        "breakout": {
            "index": 55,
            "date": "2024-03-01",
            "level": 12.0,
            "direction": "down",
            "confirmed": True,
            "activity_ratio": 1.7,
        },
        "target": {"value": 4.0, "basis": "distance tête ↔ cou"},
    }
    hit.update(over)
    return hit


def test_normalize_condition_fills_every_field() -> None:
    """Une condition partielle doit rester interrogeable sans `KeyError`."""
    cond = normalize_condition({"figures": ["ete"]})
    assert set(cond) == {
        "figures",
        "any_figures",
        "kinds",
        "curves",
        "variables",
        "min_confidence",
        "breakout",
        "direction",
        "trend",
        "weekday",
        "min_activity_ratio",
    }
    assert cond["figures"] == ["ete"]
    assert cond["breakout"] == "any"
    assert cond["min_confidence"] is None
    assert normalize_condition(None)["figures"] == []


def test_normalize_condition_drops_unknown_figures() -> None:
    """Une figure inventée filtrerait tout en silence : on la retire."""
    cond = normalize_condition({"figures": ["ete", "licorne", "", "ete"]})
    assert cond["figures"] == ["ete"]


def test_normalize_condition_repairs_bad_scalars() -> None:
    cond = normalize_condition(
        {
            "min_confidence": "pas un nombre",
            "min_activity_ratio": "1.5",
            "breakout": "CONFIRMED",
            "direction": "latéral",
            "weekday": "  Mardi ",
        }
    )
    assert cond["min_confidence"] is None
    assert cond["min_activity_ratio"] == 1.5
    assert cond["breakout"] == "confirmed"
    assert cond["direction"] == "any"
    assert cond["weekday"] == "mardi"


def test_normalize_actions_never_leaves_a_rule_silent() -> None:
    """Sans action, la règle se déclencherait sans rien consigner."""
    assert normalize_actions(None) == [{"type": "note", "payload": {}}]
    assert normalize_actions([{"type": "acheter"}]) == [{"type": "note", "payload": {}}]
    kept = normalize_actions([{"type": "alert", "payload": {"why": "x"}}])
    assert kept == [{"type": "alert", "payload": {"why": "x"}}]


def test_every_action_is_a_journal_write() -> None:
    """La garantie du module : aucune action ne touche aux grilles."""
    assert set(ACTION_TYPES) == {"tag", "alert", "note", "hypothesize", "watch"}


def test_normalize_rule_gives_an_id_and_a_name() -> None:
    rule = normalize_rule({})
    assert rule["id"]
    assert rule["name"] == "Règle"
    assert rule["active"] is True
    assert normalize_rule({"name": "   "})["name"] == "Règle"
    assert normalize_rule({"id": "abc"})["id"] == "abc"
    assert normalize_rule({"active": False})["active"] is False


def test_state_from_hit_reads_the_breakout_state() -> None:
    confirmed = state_from_hit(_hit())
    assert confirmed["breakout_state"] == "confirmed"
    assert confirmed["direction"] == "down"
    assert confirmed["activity_ratio"] == 1.7

    fake = _hit()
    fake["breakout"] = dict(fake["breakout"], confirmed=False)
    assert state_from_hit(fake)["breakout_state"] == "fake"

    pending = _hit(breakout=None)
    assert state_from_hit(pending)["breakout_state"] == "pending"
    assert pending["figure"] == "ete"


def test_state_from_hit_borrows_the_curve_label() -> None:
    curve = {"id": "delay:7", "variable": "delay", "label": "retard · boule 7"}
    state = state_from_hit(_hit(), curve=curve, trend="down", weekday="vendredi")
    assert state["curve_label"] == "retard · boule 7"
    assert state["trend"] == "down"
    assert state["weekday"] == "vendredi"
    # Sans tendance fournie, le champ reste neutre plutôt qu'absent.
    assert state_from_hit(_hit())["trend"] == "any"


def test_match_condition_on_an_empty_condition_accepts_everything() -> None:
    assert match_condition({}, state_from_hit(_hit()))


def test_match_condition_filters_on_each_field() -> None:
    state = state_from_hit(_hit(), trend="down", weekday="mardi")
    assert match_condition({"figures": ["ete"]}, state)
    assert not match_condition({"figures": ["double_top"]}, state)
    assert match_condition({"any_figures": ["ete", "diamond"]}, state)
    assert not match_condition({"any_figures": ["diamond"]}, state)
    assert match_condition({"kinds": ["reversal_down"]}, state)
    assert not match_condition({"kinds": ["continuation"]}, state)
    assert match_condition({"curves": ["delay:7"]}, state)
    assert not match_condition({"curves": ["sum"]}, state)
    assert match_condition({"variables": ["delay"]}, state)
    assert not match_condition({"variables": ["sum"]}, state)
    assert match_condition({"min_confidence": 0.8}, state)
    assert not match_condition({"min_confidence": 0.9}, state)
    assert match_condition({"breakout": "confirmed"}, state)
    assert not match_condition({"breakout": "fake"}, state)
    assert match_condition({"direction": "down"}, state)
    assert not match_condition({"direction": "up"}, state)
    assert match_condition({"trend": "down"}, state)
    assert not match_condition({"trend": "range"}, state)
    assert match_condition({"weekday": "mardi"}, state)
    assert not match_condition({"weekday": "vendredi"}, state)
    assert match_condition({"min_activity_ratio": 1.5}, state)
    assert not match_condition({"min_activity_ratio": 2.0}, state)


def test_match_condition_requires_every_named_figure() -> None:
    """`figures` est une conjonction : deux figures citées ne matchent jamais.

    Une fenêtre porte une figure à la fois côté règle ; c'est `any_figures`
    qui sert à en accepter plusieurs.
    """
    state = state_from_hit(_hit())
    assert not match_condition({"figures": ["ete", "double_top"]}, state)


def test_match_condition_rejects_a_missing_measure() -> None:
    """Un seuil sur une mesure absente doit exclure, pas laisser passer."""
    state = state_from_hit(_hit(confidence=None, breakout=None))
    assert not match_condition({"min_confidence": 0.1}, state)
    assert not match_condition({"min_activity_ratio": 0.1}, state)


def test_evaluate_rules_skips_paused_rules() -> None:
    state = state_from_hit(_hit())
    rules = [
        {"id": "a", "name": "active", "condition": {"figures": ["ete"]}, "active": True},
        {"id": "b", "name": "en pause", "condition": {"figures": ["ete"]}, "active": False},
    ]
    firings = evaluate_rules(rules, state)
    assert [f["rule_id"] for f in firings] == ["a"]
    assert firings[0]["figure"] == "ete"
    assert firings[0]["curve_id"] == "delay:7"
    # La date du déclenchement est la fin de la fenêtre, pas celle du balayage.
    assert firings[0]["figure_date"] == "2024-03-11"
    assert firings[0]["snapshot"]["confidence"] == 0.82


def test_evaluate_all_walks_a_whole_scan() -> None:
    hits = [
        _hit(),
        _hit(figure="double_top", curve_id="sum", variable="sum", kind="reversal_down"),
        _hit(figure="flag", curve_id="sum", variable="sum", kind="continuation"),
    ]
    curves = {"sum": {"id": "sum", "variable": "sum", "label": "somme"}}
    rules = [{"id": "r", "name": "retournements", "condition": {"kinds": ["reversal_down"]}}]
    firings = evaluate_all(rules, hits, curves=curves, trends={"sum": "up"})
    assert len(firings) == 2
    assert {f["figure"] for f in firings} == {"ete", "double_top"}
    on_sum = [f for f in firings if f["curve_id"] == "sum"][0]
    assert on_sum["snapshot"]["curve_label"] == "somme"
    assert on_sum["snapshot"]["trend"] == "up"


def test_draft_rule_from_hit_is_immediately_valid() -> None:
    """Le brouillon d'un clic doit redéclencher sur la figure dont il sort."""
    draft = draft_rule_from_hit(_hit())
    assert draft["condition"]["figures"] == ["ete"]
    assert draft["condition"]["breakout"] == "confirmed"
    assert draft["condition"]["min_confidence"] == 0.72
    assert draft["actions"][0]["type"] == "hypothesize"
    assert draft["actions"][0]["payload"]["expectation"] == "target_reached"
    assert draft["actions"][0]["payload"]["basis"] == "distance tête ↔ cou"
    assert evaluate_rules([draft], state_from_hit(_hit()))


def test_draft_rule_leaves_a_pending_breakout_open() -> None:
    """Une figure en formation ne doit pas figer la règle sur « en formation »."""
    draft = draft_rule_from_hit(_hit(breakout=None, target=None))
    assert draft["condition"]["breakout"] == "any"
    assert evaluate_rules([draft], state_from_hit(_hit(breakout=None)))


def test_draft_rule_floors_the_confidence() -> None:
    low = draft_rule_from_hit(_hit(confidence=0.31))
    assert low["condition"]["min_confidence"] == 0.3
    assert draft_rule_from_hit(_hit(confidence=None))["condition"]["min_confidence"] is None


def test_describe_reads_as_a_sentence() -> None:
    text = describe(
        {
            "name": "ETE confirmée",
            "condition": {
                "figures": ["ete"],
                "min_confidence": 0.7,
                "breakout": "confirmed",
                "direction": "down",
                "trend": "up",
                "weekday": "mardi",
                "min_activity_ratio": 1.2,
            },
            "actions": [{"type": "alert"}, {"type": "watch"}],
        }
    )
    assert text.startswith("QUAND ")
    assert "ALORS " in text
    assert "Tête & épaules" in text
    assert "confiance ≥ 0.70" in text
    assert "cassure confirmée" in text
    assert "baissier" in text
    assert "MM20" in text
    assert "remonter en tête" in text
    assert "surveiller" in text


def test_describe_an_empty_condition_still_says_something() -> None:
    assert describe_condition({}) == "QUAND toute figure"
    assert describe_actions([]) == "ALORS annoter"


def test_breakout_states_are_the_three_readings_plus_any() -> None:
    assert set(BREAKOUT_STATES) == {"any", "confirmed", "fake", "pending"}


def test_summarize_firings_counts_by_rule_figure_and_curve() -> None:
    firings = [
        {"name": "A", "figure": "ete", "curve_id": "sum"},
        {"name": "A", "figure": "ete", "curve_id": "delay:7"},
        {"name": "B", "figure": "flag", "curve_id": "sum"},
    ]
    summary = summarize_firings(firings)
    assert summary["count"] == 3
    assert summary["by_rule"] == {"A": 2, "B": 1}
    assert summary["by_figure"] == {"ete": 2, "flag": 1}
    assert summary["by_curve"]["sum"] == 2
    # Le classement est décroissant : l'UI affiche la tête de liste.
    assert list(summary["by_rule"]) == ["A", "B"]
    assert summarize_firings([])["count"] == 0


def test_summarize_firings_caps_the_curve_list() -> None:
    """Cent trente courbes dans un tableau d'UI ne servent à rien."""
    firings = [{"name": "A", "figure": "ete", "curve_id": f"delay:{i}"} for i in range(50)]
    assert len(summarize_firings(firings)["by_curve"]) == 20
