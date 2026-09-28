"""Une fenêtre par série et par indicateur, choisie sur l'apprentissage seul.

Chaque période candidate est notée par un arbre à une coupe (réduction
d'erreur quadratique hors pli). On ne quitte la période habituelle que si
une autre fait mieux d'au moins un écart-type entre les plis.
"""

from __future__ import annotations

from typing import Any, Sequence

import numpy as np
from sklearn.model_selection import TimeSeriesSplit

from synchro.decision_tree.measures import parse_feature_name
from synchro.decision_tree.questions import SERIES_FR


def _stump_reduction(
    x_train: np.ndarray,
    y_train: np.ndarray,
    x_valid: np.ndarray,
    y_valid: np.ndarray,
    min_leaf: int,
) -> float:
    """Réduction relative d'erreur quadratique d'une coupe, sur le pli."""
    x_train = np.asarray(x_train, dtype=float)
    y_train = np.asarray(y_train, dtype=float)
    x_valid = np.asarray(x_valid, dtype=float)
    y_valid = np.asarray(y_valid, dtype=float)
    n = int(len(y_train))
    floor = max(1, int(min_leaf))
    if n < 2 * floor or len(y_valid) == 0:
        return 0.0
    if not np.isfinite(x_train).all() or not np.isfinite(y_train).all():
        return 0.0
    order = np.argsort(x_train, kind="mergesort")
    xs = x_train[order]
    ys = y_train[order]
    if float(xs[0]) == float(xs[-1]):
        return 0.0
    csum = np.cumsum(ys)
    csum2 = np.cumsum(ys * ys)
    ks = np.arange(floor, n - floor + 1)
    change = xs[ks - 1] < xs[ks]
    if not np.any(change):
        return 0.0
    ks = ks[change]
    left_sum = csum[ks - 1]
    left_sum2 = csum2[ks - 1]
    right_n = n - ks
    right_sum = csum[-1] - left_sum
    right_sum2 = csum2[-1] - left_sum2
    left_sse = np.maximum(0.0, left_sum2 - left_sum * left_sum / ks)
    right_sse = np.maximum(0.0, right_sum2 - right_sum * right_sum / right_n)
    best = int(np.argmin(left_sse + right_sse))
    k = int(ks[best])
    left_mean = float(left_sum[best] / k)
    right_mean = float(right_sum[best] / (n - k))
    threshold = 0.5 * (float(xs[k - 1]) + float(xs[k]))
    pred = np.where(x_valid <= threshold, left_mean, right_mean)
    resid = y_valid - pred
    sse_model = float(np.dot(resid, resid))
    mu = float(np.mean(y_train))
    null = y_valid - mu
    sse_null = float(np.dot(null, null))
    if sse_null <= 1e-12:
        return 0.0
    return (sse_null - sse_model) / sse_null


def _finite_rows(x: np.ndarray, y: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    if len(y) == 0:
        return x, y
    ok = np.isfinite(y)
    if x.ndim == 2 and x.shape[1]:
        ok = ok & np.all(np.isfinite(x), axis=1)
    return x[ok], y[ok]


def _entry(name: str, info: dict[str, Any], scores: list[dict[str, Any]]) -> dict[str, Any]:
    series = info.get("series") or ""
    series_fr = SERIES_FR.get(series, series)
    label = info.get("label") or info.get("stem")
    title = f"{series_fr} · {label}" if series_fr else str(label)
    period = info.get("period")
    default = info.get("default")
    lag = None if period is None else (float(period) - 1.0) / 2.0
    return {
        "series": series or None,
        "measure": info.get("stem"),
        "label": title,
        "period": None if period is None else int(period),
        "default": None if default is None else int(default),
        "kept": name,
        "changed": bool(period is not None and default is not None and int(period) != int(default)),
        "lag": lag,
        "scores": scores,
    }


def select_windows(
    x: np.ndarray,
    target: np.ndarray,
    names: Sequence[str],
    *,
    train_end: int,
    min_leaf: int,
) -> tuple[list[int], list[dict[str, Any]]]:
    """Indices gardés dans `x`, et le rapport (période, défaut, score par fenêtre).

    `train_end` est la fin de l'apprentissage : le contrôle n'est pas lu.
    """
    matrix = np.asarray(x, dtype=float)
    raw = np.asarray(target, dtype=float)
    if matrix.ndim == 1:
        matrix = matrix.reshape(-1, 1)
    limit = max(0, min(int(train_end), len(raw), len(matrix)))
    train_x, train_y = _finite_rows(matrix[:limit], raw[:limit])
    parsed = [parse_feature_name(str(name)) for name in names]
    groups: dict[tuple[Any, ...], list[int]] = {}
    order: list[tuple[Any, ...]] = []
    for index, info in enumerate(parsed):
        key = tuple(info["group"])
        if key not in groups:
            groups[key] = []
            order.append(key)
        groups[key].append(index)

    scored = [index for index, info in enumerate(parsed) if info["windowed"] and index < matrix.shape[1]]
    fold_scores: dict[int, list[float]] = {index: [] for index in scored}
    n = len(train_y)
    n_splits = 3 if n >= 40 else (2 if n >= 16 else 0)
    if n_splits and scored:
        splitter = TimeSeriesSplit(n_splits=n_splits)
        for train_idx, valid_idx in splitter.split(np.arange(n)):
            floor = min(max(1, int(min_leaf)), max(1, len(train_idx) // 2))
            y_train = train_y[train_idx]
            y_valid = train_y[valid_idx]
            for index in scored:
                fold_scores[index].append(
                    _stump_reduction(
                        train_x[train_idx, index],
                        y_train,
                        train_x[valid_idx, index],
                        y_valid,
                        floor,
                    )
                )

    def mean_std(index: int) -> tuple[float, float]:
        arr = np.array(fold_scores.get(index) or [0.0], dtype=float)
        mean = float(np.mean(arr)) if arr.size else 0.0
        std = float(np.std(arr, ddof=1)) if arr.size > 1 else 0.0
        return mean, std

    kept: list[int] = []
    report: list[dict[str, Any]] = []
    for key in order:
        indexes = [index for index in groups[key] if index < matrix.shape[1]]
        if not indexes:
            continue
        info = parsed[indexes[0]]
        if not info["windowed"] or len(indexes) == 1:
            chosen = indexes[0]
            kept.append(chosen)
            if info["windowed"]:
                mean, _std = mean_std(chosen)
                period = parsed[chosen].get("period")
                report.append(
                    _entry(
                        str(names[chosen]),
                        parsed[chosen],
                        [] if period is None else [{"period": int(period), "score": round(mean, 4)}],
                    )
                )
            continue
        means = [mean_std(index)[0] for index in indexes]
        stds = [mean_std(index)[1] for index in indexes]
        best_local = int(np.argmax(means))
        best_mean = means[best_local]
        std_best = stds[best_local]
        default_local = None
        for local, index in enumerate(indexes):
            period = parsed[index].get("period")
            default = parsed[index].get("default")
            if period is not None and default is not None and int(period) == int(default):
                default_local = local
                break
        chosen_local = best_local
        # Un score ≤ 0 ne bat pas la moyenne du tirage : aucune fenêtre n'a appris.
        # Sinon on ne quitte la période habituelle que si l'écart dépasse un écart-type des plis.
        if default_local is not None and (
            best_mean <= 0.0 or means[default_local] >= best_mean - std_best - 1e-12
        ):
            chosen_local = default_local
        chosen = indexes[chosen_local]
        kept.append(chosen)
        report.append(
            _entry(
                str(names[chosen]),
                parsed[chosen],
                [
                    {"period": int(parsed[index]["period"]), "score": round(means[local], 4)}
                    for local, index in enumerate(indexes)
                    if parsed[index].get("period") is not None
                ],
            )
        )
    return kept, report


def describe_windows(names: Sequence[str]) -> list[dict[str, Any]]:
    """Périodes déjà fixées, sans score : le mode fixe ne choisit pas."""
    rows = []
    for name in names:
        info = parse_feature_name(str(name))
        if not info["windowed"]:
            continue
        period = info.get("period")
        rows.append(
            _entry(
                str(name),
                info,
                [] if period is None else [{"period": int(period), "score": 0.0}],
            )
        )
    return rows
