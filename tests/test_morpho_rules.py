from synchro.morpho.geometry import detect
from synchro.morpho.rules import (
    draft_rule_from_state,
    evaluate_rules,
    match_condition,
    normalize_rule,
    validate_draft,
)


def test_match_and_evaluate() -> None:
    state = detect([1, 2, 3, 4, 5], [1, 2])
    state["date"] = "2026-08-21"
    state["weekday"] = "mardi"
    rule = normalize_rule(
        {
            "name": "ligne haute",
            "condition": {"motifs": ["align_h", "stars_adj"]},
            "actions": [{"type": "hypothesize", "payload": {"motifs": ["align_h"]}}],
        }
    )
    assert match_condition(rule["condition"], state)
    firings = evaluate_rules([rule], state)
    assert len(firings) == 1
    assert firings[0]["name"] == "ligne haute"
    assert firings[0]["actions"][0]["type"] == "hypothesize"

    miss = normalize_rule({"condition": {"motifs": ["w_shape"]}, "actions": [{"type": "tag"}]})
    assert evaluate_rules([miss], state) == []


def test_caption_and_weekday_filters() -> None:
    state = detect([1, 11, 21, 31, 41], [1, 12])
    state["weekday"] = "vendredi"
    state["caption"] = "Alignement vertical ; Dispersion"
    rule = normalize_rule(
        {
            "condition": {
                "motifs": ["align_v"],
                "weekday": "vendredi",
                "caption_contains": "vertical",
            },
            "actions": [{"type": "alert"}],
        }
    )
    assert match_condition(rule["condition"], state)
    rule["condition"]["weekday"] = "mardi"
    assert not match_condition(rule["condition"], state)


def test_draft_uses_lexicon_only() -> None:
    state = detect([1, 12, 23, 34, 45], [3, 4])
    draft = draft_rule_from_state(state)
    assert draft["condition"]["motifs"]
    assert all(m in state["motifs"] for m in draft["condition"]["motifs"])
    checked = validate_draft(
        {"name": "x", "condition": {"motifs": ["align_h", "not_a_motif"]}, "actions": []}
    )
    assert "align_h" in checked["condition"]["motifs"]
    assert "not_a_motif" in checked["rejected_motifs"]
    assert "not_a_motif" not in checked["condition"]["motifs"]
