"""Réseaux, jeu d'entraînement et rapport — sautés proprement sans torch.

`torch` n'est pas une dépendance du logiciel : le module chartisme tourne sans,
avec ses détecteurs géométriques et l'appariement DTW. Les tests qui en ont
besoin se sautent, et ceux qui mesurent l'absence tournent toujours — c'est
même le plus important d'entre eux.
"""

import json
import random
from typing import Any

import pytest

from synchro.chartisme.catalog import FIGURE_IDS
from synchro.chartisme.dataset import (
    SOURCE_WEIGHTS,
    build_dataset,
    class_counts,
    class_list,
    class_weights,
    encode,
    encode_all,
    make_sample_row,
    negatives,
    split,
    summary,
    user_labels,
    weak_labels,
)
from synchro.chartisme.models import (
    INSTALL_CMD,
    availability,
    pyg_available,
    requirements_path,
    torch_available,
)
from synchro.chartisme.models.train import (
    confusion,
    fit_temperature,
    geometric_predictions,
    per_class_f1,
    read_report,
    reliability,
    score,
    verdict,
    write_report,
)
from synchro.chartisme.synth import make_dataset

needs_torch = pytest.mark.skipif(not torch_available(), reason="torch absent")
needs_pyg = pytest.mark.skipif(not pyg_available(), reason="torch-geometric absent")

FEW = ["ete", "double_top", "flag", "none"]


def _samples(per_class: int = 4) -> list[dict[str, Any]]:
    return make_dataset(per_class=per_class, figures=FEW, seed=0)


# --- Disponibilité : le module doit vivre sans réseau ------------------------


def test_availability_never_raises_and_always_advises() -> None:
    """La pastille d'en-tête interroge cette sonde à chaque chargement."""
    state = availability()
    assert set(state) == {"available", "torch", "pyg", "install_cmd", "hint"}
    assert state["install_cmd"] == INSTALL_CMD
    assert isinstance(state["torch"], bool)
    if state["available"]:
        assert state["hint"] is None
    else:
        assert "install-chartisme" in state["hint"]


def test_pyg_implies_torch() -> None:
    """Le GNN ne peut pas être là sans torch : la sonde doit rester cohérente."""
    assert not pyg_available() or torch_available()


def test_requirements_file_exists_and_pins_the_heavy_bits() -> None:
    path = requirements_path()
    assert path.exists(), path
    text = path.read_text(encoding="utf-8")
    assert "torch" in text
    assert "torch-geometric" in text or "torch_geometric" in text


def test_nothing_imports_torch_at_module_load() -> None:
    """Importer le module chartisme ne doit pas coûter plusieurs secondes.

    Les réseaux sont optionnels : leurs imports sont à l'intérieur des
    fonctions. Ce test lit la source plutôt que de mesurer un temps, ce qui
    serait fragile.
    """
    from pathlib import Path

    root = Path(__file__).resolve().parents[1] / "synchro" / "chartisme"
    for name in ("figures.py", "scan.py", "export.py", "svgpath.py", "graph.py", "rules.py"):
        text = (root / name).read_text(encoding="utf-8")
        for line in text.splitlines():
            stripped = line.strip()
            if stripped.startswith(("import torch", "from torch")):
                pytest.fail(f"{name} importe torch au chargement : {stripped}")


# --- Jeu d'entraînement -------------------------------------------------------


def test_make_sample_row_resamples_to_a_common_length() -> None:
    row = make_sample_row("ete", list(range(30)), activity=[1.0] * 30, length=48)
    assert row is not None
    assert len(row["values"]) == 48
    assert len(row["activity"]) == 48
    assert row["source"] == "synth"
    assert row["weight"] == SOURCE_WEIGHTS["synth"]


def test_make_sample_row_declines_a_window_too_short() -> None:
    assert make_sample_row("ete", [1.0, 2.0, 3.0]) is None


def test_make_sample_row_drops_an_unusable_activity() -> None:
    row = make_sample_row("ete", list(range(30)), activity=[1.0])
    assert row is not None
    assert row["activity"] == []


def test_your_labels_weigh_more_than_the_rest() -> None:
    """La hiérarchie de confiance du jeu, et elle n'est pas décorative."""
    assert SOURCE_WEIGHTS["user"] > SOURCE_WEIGHTS["synth"] > SOURCE_WEIGHTS["weak"]


def test_user_labels_read_either_payload_shape() -> None:
    values = [float(v) for v in range(40)]
    rows = user_labels(
        [
            {"figure": "ete", "values": values, "id": "a"},
            {"figure": "diamond", "window_values": values, "id": "b"},
            {"figure": "ete", "values": [1.0], "id": "trop court"},
        ]
    )
    assert [row["label_id"] for row in rows] == ["a", "b"]
    assert all(row["source"] == "user" for row in rows)
    assert all(row["weight"] == SOURCE_WEIGHTS["user"] for row in rows)


def test_class_list_appends_free_classes_after_the_catalogue() -> None:
    samples = [{"figure": "ete"}, {"figure": "escalier descendant"}]
    classes = class_list(samples)
    assert classes[: len(FIGURE_IDS)] == list(FIGURE_IDS)
    assert classes[-1] == "escalier descendant"


def test_class_weights_lift_the_rare_classes() -> None:
    samples = [{"figure": "ete"}] * 90 + [{"figure": "diamond"}] * 10
    classes = ["ete", "diamond"]
    weights = class_weights(samples, classes)
    assert weights[1] > weights[0]
    # Une classe absente ne doit pas peser l'infini.
    assert class_weights(samples, ["ete", "absente"])[1] == 0.0


def test_class_counts_are_sorted_by_size() -> None:
    counts = class_counts([{"figure": "a"}, {"figure": "b"}, {"figure": "b"}])
    assert list(counts) == ["b", "a"]


def test_split_sends_your_labels_to_validation() -> None:
    """Mesurer sur les étiquettes faibles ne mesurerait que l'accord au détecteur."""
    samples = _samples(per_class=10)
    mine = make_sample_row("diamond", [float(v) for v in range(40)], source="user")
    assert mine is not None
    train, val = split([*samples, mine], val_ratio=0.2, seed=0)
    assert mine in val
    assert mine not in train
    assert all(row.get("source") != "user" for row in train)
    assert len(train) + len(val) == len(samples) + 1


def test_split_keeps_every_class_in_training() -> None:
    """Aucune classe ne doit disparaître du jeu d'entraînement.

    Les classes dépassent celles demandées : la symétrie verticale permute
    l'étiquette, donc une ETE tirée à l'envers arrive comme ETE inversée.
    """
    samples = _samples(per_class=10)
    train, val = split(samples, val_ratio=0.2, seed=1)
    assert {row["figure"] for row in train} == {row["figure"] for row in samples}
    assert set(FEW) <= {row["figure"] for row in samples}
    assert val


def test_split_of_a_tiny_class_keeps_it_for_training() -> None:
    """Quatre exemples : les couper en deux ne laisserait rien à apprendre."""
    samples = make_dataset(per_class=3, figures=["ete"], seed=0)
    train, val = split(samples, val_ratio=0.2, seed=0)
    assert len(train) == 3
    assert val == []


def test_weak_labels_and_negatives_come_from_the_archive() -> None:
    from synchro.chartisme.export import export_curves
    from synchro.chartisme.scan import scan_curve

    draws = [
        {
            "draw_date": f"2024-{1 + i // 28:02d}-{1 + i % 28:02d}",
            "weekday": "mardi" if i % 2 else "vendredi",
            "numbers": sorted(random.Random(i).sample(range(1, 51), 5)),
            "stars": sorted(random.Random(i).sample(range(1, 13), 2)),
            "star_pool": 12,
        }
        for i in range(140)
    ]
    bundle = export_curves(draws, only=["sum", "spread"])
    hits = [
        hit
        for curve in bundle["curves"]
        for hit in scan_curve(curve, min_confidence=0.0)
    ]
    weak = weak_labels(bundle, hits, min_confidence=0.0, length=48)
    assert weak
    assert all(row["source"] == "weak" for row in weak)
    assert all(row["weight"] == SOURCE_WEIGHTS["weak"] for row in weak)
    assert all(len(row["values"]) == 48 for row in weak)

    # Sans contre-exemples, le modèle apprend à voir une figure partout.
    against = negatives(bundle, count=20, length=48, seed=0)
    assert len(against) == 20
    assert {row["figure"] for row in against} == {"none"}
    assert all(row["source"] == "real" for row in against)
    assert negatives({"curves": []}, count=10) == []


def test_weak_labels_cap_the_dominant_figure() -> None:
    rows = [
        {"figure": "ete" if i % 4 else "diamond", "values": [], "source": "weak"}
        for i in range(60)
    ]
    from synchro.chartisme.dataset import _cap_per_figure

    capped = _cap_per_figure(rows, 5, 0)
    counts = class_counts(capped)
    assert max(counts.values()) <= 5
    assert _cap_per_figure(rows, None, 0) == rows


def test_build_dataset_records_the_provenance() -> None:
    dataset = build_dataset(per_class=3, length=48, seed=0)
    assert dataset["length"] == 48
    assert dataset["samples"]
    assert dataset["classes"][: len(FIGURE_IDS)] == list(FIGURE_IDS)
    assert dataset["by_source"] == {"synth": len(dataset["samples"])}
    assert len(dataset["class_weights"]) == len(dataset["classes"])
    info = summary(dataset)
    assert info["total"] == len(dataset["samples"])
    assert info["classes"] == len(dataset["classes"])
    assert len(info["rarest"]) <= 5


# --- Encodage partagé ---------------------------------------------------------


def test_encode_produces_both_representations() -> None:
    """Une fenêtre, deux points de vue : suite de commandes et graphe."""
    sample = _samples(per_class=1)[0]
    row = encode(sample)
    assert row["figure"] == sample["figure"]
    assert len(row["commands"]) == len(row["args"]) == len(row["path_mask"])
    assert row["graph"]["nodes"]
    assert len(row["graph"]["edge_index"]) == 2
    # Les tenseurs doivent être rectangulaires, sinon `collate` lèvera.
    widths = {len(step) for path in row["args"] for step in path}
    assert len(widths) == 1


def test_encode_all_keeps_the_order_and_the_weights() -> None:
    samples = _samples(per_class=2)
    rows = encode_all(samples)
    assert [row["figure"] for row in rows] == [s["figure"] for s in samples]
    assert all(row["weight"] > 0 for row in rows)


def test_encoded_shapes_are_identical_across_samples() -> None:
    """Le lot est empilé tel quel : une forme variable casserait l'entraînement."""
    rows = encode_all(_samples(per_class=2))
    shapes = {(len(r["commands"]), len(r["commands"][0])) for r in rows}
    assert len(shapes) == 1


# --- Métriques et verdict -----------------------------------------------------


def test_confusion_counts_only_known_classes() -> None:
    matrix = confusion(["a", "b", "a", "z"], ["a", "a", "a", "a"], ["a", "b"])
    assert matrix == [[2, 0], [1, 0]]


def test_per_class_f1_distinguishes_absent_from_failed() -> None:
    """Une classe jamais vue vaut `None`, une classe toujours ratée vaut 0."""
    rows = per_class_f1(["a", "a"], ["a", "b"], ["a", "b", "c"])
    assert rows["a"]["support"] == 2
    assert rows["a"]["recall"] == 0.5
    assert rows["b"]["f1"] == 0.0
    assert rows["c"]["f1"] is None
    assert rows["c"]["support"] == 0


def test_score_reports_accuracy_top3_and_abstentions() -> None:
    out = score(
        ["a", "b", "c"],
        ["a", "__abstain__", "c"],
        ["a", "b", "c"],
        top3=[["a"], ["b", "a"], ["z"]],
    )
    assert out["count"] == 3
    assert out["accuracy"] == round(2 / 3, 4)
    assert out["top3"] == round(2 / 3, 4)
    assert out["abstained"] == 1
    assert out["macro_f1"] is not None


def test_score_of_an_empty_run_does_not_divide_by_zero() -> None:
    out = score([], [], ["a"])
    assert out["count"] == 0
    assert out["accuracy"] == 0.0


def test_geometric_predictions_always_answer_something() -> None:
    """La référence sans apprentissage doit produire une ligne par fenêtre."""
    samples = _samples(per_class=2)
    top1, top3 = geometric_predictions(samples)
    assert len(top1) == len(top3) == len(samples)
    assert all(names for names in top3)


def test_verdict_says_no_when_the_networks_do_not_win() -> None:
    """La question posée noir sur blanc, y compris quand la réponse est non."""
    out = verdict(
        {
            "geometric": {"macro_f1": 0.8},
            "svgformer": {"macro_f1": 0.5},
            "gnn": {"macro_f1": 0.6},
        }
    )
    assert out["baseline"] == "geometric"
    assert out["best"] == "gnn"
    assert out["networks_earn_their_place"] is False
    assert all(row["better"] is False for row in out["comparison"])


def test_verdict_credits_the_networks_when_they_do_win() -> None:
    out = verdict(
        {
            "geometric": {"macro_f1": 0.59},
            "dtw": {"macro_f1": 0.87},
            "svgformer": {"macro_f1": 0.85},
            "gnn": {"macro_f1": 0.88},
        }
    )
    assert out["best"] == "gnn"
    assert out["networks_earn_their_place"] is True
    assert out["comparison"][0]["gain"] == round(0.87 - 0.59, 4)


def test_verdict_does_not_credit_a_win_by_dtw_alone() -> None:
    """DTW n'a pas un poids appris : le voir gagner ne justifie pas les réseaux."""
    out = verdict(
        {
            "geometric": {"macro_f1": 0.5},
            "dtw": {"macro_f1": 0.9},
            "svgformer": {"macro_f1": 0.6},
        }
    )
    assert out["best"] == "dtw"
    assert out["networks_earn_their_place"] is False


def test_verdict_without_a_baseline_stays_silent() -> None:
    out = verdict({"svgformer": {"macro_f1": 0.9}})
    assert out["comparison"] == []
    assert out["best"] is None
    assert out["networks_earn_their_place"] is False


def test_verdict_skips_an_unavailable_model() -> None:
    out = verdict(
        {"geometric": {"macro_f1": 0.5}, "gnn": {"unavailable": "torch-geometric absent"}}
    )
    assert [row["model"] for row in out["comparison"]] == []


# --- Calibration --------------------------------------------------------------


def test_fit_temperature_cools_an_overconfident_model() -> None:
    """Annoncer 0,95 et se tromper une fois sur trois : la confiance doit baisser."""
    scores = [0.95] * 30
    correct = [i % 3 != 0 for i in range(30)]
    assert fit_temperature(scores, correct) > 1.0


def test_fit_temperature_leaves_a_calibrated_model_alone() -> None:
    scores = [0.99] * 30
    assert fit_temperature(scores, [True] * 30) <= 1.0
    assert fit_temperature([], []) == 1.0


def test_fit_temperature_points_the_same_way_as_predict() -> None:
    """La température ajustée et la température appliquée doivent aller ensemble.

    `predict_*` fait `softmax(logits / T)`, où T > 1 adoucit. Un ajustement
    qui renverrait T < 1 pour un modèle trop sûr de lui durcirait une
    confiance déjà excessive, et le plancher d'abstention ne jouerait jamais.
    """
    overconfident = fit_temperature([0.97] * 40, [i % 4 != 0 for i in range(40)])
    underconfident = fit_temperature([0.55] * 40, [True] * 40)
    assert overconfident > 1.0
    assert underconfident < 1.0


def test_reliability_compares_claimed_to_observed() -> None:
    rows = reliability([0.1, 0.15, 0.9, 0.95], [False, False, True, True], bins=5)
    assert rows
    for row in rows:
        assert 0.0 <= row["observed"] <= 1.0
        assert row["count"] > 0
    # Une tranche vide ne produit pas de ligne bruitée.
    assert all(row["count"] for row in rows)
    assert reliability([], []) == []


def test_reliability_files_a_perfect_score_in_the_last_bin() -> None:
    rows = reliability([1.0], [True], bins=5)
    assert rows[0]["range"] == [0.8, 1.0]


# --- Rapport ------------------------------------------------------------------


def test_report_round_trip(tmp_path) -> None:
    path = tmp_path / "training.json"
    assert read_report(path=path) is None
    write_report({"trained_at": "2026-01-01", "models": {}}, path=path)
    assert read_report(path=path)["trained_at"] == "2026-01-01"
    path.write_text("{ pas du json", encoding="utf-8")
    assert read_report(path=path) is None


def test_report_is_readable_french_json(tmp_path) -> None:
    """Le rapport est lu à la main autant que par l'API."""
    path = tmp_path / "training.json"
    write_report({"verdict": {"note": "tête & épaules"}}, path=path)
    text = path.read_text(encoding="utf-8")
    assert "tête & épaules" in text
    assert json.loads(text)["verdict"]["note"]


# --- Réseaux ------------------------------------------------------------------


@needs_torch
def test_svgformer_forward_gives_four_heads() -> None:
    from synchro.chartisme.models import svgformer as S

    rows = encode_all(_samples(per_class=2))
    batch = S.collate(rows)
    model = S.build(FIGURE_IDS, dim=32, heads=2, path_layers=1, group_layers=1)
    model.eval()
    out = model(batch["commands"], batch["args"], batch["path_mask"])
    assert out["logits"].shape == (len(rows), len(FIGURE_IDS))
    assert out["embedding"].shape[0] == len(rows)
    assert out["breakout"].shape == (len(rows),)
    # L'embedding contrastif est normalisé : c'est ce qui rend le cosinus lisible.
    norms = out["embedding"].norm(dim=-1)
    assert bool(((norms - 1.0).abs() < 1e-5).all())


@needs_torch
def test_svgformer_is_resolution_free() -> None:
    """Multiplier la courbe par quarante ne doit rien changer à la lecture.

    C'est l'argument du module contre une grille de pixels, et il se joue à
    l'encodage : `normalize_window` ramène la fenêtre au carré unité.
    """
    import torch

    from synchro.chartisme.models import svgformer as S

    sample = _samples(per_class=1)[0]
    scaled = dict(sample, values=[v * 41.0 + 900.0 for v in sample["values"]])
    model = S.build(FIGURE_IDS, dim=32, heads=2, path_layers=1, group_layers=1)
    model.eval()
    with torch.no_grad():
        left = model(**_inputs(S.collate([encode(sample)])))
        right = model(**_inputs(S.collate([encode(scaled)])))
    assert bool((left["logits"] - right["logits"]).abs().max() < 1e-4)


def _inputs(batch: dict[str, Any]) -> dict[str, Any]:
    return {k: batch[k] for k in ("commands", "args", "path_mask")}


@needs_torch
def test_svgformer_tolerates_an_empty_path() -> None:
    """Une fenêtre sans activité laisse un tracé vide : l'attention doit tenir."""
    from synchro.chartisme.models import svgformer as S

    row = encode({"figure": "none", "values": [float(v) for v in range(40)], "activity": []})
    batch = S.collate([row])
    model = S.build(FIGURE_IDS, dim=32, heads=2, path_layers=1, group_layers=1)
    model.eval()
    out = model(**_inputs(batch))
    assert bool(out["logits"].isfinite().all())


@needs_torch
def test_supervised_contrastive_pulls_same_figures_together() -> None:
    import torch

    from synchro.chartisme.models.train import supervised_contrastive

    together = torch.nn.functional.normalize(
        torch.tensor([[1.0, 0.0], [1.0, 0.01], [0.0, 1.0], [0.01, 1.0]]), dim=-1
    )
    apart = torch.nn.functional.normalize(
        torch.tensor([[1.0, 0.0], [0.0, 1.0], [1.0, 0.01], [0.01, 1.0]]), dim=-1
    )
    labels = torch.tensor([0, 0, 1, 1])
    assert float(supervised_contrastive(together, labels)) < float(
        supervised_contrastive(apart, labels)
    )


@needs_torch
def test_supervised_contrastive_is_a_finite_number() -> None:
    """La valeur remonte dans l'historique : NaN y rendrait la perte illisible.

    Le masque met -inf sur la diagonale et son coefficient vaut zéro ; une
    multiplication donnerait `-inf × 0` = NaN à chaque lot.
    """
    import math as _math

    import torch

    from synchro.chartisme.models.train import supervised_contrastive

    embeddings = torch.nn.functional.normalize(torch.randn(8, 16), dim=-1)
    labels = torch.tensor([0, 0, 1, 1, 2, 2, 3, 3])
    loss = supervised_contrastive(embeddings, labels)
    assert _math.isfinite(float(loss))
    assert float(loss) > 0.0


@needs_torch
def test_training_history_carries_readable_losses() -> None:
    """La colonne de perte est le seul témoin du progrès : elle doit être lisible."""
    import math as _math

    from synchro.chartisme.models.train import train_svgformer

    rows = encode_all(_samples(per_class=4))
    trained = train_svgformer(rows, rows[:4], FIGURE_IDS, epochs=2, batch_size=4)
    assert len(trained["history"]) == 2
    for row in trained["history"]:
        assert _math.isfinite(row["loss"]), row
        assert row["loss"] > 0.0


@needs_torch
def test_supervised_contrastive_without_a_positive_pair_is_neutral() -> None:
    """Un lot où chaque figure est unique n'a rien à rapprocher."""
    import torch

    from synchro.chartisme.models.train import supervised_contrastive

    embeddings = torch.nn.functional.normalize(torch.randn(3, 4), dim=-1)
    loss = supervised_contrastive(embeddings, torch.tensor([0, 1, 2]))
    assert float(loss) == 0.0


@needs_torch
def test_predict_svgformer_abstains_below_the_floor() -> None:
    """Une annotation sûre d'elle et fausse coûte plus cher que pas d'annotation."""
    from synchro.chartisme.models import svgformer as S
    from synchro.chartisme.models.train import predict_svgformer

    rows = encode_all(_samples(per_class=2))
    model = S.build(FIGURE_IDS, dim=32, heads=2, path_layers=1, group_layers=1)
    model.eval()
    top1, top3, scores = predict_svgformer(model, rows, FIGURE_IDS)
    assert len(top1) == len(top3) == len(scores) == len(rows)
    assert all(0.0 <= s <= 1.0 for s in scores)
    assert all(len(names) <= 3 for names in top3)
    # Un modèle non entraîné est partout sous le plancher.
    abstained, _, _ = predict_svgformer(model, rows, FIGURE_IDS, abstain=0.99)
    assert set(abstained) == {"__abstain__"}


@needs_torch
def test_weights_round_trip(tmp_path) -> None:
    """Les poids rechargés doivent rendre exactement les mêmes logits.

    L'architecture est relue du fichier : des poids entraînés avec une autre
    profondeur que celle du module doivent rester chargeables, sinon un
    changement de valeur par défaut les rendrait illisibles.
    """
    import torch

    from synchro.chartisme.models import svgformer as S
    from synchro.chartisme.models.train import load, save

    model = S.build(FIGURE_IDS, dim=32, heads=2, path_layers=1, group_layers=1, proj_dim=16)
    model.eval()
    path = save(model, "svgformer", directory=tmp_path)
    assert path.exists()
    again = load("svgformer", directory=tmp_path)
    assert again is not None
    assert again.classes == list(FIGURE_IDS)
    assert again.config() == model.config()
    batch = S.collate(encode_all(_samples(per_class=1)))
    with torch.no_grad():
        before = model(**_inputs(batch))["logits"]
        after = again(**_inputs(batch))["logits"]
    assert bool((before - after).abs().max() < 1e-6)
    assert load("absent", directory=tmp_path) is None


@needs_torch
def test_saved_config_describes_the_whole_architecture() -> None:
    """Tout ce qui détermine une forme de tenseur doit être écrit dans le fichier."""
    from synchro.chartisme.models import svgformer as S

    config = S.build(FIGURE_IDS, dim=32, heads=2, path_layers=3, group_layers=1).config()
    assert config["kind"] == "svgformer"
    assert config["dim"] == 32
    assert config["heads"] == 2
    assert config["path_layers"] == 3
    assert config["group_layers"] == 1
    assert config["proj_dim"] == S.DEFAULT_PROJ_DIM


@needs_pyg
def test_gnn_weights_round_trip(tmp_path) -> None:
    import torch

    from synchro.chartisme.models import gnn as G
    from synchro.chartisme.models.train import load, save

    model = G.build(FIGURE_IDS, dim=32, layers=2, proj_dim=16)
    model.eval()
    save(model, "gnn", directory=tmp_path)
    again = load("gnn", directory=tmp_path)
    assert again is not None
    assert again.config() == model.config()
    data = G.to_dataset(encode_all(_samples(per_class=1)), FIGURE_IDS)
    batch = next(iter(G.loader(data, batch_size=len(data), shuffle=False)))
    with torch.no_grad():
        assert bool((model(batch)["logits"] - again(batch)["logits"]).abs().max() < 1e-6)


@needs_pyg
def test_gnn_forward_reads_the_graph() -> None:
    from synchro.chartisme.models import gnn as G

    rows = encode_all(_samples(per_class=2))
    data = G.to_dataset(rows, FIGURE_IDS)
    assert len(data) == len(rows)
    model = G.build(FIGURE_IDS, dim=32, layers=2)
    model.eval()
    batch = next(iter(G.loader(data, batch_size=len(data), shuffle=False)))
    out = model(batch)
    assert out["logits"].shape == (len(data), len(FIGURE_IDS))
    assert out["breakout"].shape == (len(data),)
    assert bool(out["logits"].isfinite().all())


@needs_pyg
def test_gnn_skips_a_row_whose_class_is_unknown() -> None:
    from synchro.chartisme.models import gnn as G

    rows = encode_all(_samples(per_class=1))
    rows[0]["figure"] = "classe jamais déclarée"
    assert len(G.to_dataset(rows, FIGURE_IDS)) == len(rows) - 1


@needs_pyg
def test_gnn_tolerates_an_edgeless_graph() -> None:
    """Un graphe sans arête ferait planter l'agrégation : la boucle le sauve."""
    from synchro.chartisme.models import gnn as G

    data = G.to_data({"nodes": [], "edge_index": [[], []], "edge_attr": []}, label=0)
    model = G.build(FIGURE_IDS, dim=32, layers=2)
    model.eval()
    batch = next(iter(G.loader([data], batch_size=1, shuffle=False)))
    assert bool(model(batch)["logits"].isfinite().all())


@needs_torch
def test_a_short_training_run_writes_a_self_contained_report(tmp_path) -> None:
    """Poids et rapport doivent rester ensemble, sinon le rapport mène nulle part.

    Deux époques sur quatre classes : on vérifie la plomberie et la cohérence
    du rapport, pas la qualité de l'apprentissage.
    """
    from synchro.chartisme.models.train import run

    dataset = build_dataset(per_class=6, length=48, seed=0)
    dataset["samples"] = [s for s in dataset["samples"] if s["figure"] in FEW]
    dataset["classes"] = class_list(dataset["samples"])
    dataset["counts"] = class_counts(dataset["samples"])
    dataset["class_weights"] = class_weights(dataset["samples"], dataset["classes"])
    report = run(
        dataset,
        epochs=2,
        batch_size=8,
        with_gnn=False,
        with_dtw=False,
        directory=tmp_path,
    )
    assert report["epochs"] == 2
    assert report["train_size"] and report["val_size"]
    assert "geometric" in report["models"]
    svg = report["models"]["svgformer"]
    assert svg["parameters"] > 0
    assert len(svg["history"]) == 2
    assert svg["weights"].startswith(str(tmp_path))
    # Le rapport reste auprès de ses poids : le canonique n'est pas touché.
    written = tmp_path / "training.json"
    assert written.exists()
    assert read_report(path=written)["verdict"]["baseline"] == "geometric"


@needs_torch
def test_training_refuses_an_empty_validation_set() -> None:
    from synchro.chartisme.models.train import run

    with pytest.raises(RuntimeError, match="validation"):
        run({"classes": ["ete"], "samples": []}, epochs=1)


# --- Inférence ----------------------------------------------------------------


def test_inference_without_weights_returns_none_and_never_raises(tmp_path, monkeypatch) -> None:
    """Le principe du module : toute absence se lit `None`, jamais une erreur."""
    from synchro.chartisme.models import infer
    from synchro.chartisme.models import train as T

    monkeypatch.setattr(T, "WEIGHTS_DIR", tmp_path / "vide")
    monkeypatch.setattr(T, "REPORT_PATH", tmp_path / "absent.json")
    infer.reset()
    values = [float(v) for v in range(48)]
    assert infer.predict(values) is None
    assert infer.predict(values, model="gnn") is None
    assert infer.embed(values) is None
    state = infer.ready()
    assert state["svgformer"] is False
    assert state["gnn"] is False
    assert state["trained_at"] is None
    infer.reset()


def test_annotate_survives_without_any_network(tmp_path, monkeypatch) -> None:
    """La lecture géométrique doit passer entière même sans un réseau chargé."""
    from synchro.chartisme.figures import detect_figures
    from synchro.chartisme.models import infer
    from synchro.chartisme.models import train as T

    monkeypatch.setattr(T, "WEIGHTS_DIR", tmp_path / "vide")
    infer.reset()
    sample = _samples(per_class=1)[0]
    hits = detect_figures(sample["values"], activity=sample["activity"])
    out = infer.annotate(hits, sample["values"], activity=sample["activity"])
    assert out["geometric"] == (hits[0]["figure"] if hits else None)
    assert out["models"] == {}
    assert out["agreement"] == 0
    # Sans avis, il n'y a pas de consensus — surtout pas un consensus vide.
    assert out["consensus"] is False
    infer.reset()
