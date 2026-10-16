"""Chemins racine → feuille, avec le contrôle hors échantillon de chaque feuille."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

import numpy as np

if TYPE_CHECKING:
    from sklearn.tree import DecisionTreeClassifier


def dump_tree(clf: DecisionTreeClassifier) -> dict[str, Any]:
    tree = clf.tree_
    nodes = []
    for i in range(tree.node_count):
        nodes.append(
            {
                "id": int(i),
                "feature": int(tree.feature[i]),
                "threshold": float(tree.threshold[i]),
                "left": int(tree.children_left[i]),
                "right": int(tree.children_right[i]),
                "value": [float(v) for v in tree.value[i][0]],
            }
        )
    return {"nodes": nodes}


def _leaf_ids(clf: DecisionTreeClassifier, x: np.ndarray) -> np.ndarray:
    if len(x) == 0:
        return np.array([], dtype=int)
    return clf.apply(x)


def _rate(y: np.ndarray, predicted: int) -> float | None:
    if y.size == 0:
        return None
    return float(np.mean(y == predicted))


def export_rules(
    clf: DecisionTreeClassifier,
    feature_names: list[str],
    feature_labels: dict[str, str],
    class_names: list[str],
    x_train: np.ndarray,
    y_train: np.ndarray,
    x_test: np.ndarray,
    y_test: np.ndarray,
    *,
    null_mean: float,
) -> list[dict[str, Any]]:
    tree = clf.tree_
    train_leaves = _leaf_ids(clf, x_train)
    test_leaves = _leaf_ids(clf, x_test)
    rules: list[dict[str, Any]] = []

    def walk(node: int, path: list[dict[str, Any]]) -> None:
        left = int(tree.children_left[node])
        right = int(tree.children_right[node])
        if left == right:
            counts = tree.value[node][0]
            total = float(np.sum(counts)) or 1.0
            predicted = int(np.argmax(counts))
            train_mask = train_leaves == node
            test_mask = test_leaves == node
            y_tr = y_train[train_mask] if y_train.size else y_train
            y_te = y_test[test_mask] if y_test.size else y_test
            holdout_rate = _rate(y_te, predicted)
            weak = bool(holdout_rate is not None and holdout_rate + 1e-12 < null_mean)
            rules.append(
                {
                    "node": int(node),
                    "path": path,
                    "predicted": predicted,
                    "class_name": class_names[predicted] if predicted < len(class_names) else str(predicted),
                    "train_n": int(train_mask.sum()) if train_leaves.size else 0,
                    "train_rate": _rate(y_tr, predicted),
                    "holdout_n": int(test_mask.sum()) if test_leaves.size else 0,
                    "holdout_rate": holdout_rate,
                    "samples": int(total) if total >= 1 else int(train_mask.sum()),
                    "share": round(float(counts[predicted]) / total, 4),
                    "weak": weak,
                    "positive": predicted == 1,
                }
            )
            return
        feature = int(tree.feature[node])
        name = feature_names[feature] if 0 <= feature < len(feature_names) else f"f{feature}"
        threshold = float(tree.threshold[node])
        label = feature_labels.get(name, name)
        walk(
            left,
            path + [_split(node, name, label, "le", threshold)],
        )
        walk(
            right,
            path + [_split(node, name, label, "gt", threshold)],
        )

    walk(0, [])
    rules.sort(key=lambda row: (not row["positive"], -(row["holdout_rate"] or 0), -row["train_n"]))
    return rules


def _split(node: int, name: str, label: str, sense: str, threshold: float) -> dict[str, Any]:
    return {
        "node": int(node),
        "feature": name,
        "label": label,
        "sense": sense,
        "threshold": round(threshold, 2),
        "text": f"{label} {'≤' if sense == 'le' else '>'} {threshold:.2f}",
    }


def tree_text(clf: DecisionTreeClassifier, feature_names: list[str]) -> str:
    from sklearn.tree import export_text

    return export_text(clf, feature_names=feature_names, decimals=2, show_weights=True)
