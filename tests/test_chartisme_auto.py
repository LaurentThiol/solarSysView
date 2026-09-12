"""Cycle autonome : le module se remet à jour tout seul, et sans rien casser.

Le point essentiel n'est pas que le cycle marche, c'est qu'il **échoue sans
conséquence**. Il est accroché à l'arrivée d'un tirage : un balayage qui casse
ne doit jamais empêcher une synchro FDJ d'aboutir.
"""

from random import Random
from typing import Any
from unittest.mock import patch

from synchro.chartisme import auto
from synchro.chartisme.auto import (
    DEFAULT_MIN_CONFIDENCE,
    read_state,
    run_auto_cycle,
    run_cycle,
    status,
    write_state,
)


def _draw(index: int) -> dict[str, Any]:
    rng = Random(index)
    return {
        "draw_date": f"2024-{1 + index // 28:02d}-{1 + index % 28:02d}",
        "weekday": "mardi" if index % 2 else "vendredi",
        "numbers": sorted(rng.sample(range(1, 51), 5)),
        "stars": sorted(rng.sample(range(1, 13), 2)),
        "star_pool": 12,
    }


DRAWS = [_draw(i) for i in range(120)]
RULES = [
    {
        "id": "r1",
        "name": "toute figure",
        "condition": {},
        "actions": [{"type": "watch"}],
        "active": True,
    }
]


def test_state_round_trip(tmp_path) -> None:
    path = tmp_path / "state.json"
    assert read_state(path=path) is None
    write_state({"ran_at": "2026-01-01", "ok": True}, path=path)
    assert read_state(path=path)["ok"] is True
    path.write_text("{ pas du json", encoding="utf-8")
    assert read_state(path=path) is None


def test_run_cycle_chains_export_scan_and_rules(tmp_path, monkeypatch) -> None:
    """Un cycle complet : courbes, figures, règles, état sur disque."""
    monkeypatch.setattr(auto, "STATE_PATH", tmp_path / "state.json")
    from synchro.chartisme import export as E

    monkeypatch.setattr(E, "CURVES_PATH", tmp_path / "curves.json")
    with patch(
        "synchro.chartisme.auto.export_curves",
        side_effect=lambda draws: E.export_curves(draws, only=["sum", "spread"]),
    ):
        result = run_cycle(DRAWS, reason="test", rules=RULES, min_confidence=0.0)
    assert result["ok"] is True
    assert result["reason"] == "test"
    assert result["seconds"] >= 0
    assert result["curves"]["curve_count"] == 2
    assert result["figures"]["count"] == len(result["hits"])
    assert result["firings"]["count"] == len(result["firings_list"])
    # L'état écrit ne porte pas les séries : il est relu à chaque chargement.
    written = read_state(path=tmp_path / "state.json")
    assert written["ok"] is True
    assert "bundle" not in written
    assert "hits" not in written
    assert written["curves"]["curve_count"] == 2


def test_run_cycle_journals_the_firings(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(auto, "STATE_PATH", tmp_path / "state.json")
    from synchro.chartisme import export as E

    monkeypatch.setattr(E, "CURVES_PATH", tmp_path / "curves.json")
    with patch(
        "synchro.chartisme.auto.export_curves",
        side_effect=lambda draws: E.export_curves(draws, only=["sum"]),
    ):
        result = run_cycle(DRAWS, rules=RULES, min_confidence=0.0)
    assert result["firings"]["count"] > 0
    assert result["firings"]["by_rule"]["toute figure"] == result["firings"]["count"]
    assert all(f["rule_id"] == "r1" for f in result["firings_list"])
    # Les issues sont comptées par figure : c'est la matière du rétro-test.
    assert result["outcomes"]
    for row in result["outcomes"].values():
        assert row["settled"] == row["reached"] + row["invalidated"]


def test_run_cycle_without_rules_still_scans(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(auto, "STATE_PATH", tmp_path / "state.json")
    from synchro.chartisme import export as E

    monkeypatch.setattr(E, "CURVES_PATH", tmp_path / "curves.json")
    with patch(
        "synchro.chartisme.auto.export_curves",
        side_effect=lambda draws: E.export_curves(draws, only=["sum"]),
    ):
        result = run_cycle(DRAWS, min_confidence=0.0)
    assert result["figures"]["count"] > 0
    assert result["firings"]["count"] == 0


def test_run_cycle_can_leave_the_disk_alone(tmp_path, monkeypatch) -> None:
    """`persist=False` sert l'API : elle répond sans réécrire l'état du module."""
    state = tmp_path / "state.json"
    monkeypatch.setattr(auto, "STATE_PATH", state)
    from synchro.chartisme import export as E

    monkeypatch.setattr(E, "CURVES_PATH", tmp_path / "curves.json")
    with patch(
        "synchro.chartisme.auto.export_curves",
        side_effect=lambda draws: E.export_curves(draws, only=["sum"]),
    ):
        run_cycle(DRAWS, persist=False, min_confidence=0.0)
    assert not state.exists()
    assert not (tmp_path / "curves.json").exists()


def test_auto_cycle_is_muted_under_pytest() -> None:
    """Un cycle complet dans la suite la rendrait lente et dépendante du disque."""
    assert run_auto_cycle(DRAWS) is None


def test_auto_cycle_swallows_a_failure_and_records_it(tmp_path, monkeypatch) -> None:
    """La garantie du module : une synchro de tirages n'échoue jamais à cause de lui."""
    monkeypatch.setattr(auto, "STATE_PATH", tmp_path / "state.json")
    monkeypatch.setattr(auto, "_suppressed", lambda: False)
    with patch(
        "synchro.chartisme.auto.export_curves",
        side_effect=RuntimeError("archive illisible"),
    ):
        assert run_auto_cycle(DRAWS, reason="ensure") is None
    failure = read_state(path=tmp_path / "state.json")
    assert failure["ok"] is False
    assert failure["reason"] == "ensure"
    assert "RuntimeError" in failure["error"]
    assert "archive illisible" in failure["error"]


def test_auto_cycle_survives_an_unwritable_state(tmp_path, monkeypatch) -> None:
    """Un disque plein ne doit pas davantage remonter jusqu'à la synchro."""
    monkeypatch.setattr(auto, "STATE_PATH", tmp_path / "state.json")
    monkeypatch.setattr(auto, "_suppressed", lambda: False)
    with (
        patch(
            "synchro.chartisme.auto.export_curves",
            side_effect=RuntimeError("archive illisible"),
        ),
        patch("synchro.chartisme.auto.write_state", side_effect=OSError("disque plein")),
    ):
        assert run_auto_cycle(DRAWS) is None


def test_auto_cycle_drops_the_heavy_payload(tmp_path, monkeypatch) -> None:
    """Le retour est consigné, pas renvoyé : les séries ne remontent pas."""
    monkeypatch.setattr(auto, "STATE_PATH", tmp_path / "state.json")
    monkeypatch.setattr(auto, "_suppressed", lambda: False)
    from synchro.chartisme import export as E

    monkeypatch.setattr(E, "CURVES_PATH", tmp_path / "curves.json")
    with patch(
        "synchro.chartisme.auto.export_curves",
        side_effect=lambda draws: E.export_curves(draws, only=["sum"]),
    ):
        out = run_auto_cycle(DRAWS, rules=RULES, min_confidence=0.0)
    assert out is not None
    assert set(out) & {"bundle", "scan", "hits"} == set()
    assert out["ok"] is True
    assert out["figures"]["count"] >= 0


def test_status_answers_without_a_cycle_or_a_network(tmp_path, monkeypatch) -> None:
    """Ce que l'en-tête lit au chargement, même quand rien n'a jamais tourné."""
    monkeypatch.setattr(auto, "STATE_PATH", tmp_path / "absent.json")
    from synchro.chartisme import export as E

    monkeypatch.setattr(E, "CURVES_PATH", tmp_path / "absent-curves.json")
    payload = status()
    assert payload["ok"] is True
    assert payload["state"] is None
    assert payload["curves"] is None
    assert payload["models"]["install_cmd"] == "./launch install-chartisme"
    # Renseigné par la route, qui seule connaît la configuration.
    assert payload["auto_export"] is None


def test_status_keeps_the_badge_when_a_network_is_broken(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(auto, "STATE_PATH", tmp_path / "absent.json")
    with patch(
        "synchro.chartisme.models.infer.ready", side_effect=RuntimeError("poids corrompus")
    ):
        payload = status()
    assert payload["ok"] is True
    assert "available" in payload["models"]


def test_default_confidence_floor_is_the_one_the_ui_shows() -> None:
    """Le cycle et l'onglet doivent balayer au même seuil, sinon les comptes divergent."""
    assert DEFAULT_MIN_CONFIDENCE == 0.6


def test_ensure_hook_is_silent_when_auto_export_is_off() -> None:
    """Option décochée : le cycle ne part pas, et la synchro n'en sait rien."""
    from synchro.app import _chartisme_auto_cycle

    class _Settings:
        chartisme_auto_export = False

    with (
        patch("synchro.app.get_settings", return_value=_Settings()),
        patch("synchro.chartisme.auto.run_auto_cycle") as cycle,
    ):
        _chartisme_auto_cycle()
    cycle.assert_not_called()


def test_ensure_hook_never_lets_an_error_reach_the_sync() -> None:
    """L'accroche est non fatale : c'est la condition pour être branchée là."""
    from synchro.app import _chartisme_auto_cycle

    class _Settings:
        chartisme_auto_export = True

    with (
        patch("synchro.app.get_settings", return_value=_Settings()),
        patch("synchro.db.all_draws", side_effect=RuntimeError("Neon injoignable")),
    ):
        _chartisme_auto_cycle()


def test_ensure_hook_fires_the_cycle_when_a_draw_lands() -> None:
    from synchro.app import _chartisme_auto_cycle

    class _Settings:
        chartisme_auto_export = True

    with (
        patch("synchro.app.get_settings", return_value=_Settings()),
        patch("synchro.db.all_draws", return_value=[]),
        patch("synchro.db.serialize_draw", side_effect=lambda row: row),
        patch("synchro.db.list_chartisme_rules", return_value=[]),
        patch("synchro.db.serialize_row", side_effect=lambda row: row),
        patch("synchro.chartisme.auto.run_auto_cycle") as cycle,
    ):
        _chartisme_auto_cycle()
    cycle.assert_called_once()
    assert cycle.call_args.kwargs["reason"] == "ensure"
