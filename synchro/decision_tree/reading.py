"""Une lecture : tableau, recherche, remaniements, dessin, règles."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Callable, Sequence

import numpy as np

from synchro.decision_tree.draft import chartisme_rules, draft_specialists
from synchro.decision_tree.drawing import render_trees
from synchro.decision_tree.predict import predict_row
from synchro.decision_tree.questions import build_question, feature_labels, label_phrase
from synchro.decision_tree.rules import dump_tree, export_rules
from synchro.decision_tree.search import ReadingCancelled, prove
from synchro.decision_tree.store import new_slug, save_reading

Progress = Callable[[str, int, int], None]


def _fr_p(value: float) -> str:
    return f"{value:.2f}".replace(".", ",")


def verdict_text(holdout: float, null_mean: float, p_value: float, beats: bool) -> str:
    if beats:
        return (
            f"Le flux porte un seuil : {holdout:.2f} sur le contrôle, "
            f"contre {null_mean:.2f} en moyenne sur l'ordre détruit (p = {_fr_p(p_value)})."
        )
    return f"Aucun seuil de flux sur cette question (p = {_fr_p(p_value)})."


def _sanitize(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): _sanitize(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_sanitize(item) for item in value]
    if isinstance(value, np.ndarray):
        return _sanitize(value.tolist())
    if isinstance(value, np.floating):
        number = float(value)
        return None if number != number else number
    if isinstance(value, np.integer):
        return int(value)
    if isinstance(value, float) and value != value:
        return None
    return value


def read_flux(
    draws: list[dict[str, Any]],
    question: str,
    *,
    label: str | None = None,
    series: str | None = None,
    include_stars: bool = True,
    curves: Sequence[str] | None = None,
    chartisme_records: Sequence[dict[str, Any]] | None = None,
    max_depth: int = 4,
    criterion: str | None = None,
    permutations: int | None = None,
    seed: int = 0,
    era: str = "current",
    weekday: str | None = None,
    on_progress: Progress | None = None,
    root: Any = None,
) -> dict[str, Any]:
    def tick(stage: str, k: int = 0, n: int = 0) -> None:
        if on_progress:
            on_progress(stage, k, n)

    tick("tableau", 0, 1)
    table = build_question(
        draws,
        question,
        label=label,
        series=series,
        include_stars=include_stars,
        curves=curves,
        chartisme_records=chartisme_records,
    )
    names = list(table["feature_names"])
    labels = feature_labels(names, series=table.get("series"))
    criteria = (criterion,) if criterion in {"gini", "entropy"} else ("gini", "entropy")
    n_perm = int(permutations) if permutations is not None else (49 if question == "balls" else 99)
    null = str(table.get("null") or "shuffle_draws")

    def rebuild(rng: np.random.Generator):
        order = rng.permutation(len(draws))
        shuffled = [draws[int(i)] for i in order]
        again = build_question(
            shuffled,
            question,
            label=table.get("label"),
            series=table.get("series"),
            include_stars=include_stars,
            curves=curves,
            chartisme_records=None if question != "chartisme" else chartisme_records,
        )
        return again["x"], again["y"]

    proof = prove(
        table["x"],
        table["y"],
        rebuild=rebuild if null == "shuffle_draws" else None,
        permutations=n_perm,
        seed=seed,
        max_depth=max_depth,
        criteria=criteria,
        class_weight=table.get("class_weight"),
        null=null,
        progress=tick,
    )
    fitted = proof["fitted"]
    clf = fitted["clf"]
    names_fr = [labels[name] for name in names]
    rules = export_rules(
        clf,
        names,
        labels,
        list(table["class_names"]),
        fitted["x_train"],
        fitted["y_train"],
        fitted["x_test"],
        fitted["y_test"],
        null_mean=float(proof["null_mean"]),
    )
    tree = dump_tree(clf)
    latest_row = table["x"][-1].tolist() if len(table["x"]) else []
    latest_date = table["dates"][-1] if table.get("dates") else None
    tick("dessin", 0, 1)
    slug = new_slug(question, str(table.get("label") or question))
    from synchro.decision_tree.store import reading_dir

    directory = reading_dir(slug, root=root)
    directory.mkdir(parents=True, exist_ok=True)
    drawn = render_trees(
        clf,
        fitted["x_train"],
        fitted["y_train"],
        names_fr,
        list(table["class_names"]),
        case=latest_row or None,
        title=label_phrase(question, str(table.get("label") or ""), threshold=table.get("threshold")),
        tree_path=directory / "tree.svg",
        case_path=directory / "case.svg",
    )
    phrase = label_phrase(
        question, str(table.get("label") or ""), threshold=table.get("threshold")
    )
    beats = bool(proof["beats_independence"])
    text = verdict_text(
        float(proof["holdout_score"]),
        float(proof["null_mean"]),
        float(proof["p"]),
        beats,
    )
    ball_scores = _ball_scores(table, tree, names)
    case = _case_prediction(tree, names, labels, list(table["class_names"]), question, latest_row)
    report: dict[str, Any] = {
        "ok": True,
        "slug": slug,
        "question": question,
        "label": table.get("label"),
        "series": table.get("series"),
        "phrase": phrase,
        "era": era,
        "weekday": weekday,
        "include_stars": include_stars,
        "beats_independence": beats,
        "verdict": "flux" if beats else "aucun",
        "verdict_text": text,
        "p": proof["p"],
        "holdout_score": round(float(proof["holdout_score"]), 4),
        "null_mean": proof["null_mean"],
        "null_scores": proof["null_scores"],
        "permutations": proof["permutations"],
        "criterion": fitted["params"]["criterion"],
        "max_depth": fitted["params"]["max_depth"],
        "min_samples_leaf": fitted["params"]["min_samples_leaf"],
        "cv_score": fitted["params"]["cv_score"],
        "train_n": int(fitted["cut"]),
        "holdout_n": int(len(fitted["y_test"])),
        "class_names": list(table["class_names"]),
        "feature_names": names,
        "feature_labels": labels,
        "rules": rules,
        "tree": tree,
        "latest": {"x": [round(float(v), 6) for v in latest_row], "date": latest_date},
        "threshold": table.get("threshold"),
        "sense": table.get("sense"),
        "draw_count": len(draws),
        "from_date": table["dates"][0] if table.get("dates") else None,
        "to_date": table["dates"][-1] if table.get("dates") else None,
        "search_fits": proof["search_fits"],
        "permutation_fits": proof["permutation_fits"],
        "drawing": drawn["engine"],
        "drawing_error": drawn.get("drawing_error"),
        "tree_svg": drawn.get("tree_svg"),
        "case_svg": drawn.get("case_svg"),
        "path_svg": drawn.get("path_svg"),
        "tree_text": drawn.get("tree_text"),
        "ball_scores": ball_scores,
        "case": case,
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    report["drafts"] = draft_specialists(report)
    report["chartisme_rules"] = chartisme_rules(report)
    report["suggestions"] = _suggestions(question, str(table.get("label") or ""))
    save_reading(_sanitize(report), root=root)
    return _sanitize(report)


def _case_prediction(
    tree: dict[str, Any],
    names: list[str],
    labels: dict[str, str],
    class_names: list[str],
    question: str,
    latest_row: list[float],
) -> dict[str, Any] | None:
    if not latest_row:
        return None
    try:
        return predict_latest(
            {
                "tree": tree,
                "latest": {"x": latest_row},
                "feature_names": names,
                "feature_labels": labels,
                "class_names": class_names,
                "question": question,
            }
        )
    except ValueError:
        return None


def _ball_scores(table: dict[str, Any], tree: dict[str, Any], names: list[str]) -> list[dict[str, Any]]:
    latest = table.get("latest_by_ball") or {}
    scores = []
    for ball, row in sorted(latest.items()):
        try:
            pred = predict_row(tree, [float(v) for v in row], names)
        except ValueError:
            continue
        proba = pred["proba"]
        scores.append(
            {
                "ball": int(ball),
                "proba": proba[1] if len(proba) > 1 else 0.0,
                "leaf": pred["leaf"],
            }
        )
    return scores


def _suggestions(question: str, label: str) -> list[dict[str, str]]:
    if question == "balls":
        return [
            {"question": "shape", "label": "sum_high", "text": "Lire la somme du flux"},
            {"question": "series", "series": "parity", "text": "Lire la parité"},
        ]
    if question == "chartisme":
        return [
            {"question": "shape", "label": "sum_high", "text": "Lire la somme du flux"},
            {"question": "balls", "text": "Lire les boules"},
        ]
    if question == "series":
        other = "sum" if label == "parity" else "parity"
        return [
            {"question": "series", "series": other, "text": f"Lire {other}"},
            {"question": "shape", "label": "sum_high", "text": "Lire toutes les séries"},
        ]
    other = "parity_high" if label != "parity_high" else "n1_low"
    return [
        {"question": "shape", "label": other, "text": "Changer la forme demandée"},
        {"question": "series", "series": "sum", "text": "Lire seulement la somme"},
    ]


def predict_latest(report: dict[str, Any], row: list[float] | None = None) -> dict[str, Any]:
    latest = row if row is not None else (report.get("latest") or {}).get("x") or []
    if not latest:
        raise ValueError("Pas d'état de flux à classer.")
    names = list(report.get("feature_names") or [])
    pred = predict_row(report["tree"], [float(v) for v in latest], names)
    labels = report.get("feature_labels") or {}
    for step in pred["path"]:
        step["label"] = labels.get(step["feature"], step["feature"])
        sense = "≤" if step["sense"] == "le" else ">"
        step["text"] = f"{step['label']} {sense} {float(step['threshold']):.2f}"
    classes = report.get("class_names") or []
    predicted = int(pred["predicted"])
    pred["class_name"] = classes[predicted] if predicted < len(classes) else str(predicted)
    pred["question"] = report.get("question")
    return pred


__all__ = ["ReadingCancelled", "predict_latest", "read_flux", "verdict_text"]
