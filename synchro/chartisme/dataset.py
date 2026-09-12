"""Assemblage du jeu d'entraînement : synthétique, étiquettes faibles, tiennes.

Trois sources, trois rôles :

- le **synthétique** donne le volume. Des dizaines d'annotations à la main ne
  suffiraient pas à entraîner quoi que ce soit ;
- les **étiquettes faibles** sont les détections géométriques à forte confiance
  sur l'archive. Elles ancrent le modèle dans les vraies courbes, mais elles
  portent aussi les erreurs du détecteur : un modèle entraîné sur elles seules
  ne saurait que l'imiter. D'où leur poids réduit ;
- **tes étiquettes** sont la référence. Elles partent d'abord en validation :
  un score mesuré sur les étiquettes faibles ne mesurerait que l'accord avec
  le détecteur, pas la justesse.
"""

from __future__ import annotations

import random
from typing import Any, Iterable, Sequence

from synchro.chartisme.catalog import FIGURE_IDS
from synchro.chartisme.graph import build_graph
from synchro.chartisme.pivots import swing_pivots
from synchro.chartisme.scan import windows_for_training
from synchro.chartisme.svgpath import build_group, resample_values, tokenize_group
from synchro.chartisme.synth import DEFAULT_LENGTH, make_dataset, windows_from_curve

# Le synthétique est propre mais artificiel, le faible est réel mais approximatif,
# le tien est rare et juste. Les poids reflètent cette hiérarchie de confiance.
SOURCE_WEIGHTS = {"synth": 1.0, "weak": 0.5, "user": 3.0, "real": 1.0}
DEFAULT_VAL_RATIO = 0.2
MIN_LENGTH = 16


def _clean(values: Sequence[float]) -> list[float]:
    return [float(v) for v in values if v is not None]


def make_sample_row(
    figure: str,
    values: Sequence[float],
    *,
    activity: Sequence[float] | None = None,
    source: str = "synth",
    length: int = DEFAULT_LENGTH,
    **extra: Any,
) -> dict[str, Any] | None:
    """Une ligne de jeu de données, ramenée à la longueur commune."""
    cleaned = _clean(values)
    if len(cleaned) < MIN_LENGTH:
        return None
    act = _clean(activity or [])
    row = {
        "figure": figure,
        "values": resample_values(cleaned, length),
        "activity": resample_values(act, length) if len(act) >= 2 else [],
        "source": source,
        "weight": SOURCE_WEIGHTS.get(source, 1.0),
    }
    row.update(extra)
    return row


def weak_labels(
    bundle: dict[str, Any],
    hits: Sequence[dict[str, Any]],
    *,
    min_confidence: float = 0.7,
    length: int = DEFAULT_LENGTH,
    per_figure: int | None = 400,
    seed: int = 0,
) -> list[dict[str, Any]]:
    """Détections géométriques sûres, converties en fenêtres étiquetées."""
    by_curve: dict[str, list[dict[str, Any]]] = {}
    for hit in hits:
        if hit.get("confidence", 0.0) < min_confidence:
            continue
        by_curve.setdefault(str(hit.get("curve_id")), []).append(hit)
    rows: list[dict[str, Any]] = []
    for curve in bundle.get("curves") or []:
        found = by_curve.get(str(curve.get("id")))
        if not found:
            continue
        for window in windows_for_training(curve, found, size=length):
            row = make_sample_row(
                window["figure"],
                window["values"],
                activity=window.get("activity"),
                source="weak",
                length=length,
                curve_id=window.get("curve_id"),
                from_index=window.get("from_index"),
            )
            if row is not None:
                rows.append(row)
    return _cap_per_figure(rows, per_figure, seed)


def user_labels(
    labels: Iterable[dict[str, Any]],
    *,
    length: int = DEFAULT_LENGTH,
) -> list[dict[str, Any]]:
    """Étiquettes de l'atelier, telles qu'elles sortent de `chartisme_labels`."""
    rows: list[dict[str, Any]] = []
    for label in labels:
        values = label.get("window_values") or label.get("values") or []
        row = make_sample_row(
            str(label.get("figure") or "none"),
            values,
            activity=label.get("activity") or [],
            source="user",
            length=length,
            curve_id=label.get("curve_id"),
            from_index=label.get("from_index"),
            label_id=label.get("id"),
        )
        if row is not None:
            rows.append(row)
    return rows


def negatives(
    bundle: dict[str, Any],
    *,
    count: int = 600,
    length: int = DEFAULT_LENGTH,
    seed: int = 0,
) -> list[dict[str, Any]]:
    """Fenêtres réelles tirées au sort, étiquetées `none`.

    Contre-exemples indispensables : sans elles le modèle apprend à voir une
    figure partout, ce que le détecteur géométrique fait déjà trop volontiers.
    """
    curves = list(bundle.get("curves") or [])
    if not curves:
        return []
    rng = random.Random(seed)
    per_curve = max(1, count // len(curves))
    rows: list[dict[str, Any]] = []
    for index, curve in enumerate(curves):
        for window in windows_from_curve(
            curve, length=length, count=per_curve, seed=seed + index
        ):
            row = make_sample_row(
                "none",
                window["values"],
                activity=window.get("activity"),
                source="real",
                length=length,
                curve_id=window.get("curve_id"),
                from_index=window.get("from_index"),
            )
            if row is not None:
                rows.append(row)
    rng.shuffle(rows)
    return rows[:count]


def _cap_per_figure(
    rows: Sequence[dict[str, Any]],
    per_figure: int | None,
    seed: int,
) -> list[dict[str, Any]]:
    if per_figure is None:
        return list(rows)
    rng = random.Random(seed)
    buckets: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        buckets.setdefault(row["figure"], []).append(row)
    out: list[dict[str, Any]] = []
    for figure in sorted(buckets):
        pool = buckets[figure]
        out.extend(pool if len(pool) <= per_figure else rng.sample(pool, per_figure))
    return out


def class_list(samples: Sequence[dict[str, Any]]) -> list[str]:
    """Classes du catalogue, suivies des classes libres créées à l'atelier."""
    extra = sorted({s["figure"] for s in samples} - set(FIGURE_IDS))
    return [*FIGURE_IDS, *extra]


def class_counts(samples: Sequence[dict[str, Any]]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for sample in samples:
        counts[sample["figure"]] = counts.get(sample["figure"], 0) + 1
    return dict(sorted(counts.items(), key=lambda kv: -kv[1]))


def class_weights(samples: Sequence[dict[str, Any]], classes: Sequence[str]) -> list[float]:
    """Poids inverses à l'effectif, pour que les classes rares comptent."""
    counts = class_counts(samples)
    total = sum(counts.values()) or 1
    weights: list[float] = []
    for name in classes:
        n = counts.get(name, 0)
        weights.append(total / (len(classes) * n) if n else 0.0)
    return weights


def build_dataset(
    *,
    bundle: dict[str, Any] | None = None,
    hits: Sequence[dict[str, Any]] | None = None,
    labels: Iterable[dict[str, Any]] | None = None,
    per_class: int = 300,
    length: int = DEFAULT_LENGTH,
    seed: int = 0,
    include_weak: bool = True,
    include_negatives: bool = True,
) -> dict[str, Any]:
    """Le jeu complet, avec la provenance de chaque ligne."""
    samples = make_dataset(per_class=per_class, length=length, seed=seed)
    for row in samples:
        row.setdefault("weight", SOURCE_WEIGHTS["synth"])
    if bundle is not None and include_weak and hits:
        samples.extend(weak_labels(bundle, hits, length=length, seed=seed))
    if bundle is not None and include_negatives:
        samples.extend(negatives(bundle, length=length, seed=seed))
    if labels is not None:
        samples.extend(user_labels(labels, length=length))
    rng = random.Random(seed)
    rng.shuffle(samples)
    classes = class_list(samples)
    return {
        "samples": samples,
        "classes": classes,
        "length": length,
        "counts": class_counts(samples),
        "by_source": _by_source(samples),
        "class_weights": class_weights(samples, classes),
    }


def _by_source(samples: Sequence[dict[str, Any]]) -> dict[str, int]:
    out: dict[str, int] = {}
    for sample in samples:
        out[sample.get("source", "synth")] = out.get(sample.get("source", "synth"), 0) + 1
    return dict(sorted(out.items()))


def split(
    samples: Sequence[dict[str, Any]],
    *,
    val_ratio: float = DEFAULT_VAL_RATIO,
    seed: int = 0,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Découpe stratifiée. Tes étiquettes partent en validation d'abord.

    Un score mesuré sur des étiquettes faibles ne dirait qu'une chose : le
    modèle reproduit-il le détecteur. Ce n'est pas la question posée.
    """
    rng = random.Random(seed)
    train: list[dict[str, Any]] = []
    val: list[dict[str, Any]] = []
    buckets: dict[str, list[dict[str, Any]]] = {}
    for sample in samples:
        if sample.get("source") == "user":
            val.append(sample)
            continue
        buckets.setdefault(sample["figure"], []).append(sample)
    for figure in sorted(buckets):
        pool = list(buckets[figure])
        rng.shuffle(pool)
        cut = max(1, int(len(pool) * val_ratio)) if len(pool) > 4 else 0
        val.extend(pool[:cut])
        train.extend(pool[cut:])
    rng.shuffle(train)
    rng.shuffle(val)
    return train, val


def encode(
    sample: dict[str, Any],
    *,
    pips: int = 15,
    cubic: bool = True,
) -> dict[str, Any]:
    """Une ligne → les deux représentations attendues par les modèles."""
    values = [float(v) for v in sample["values"]]
    activity = [float(a) for a in sample.get("activity") or []]
    # Les enveloppes haute et basse — celles qui portent « épaules à même
    # niveau » et « résistance plate » — se construisent sur les pivots.
    swings = swing_pivots(values, [str(i) for i in range(len(values))])
    group = build_group(values, activity=activity or None, pivots=swings, k=pips, cubic=cubic)
    tokens = tokenize_group(group)
    graph = build_graph(
        values, activity=activity or None, pivots=swings, k=pips, cubic=cubic
    )
    return {
        "figure": sample["figure"],
        "weight": float(sample.get("weight", 1.0)),
        "source": sample.get("source", "synth"),
        "commands": tokens["commands"],
        "args": tokens["args"],
        "path_mask": tokens["path_mask"],
        "graph": graph,
        "breakout": bool(sample.get("breakout")),
    }


def encode_all(
    samples: Sequence[dict[str, Any]],
    **kwargs: Any,
) -> list[dict[str, Any]]:
    return [encode(sample, **kwargs) for sample in samples]


def summary(dataset: dict[str, Any]) -> dict[str, Any]:
    """Résumé lisible, pour l'API et le rapport d'entraînement."""
    samples = dataset["samples"]
    return {
        "total": len(samples),
        "classes": len(dataset["classes"]),
        "length": dataset["length"],
        "by_source": dataset["by_source"],
        "counts": dataset["counts"],
        "rarest": sorted(dataset["counts"].items(), key=lambda kv: kv[1])[:5],
    }
