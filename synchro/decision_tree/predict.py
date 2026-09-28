"""Marcheur JSON : predict sans pickle, sur le dernier état du flux."""

from __future__ import annotations

from typing import Any


def predict_row(tree: dict[str, Any], row: list[float], feature_names: list[str] | None = None) -> dict[str, Any]:
    nodes = {int(node["id"]): node for node in tree.get("nodes") or []}
    if not nodes:
        raise ValueError("Arbre vide.")
    node = nodes[0]
    path: list[dict[str, Any]] = []
    while int(node["feature"]) >= 0 and int(node["left"]) != int(node["right"]):
        feature = int(node["feature"])
        threshold = float(node["threshold"])
        value = float(row[feature])
        sense = "le" if value <= threshold else "gt"
        child = int(node["left"] if sense == "le" else node["right"])
        name = feature_names[feature] if feature_names and feature < len(feature_names) else str(feature)
        path.append(
            {
                "node": int(node["id"]),
                "feature": name,
                "sense": sense,
                "threshold": round(threshold, 2),
                "value": round(value, 4),
            }
        )
        node = nodes[child]
    counts = [float(v) for v in node["value"]]
    total = sum(counts) or 1.0
    proba = [count / total for count in counts]
    predicted = int(max(range(len(proba)), key=lambda i: proba[i])) if proba else 0
    return {
        "leaf": int(node["id"]),
        "predicted": predicted,
        "proba": [round(p, 4) for p in proba],
        "path": path,
    }
