"""Les routes du module chartisme, sans Neon et sans réseau.

Deux exigences tenues ici. D'abord Netlify : en production l'API Python ne
répond pas, donc rien de vital ne doit dépendre d'une route. Ensuite le
principe du module — l'absence se lit dans la réponse (`503`, `null`, une
liste vide) et jamais par une pile d'exceptions.
"""

from datetime import date
from random import Random
from typing import Any
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from synchro.app import create_app


def _draw(index: int) -> dict[str, Any]:
    rng = Random(index)
    return {
        "draw_date": date(2024, 1 + index // 28, 1 + index % 28),
        "weekday": "mardi" if index % 2 else "vendredi",
        "numbers": sorted(rng.sample(range(1, 51), 5)),
        "stars": sorted(rng.sample(range(1, 13), 2)),
        "star_pool": 12,
    }


DRAWS = [_draw(i) for i in range(130)]
WINDOW = [float(v) for v in range(40)]


CURVES = ["sum", "spread", "delay:7"]


@pytest.fixture(autouse=True)
def _isolated_bundle():
    """Bundle reconstruit à chaque test, réduit à trois courbes.

    Relire `.chartisme/curves.json` ferait dépendre la suite de ce qu'un cycle
    autonome y a laissé, et exporter les cent trente et une courbes coûterait
    plusieurs minutes par test pour éprouver des routes, pas un export.
    """
    from synchro.chartisme.export import export_curves

    with (
        # Le démarrage ouvre un pool Neon dès que la base est déclarée, et
        # attend trente secondes qu'un serveur absent réponde.
        patch("synchro.db.init_db"),
        patch("synchro.app.chartisme_read_bundle", return_value=None),
        patch("synchro.app.chartisme_write_bundle"),
        patch(
            "synchro.app.chartisme_export_curves",
            side_effect=lambda draws, **kw: export_curves(draws, only=CURVES),
        ),
    ):
        yield


def _client() -> TestClient:
    return TestClient(create_app())


def _with_draws():
    return (
        patch("synchro.db.database_configured", return_value=True),
        patch("synchro.db.all_draws", return_value=DRAWS),
    )


# --- Routes qui n'ont besoin de rien -----------------------------------------


def test_catalog_serves_the_reference_table() -> None:
    """La table des figures, telle qu'affichée dans l'onglet."""
    with _client() as client:
        response = client.get("/api/chartisme/catalog")
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    ids = {row["figure"] for row in body["figures"]}
    assert len(body["figures"]) == 18
    assert {"ete", "ete_inv", "diamond", "broadening_top", "canal"} <= ids
    assert "none" not in ids
    for row in body["figures"]:
        assert row["label"] and row["kind"] and row["signal"] and row["target"]
    assert body["pivot_roles"]["head"]


def test_status_says_what_is_missing_without_raising() -> None:
    with patch("synchro.db.database_configured", return_value=False):
        with _client() as client:
            response = client.get("/api/chartisme/status")
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert "auto_export" in body
    assert "models" in body
    # Sans cycle passé l'état est nul, pas absent : l'UI lit toujours la clé.
    assert "state" in body
    assert "pending_labels" not in body


def test_training_report_is_served_even_when_absent() -> None:
    with _client() as client:
        response = client.get("/api/chartisme/training")
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert "report" in body
    assert body["models"]["install_cmd"] == "./launch install-chartisme"


def test_detect_reads_a_window_posted_by_the_browser() -> None:
    """Route utilisée par le bloc-croquis et l'atelier d'étiquetage."""
    from synchro.chartisme.synth import make_sample

    sample = make_sample("ete", Random(0), length=72, jitter=0.0, noise=0.0, flip=False)
    with _client() as client:
        response = client.post(
            "/api/chartisme/detect",
            json={
                "values": list(sample["values"]),
                "activity": list(sample["activity"]),
                "min_confidence": 0.0,
            },
        )
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["figures"]
    assert body["summary"]["count"] == len(body["figures"])
    first = body["figures"][0]
    assert first["figure"] and first["label"]
    assert 0.0 <= first["confidence"] <= 1.0
    assert "models" not in body


def test_detect_refuses_a_window_too_short_to_read() -> None:
    with _client() as client:
        short = client.post("/api/chartisme/detect", json={"values": [1.0, 2.0]})
        empty = client.post("/api/chartisme/detect", json={"values": []})
    assert short.status_code == 422
    assert empty.status_code == 422


def test_detect_with_models_answers_even_without_a_network() -> None:
    """Le champ est servi vide plutôt qu'omis : l'UI affiche « pas d'avis »."""
    with _client() as client:
        response = client.post(
            "/api/chartisme/detect",
            json={"values": WINDOW, "models": True, "min_confidence": 0.0},
        )
    assert response.status_code == 200
    body = response.json()
    assert "models" in body
    assert body["models"]["consensus"] in (True, False)


# --- Routes qui ont besoin de l'archive --------------------------------------


def test_curves_travel_without_their_series() -> None:
    """Le bundle complet pèse plusieurs mégaoctets : la liste voyage allégée."""
    left, right = _with_draws()
    with left, right:
        with _client() as client:
            response = client.get("/api/chartisme/curves?era=all")
    assert response.status_code == 200
    body = response.json()
    assert body["manifest"]["curve_count"] == len(body["curves"])
    assert body["curves"]
    for row in body["curves"]:
        assert "values" not in row
        assert "dates" not in row
        assert row["id"] and row["label"]


def test_a_single_curve_carries_its_series() -> None:
    left, right = _with_draws()
    with left, right:
        with _client() as client:
            response = client.get("/api/chartisme/curves?curve=sum")
            missing = client.get("/api/chartisme/curves?curve=jamais")
    assert response.status_code == 200
    curve = response.json()["curve"]
    assert curve["id"] == "sum"
    assert len(curve["values"]) == len(curve["dates"]) == len(curve["activity"])
    assert missing.status_code == 404


def test_curves_need_neon_to_read_the_archive() -> None:
    with patch("synchro.db.database_configured", return_value=False):
        with _client() as client:
            response = client.get("/api/chartisme/curves")
    assert response.status_code == 503


def test_figures_scan_a_curve_and_rank_the_readings() -> None:
    left, right = _with_draws()
    with left, right:
        with _client() as client:
            response = client.get(
                "/api/chartisme/figures?curve=sum&min_confidence=0.0"
            )
    assert response.status_code == 200
    body = response.json()
    assert body["curve"]["id"] == "sum"
    figures = body["figures"]
    assert figures
    # Classement documenté : cassure confirmée d'abord, puis la lecture la
    # plus spécifique, et la confiance seulement en troisième clé.
    from synchro.chartisme.figures import rank_key

    keys = [rank_key(f) for f in figures]
    assert keys == sorted(keys)
    for figure in figures:
        assert 0 <= figure["from_index"] < figure["to_index"] < len(body["curve"]["values"])
        assert figure["outcome"]["status"] in ("reached", "invalidated", "open", "no_breakout")
        # Chaque lecture doit porter de quoi dessiner l'annotation.
        assert figure["pivots"]
    assert "alternatives" in figures[0]


def test_figures_honour_a_single_scale_and_a_floor() -> None:
    left, right = _with_draws()
    with left, right:
        with _client() as client:
            scaled = client.get("/api/chartisme/figures?curve=sum&scale=60&min_confidence=0.0")
            strict = client.get("/api/chartisme/figures?curve=sum&min_confidence=0.95")
            raw = client.get("/api/chartisme/figures?curve=sum&zones=false&min_confidence=0.0")
    assert {f["scale"] for f in scaled.json()["figures"]} <= {60}
    assert all(f["confidence"] >= 0.95 for f in strict.json()["figures"])
    # Sans regroupement, une même zone peut être lue plusieurs fois.
    assert len(raw.json()["figures"]) >= len(scaled.json()["figures"])


def test_figures_on_an_unknown_curve_is_a_404() -> None:
    left, right = _with_draws()
    with left, right:
        with _client() as client:
            response = client.get("/api/chartisme/figures?curve=jamais")
    assert response.status_code == 404


def test_svg_renders_the_annotated_figure() -> None:
    """Le jumeau Python du canevas : même annotation, servie en SVG."""
    left, right = _with_draws()
    with left, right:
        with _client() as client:
            response = client.get("/api/chartisme/svg?curve=sum&min_confidence=0.0")
            far = client.get("/api/chartisme/svg?curve=sum&index=9999&min_confidence=0.0")
    assert response.status_code == 200
    body = response.json()
    assert body["svg"].startswith("<svg")
    assert body["thumb"].startswith("<svg")
    # La figure est servie à plat, annotation comprise : l'onglet n'a rien à recomposer.
    assert body["figure"] and body["label"]
    assert body["pivots"]
    assert far.status_code == 404


def test_similar_searches_the_archive_by_resemblance() -> None:
    left, right = _with_draws()
    with left, right:
        with _client() as client:
            response = client.post(
                "/api/chartisme/similar",
                json={"values": WINDOW, "curve": "sum", "size": 40, "stride": 20, "top": 5},
            )
    assert response.status_code == 200
    body = response.json()
    assert body["method"] == "dtw"
    assert body["searched"] > 0
    matches = body["matches"]
    assert 0 < len(matches) <= 5
    distances = [m["distance"] for m in matches]
    assert distances == sorted(distances)
    assert all(m["curve_id"] == "sum" for m in matches)


def test_similar_searches_the_displayed_weekday_not_the_mixed_cache() -> None:
    """Un jour isolé réexporte ses courbes. Synthèse et l’absence de jour restent mixtes."""
    mardi_dates = {d["draw_date"].isoformat() for d in DRAWS if d["weekday"] == "mardi"}
    vendredi_dates = {d["draw_date"].isoformat() for d in DRAWS if d["weekday"] == "vendredi"}
    payload = {"values": WINDOW, "curve": "sum", "size": 40, "stride": 20, "top": 8}
    left, right = _with_draws()
    with left, right:
        with _client() as client:
            mixed = client.post("/api/chartisme/similar", json=payload)
            scoped = client.post("/api/chartisme/similar?weekday=MARDI", json=payload)
            body_only = client.post(
                "/api/chartisme/similar",
                json={**payload, "weekday": "vendredi"},
            )
    assert mixed.status_code == 200
    assert scoped.status_code == 200
    assert body_only.status_code == 200
    mixed_body = mixed.json()
    scoped_body = scoped.json()
    friday = body_only.json()
    assert mixed_body["weekday"] is None
    assert scoped_body["weekday"] == "mardi"
    assert friday["weekday"] == "vendredi"
    assert mixed_body["searched"] > scoped_body["searched"] > 0
    assert friday["searched"] == scoped_body["searched"]
    assert all(m["from"] in mardi_dates and m["to"] in mardi_dates for m in scoped_body["matches"])
    assert all(m["from"] in vendredi_dates and m["to"] in vendredi_dates for m in friday["matches"])
    assert any(m["from"] not in mardi_dates for m in mixed_body["matches"])


def test_similar_accepts_a_mouse_sketch() -> None:
    """L'écran a `y` croissant vers le bas : la route doit le retourner."""
    points = [[float(i), 100.0 - i] for i in range(60)]
    left, right = _with_draws()
    with left, right:
        with _client() as client:
            response = client.post(
                "/api/chartisme/similar",
                json={"points": points, "curve": "sum", "size": 40, "stride": 20},
            )
            short = client.post("/api/chartisme/similar", json={"points": [[0.0, 0.0]]})
    assert response.status_code == 200
    query = response.json()["query"]
    assert len(query) >= 8
    assert query[-1] > query[0]
    assert short.status_code == 400


def test_backtest_answers_the_two_questions() -> None:
    left, right = _with_draws()
    with left, right:
        with _client() as client:
            response = client.get(
                "/api/chartisme/backtest?curve=sum&min_confidence=0.0&follow=3"
            )
    assert response.status_code == 200
    body = response.json()
    assert body["curve_count"] == 1
    assert "figures" in body["targets"]
    assert body["targets"]["verdict"]["any_edge"] in (True, False)
    assert body["base_rates"]["windows_with_any_figure"] >= 0.0
    assert body["numbers"]["follow"] == 3
    assert body["stars"]["chi2_df"] == 11
    assert "indépendants" in body["disclaimer"]


def test_backtest_bounds_itself_to_the_window() -> None:
    """Le rétro-test doit pouvoir ne porter que sur la fenêtre étudiée.

    Mesurer sur toute l'archive suppose que le premier tirage enregistré ouvre un
    cycle et que rien n'a changé depuis. La route doit donc savoir se borner, et
    dire sur quoi elle a porté.
    """
    left, right = _with_draws()
    dates = sorted(str(d["draw_date"]) for d in DRAWS)
    with left, right:
        with _client() as client:
            bounded = client.get(
                "/api/chartisme/backtest"
                f"?curve=sum&min_confidence=0.0&numbers=false"
                f"&start={dates[80]}&end={dates[119]}&context=29&scales=20,40"
            )
            whole = client.get(
                "/api/chartisme/backtest?curve=sum&min_confidence=0.0&numbers=false"
            )
    assert bounded.status_code == 200
    window = bounded.json()["window"]
    assert window["bounded"] is True
    assert window["from"] == dates[80]
    assert window["to"] == dates[119]
    assert window["draw_count"] == 40
    assert window["context"] == 29
    assert window["scales"] == [20, 40]
    # Bornée, la mesure voit moins de figures : c'est le prix, pas un défaut.
    assert bounded.json()["figure_count"] < whole.json()["figure_count"]
    assert whole.json()["window"]["bounded"] is False


def test_backtest_ignores_an_unusable_scale_list() -> None:
    """Une échelle hors bornes ne doit pas faire échouer la requête."""
    left, right = _with_draws()
    with left, right:
        with _client() as client:
            response = client.get(
                "/api/chartisme/backtest"
                "?curve=sum&min_confidence=0.0&numbers=false&scales=3,abc,"
            )
    assert response.status_code == 200
    from synchro.chartisme.scan import DEFAULT_SCALES

    assert response.json()["window"]["scales"] == list(DEFAULT_SCALES)


def test_backtest_follows_the_bar_of_each_scale() -> None:
    """L'onglet lu en rareté visée a un seuil par échelle : la route doit le suivre.

    Sans quoi le rétro-test mesurerait d'autres figures que celles qu'on a sous
    les yeux — celles d'un seuil unique qu'aucune lecture n'a utilisé.
    """
    left, right = _with_draws()
    with left, right:
        with _client() as client:
            common = client.get(
                "/api/chartisme/backtest"
                "?curve=sum&numbers=false&scales=20,40&min_confidence=0.5"
            )
            per_scale = client.get(
                "/api/chartisme/backtest"
                "?curve=sum&numbers=false&scales=20,40&min_confidence=0.5"
                "&thresholds=0.95,0.5"
            )
    assert per_scale.status_code == 200
    assert per_scale.json()["figure_count"] < common.json()["figure_count"]
    # Le taux de base se mesure à la longueur de la plus longue échelle, donc à
    # son seuil : ici le seuil commun, l'autre valant pour l'échelle 20.
    assert per_scale.json()["base_rates"]["min_confidence"] == 0.5


def test_backtest_ignores_thresholds_that_do_not_pair_with_the_scales() -> None:
    """Décaler les seuils d'un cran rendrait un balayage plausible et faux.

    Mieux vaut retomber sur le seuil commun, qui est au moins celui que la requête
    a nommé, qu'apparier de travers.
    """
    left, right = _with_draws()
    with left, right:
        with _client() as client:
            crooked = client.get(
                "/api/chartisme/backtest"
                "?curve=sum&numbers=false&scales=20,40&min_confidence=0.5&thresholds=0.95"
            )
            common = client.get(
                "/api/chartisme/backtest"
                "?curve=sum&numbers=false&scales=20,40&min_confidence=0.5"
            )
    assert crooked.status_code == 200
    assert crooked.json()["figure_count"] == common.json()["figure_count"]


def test_backtest_can_skip_the_number_question() -> None:
    left, right = _with_draws()
    with left, right:
        with _client() as client:
            response = client.get(
                "/api/chartisme/backtest?curve=sum&numbers=false&min_confidence=0.0"
            )
    body = response.json()
    assert "numbers" not in body
    assert "targets" in body


# --- Règles et étiquettes : Neon requis --------------------------------------


def test_evaluate_runs_without_neon_and_fires_nothing() -> None:
    """Sans base il n'y a pas de règles, donc pas de déclenchement — pas d'erreur."""
    with (
        patch("synchro.db.database_configured", return_value=False),
        patch("synchro.db.all_draws", return_value=DRAWS),
    ):
        with _client() as client:
            response = client.post(
                "/api/chartisme/rules/evaluate",
                json={"curve": "sum", "rules": []},
            )
    assert response.status_code == 503


def test_evaluate_with_rules_supplied_by_the_browser() -> None:
    """L'atelier peut faire tourner ses règles locales sans les enregistrer."""
    left, right = _with_draws()
    with left, right:
        with _client() as client:
            response = client.post(
                "/api/chartisme/rules/evaluate",
                json={
                    "curve": "sum",
                    "min_confidence": 0.0,
                    "rules": [
                        {
                            "id": "r1",
                            "name": "toute figure",
                            "condition": {},
                            "actions": [{"type": "note"}],
                        }
                    ],
                },
            )
    assert response.status_code == 200
    body = response.json()
    assert body["scanned"] > 0
    assert body["firings"]
    assert body["summary"]["count"] == len(body["firings"])
    assert {f["rule_id"] for f in body["firings"]} == {"r1"}
    assert body["firings"][0]["snapshot"]["curve_id"] == "sum"


def test_evaluate_with_a_rule_that_matches_nothing() -> None:
    left, right = _with_draws()
    with left, right:
        with _client() as client:
            response = client.post(
                "/api/chartisme/rules/evaluate",
                json={
                    "curve": "sum",
                    "rules": [
                        {
                            "id": "r2",
                            "name": "impossible",
                            "condition": {"min_confidence": 1.0, "breakout": "confirmed"},
                        }
                    ],
                },
            )
    body = response.json()
    assert body["scanned"] >= 0
    assert body["firings"] == []
    assert body["summary"]["count"] == 0


def test_rules_labels_and_firings_need_neon() -> None:
    """Chaque route d'écriture dit franchement que la base manque."""
    with patch("synchro.db.database_configured", return_value=False):
        with _client() as client:
            assert client.get("/api/chartisme/rules").status_code == 503
            assert client.post("/api/chartisme/rules", json={"name": "x"}).status_code == 503
            assert client.delete("/api/chartisme/rules/abc").status_code == 503
            assert client.get("/api/chartisme/labels").status_code == 503
            assert client.delete("/api/chartisme/labels/abc").status_code == 503
            assert client.get("/api/chartisme/firings").status_code == 503
            posted = client.post(
                "/api/chartisme/labels",
                json={"curve_id": "sum", "figure": "ete", "from_index": 0, "to_index": 40},
            )
            assert posted.status_code == 503


def test_saving_a_rule_normalizes_it_first() -> None:
    """Une figure inventée filtrerait tout en silence : elle est retirée ici."""
    saved: dict[str, Any] = {}

    def _upsert(rule: dict[str, Any]) -> dict[str, Any]:
        saved.update(rule)
        return rule

    with (
        patch("synchro.db.database_configured", return_value=True),
        patch("synchro.db.upsert_chartisme_rule", side_effect=_upsert),
        patch("synchro.db.serialize_row", side_effect=lambda row: row),
    ):
        with _client() as client:
            response = client.post(
                "/api/chartisme/rules",
                json={
                    "name": "  ",
                    "condition": {"figures": ["ete", "licorne"], "breakout": "CONFIRMED"},
                    "actions": [{"type": "acheter une grille"}],
                },
            )
    assert response.status_code == 200
    assert saved["name"] == "Règle"
    assert saved["condition"]["figures"] == ["ete"]
    assert saved["condition"]["breakout"] == "confirmed"
    # Aucune action ne touche aux grilles : l'intruse est remplacée par un constat.
    assert saved["actions"] == [{"type": "note", "payload": {}}]
    assert saved["id"]


def test_a_label_without_an_id_gets_one() -> None:
    """L'atelier enregistre une étiquette neuve sans avoir à inventer de clé."""
    seen: dict[str, Any] = {}

    with (
        patch("synchro.db.database_configured", return_value=True),
        patch("synchro.db.upsert_chartisme_label", side_effect=lambda label: seen.update(label) or label),
        patch("synchro.db.serialize_row", side_effect=lambda row: row),
    ):
        with _client() as client:
            response = client.post(
                "/api/chartisme/labels",
                json={
                    "curve_id": "delay:7",
                    "variable": "delay",
                    "n": 7,
                    "figure": "ete",
                    "from_index": 10,
                    "to_index": 60,
                    "values": WINDOW,
                    "roles": [{"role": "head", "index": 42, "value": 3.1}],
                    "author": "Laurent",
                },
            )
    assert response.status_code == 200
    assert seen["id"]
    assert seen["roles"][0]["role"] == "head"
    assert seen["curve_id"] == "delay:7"
    assert seen["n"] == 7


def test_a_free_class_keeps_its_own_name() -> None:
    """Une classe créée à l'atelier n'est pas dans la table de référence."""
    seen: dict[str, Any] = {}

    with (
        patch("synchro.db.database_configured", return_value=True),
        patch("synchro.db.upsert_chartisme_label", side_effect=lambda label: seen.update(label) or label),
        patch("synchro.db.serialize_row", side_effect=lambda row: row),
    ):
        with _client() as client:
            response = client.post(
                "/api/chartisme/labels",
                json={
                    "curve_id": "sum",
                    "figure": "escalier descendant",
                    "custom_label": "escalier descendant",
                    "from_index": 0,
                    "to_index": 40,
                    "values": WINDOW,
                },
            )
    assert response.status_code == 200
    assert seen["figure"] == "escalier descendant"
    assert seen["custom_label"] == "escalier descendant"


def test_deleting_something_absent_is_a_404() -> None:
    with (
        patch("synchro.db.database_configured", return_value=True),
        patch("synchro.db.delete_chartisme_rule", return_value=False),
        patch("synchro.db.delete_chartisme_label", return_value=False),
    ):
        with _client() as client:
            assert client.delete("/api/chartisme/rules/abc").status_code == 404
            assert client.delete("/api/chartisme/labels/abc").status_code == 404


def test_status_counts_pending_labels_when_neon_answers() -> None:
    with (
        patch("synchro.db.database_configured", return_value=True),
        patch("synchro.db.count_chartisme_labels", return_value=7),
    ):
        with _client() as client:
            response = client.get("/api/chartisme/status")
    assert response.json()["pending_labels"] == 7


def test_status_survives_a_broken_neon() -> None:
    """Une base injoignable ne doit pas vider l'en-tête de l'onglet."""
    with (
        patch("synchro.db.database_configured", return_value=True),
        patch("synchro.db.count_chartisme_labels", side_effect=RuntimeError("réseau")),
    ):
        with _client() as client:
            response = client.get("/api/chartisme/status")
    assert response.status_code == 200
    assert response.json()["pending_labels"] is None
