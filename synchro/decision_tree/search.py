"""Recherche de l'arbre, puis preuve : le même calcul sur l'ordre détruit."""

from __future__ import annotations

from typing import Any, Callable

import numpy as np
from sklearn.model_selection import TimeSeriesSplit
from sklearn.tree import DecisionTreeClassifier

from synchro.decision_tree.questions import binarize, cut_candidates, holdout_cut
from synchro.decision_tree.windows import select_windows


class ReadingCancelled(Exception):
    """La lecture a été annulée entre deux remaniements."""


def balanced_accuracy(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    if y_true.size == 0:
        return 0.0
    scores: list[float] = []
    for cls in (0.0, 1.0):
        mask = y_true == cls
        if not np.any(mask):
            continue
        scores.append(float(np.mean(y_pred[mask] == cls)))
    if not scores:
        return 0.0
    return float(np.mean(scores))


def leaf_floor(n_train: int) -> int:
    if n_train >= 200:
        return max(20, int(0.02 * n_train))
    return max(2, int(0.05 * n_train) or 2)


def choose_params(
    x_train: np.ndarray,
    y_train: np.ndarray,
    *,
    max_depth: int = 4,
    criteria: tuple[str, ...] = ("gini", "entropy"),
    seed: int = 0,
    class_weight: str | None = None,
) -> tuple[dict[str, Any], int]:
    """Choisit profondeur et critère sur l'apprentissage seul.

    Le contrôle n'est pas dans `x_train` / `y_train` : le modifier ne change rien.
    """
    depth_max = max(2, min(4, int(max_depth)))
    depths = list(range(2, depth_max + 1))
    floor = leaf_floor(int(len(y_train)))
    n_splits = 3 if len(y_train) >= 40 else (2 if len(y_train) >= 16 else 0)
    splitter = TimeSeriesSplit(n_splits=n_splits) if n_splits else None
    best: tuple[float, float, int, str] | None = None
    fits = 0
    for depth in depths:
        for criterion in criteria:
            if splitter is None:
                score = 0.0
            else:
                fold_scores: list[float] = []
                for train_idx, valid_idx in splitter.split(x_train):
                    clf = DecisionTreeClassifier(
                        max_depth=depth,
                        criterion=criterion,
                        min_samples_leaf=min(floor, max(1, len(train_idx) // 2)),
                        class_weight=class_weight,
                        random_state=seed,
                    )
                    clf.fit(x_train[train_idx], y_train[train_idx])
                    fits += 1
                    fold_scores.append(
                        balanced_accuracy(y_train[valid_idx], clf.predict(x_train[valid_idx]))
                    )
                score = float(np.mean(fold_scores)) if fold_scores else 0.0
            rank = score - 0.01 * (depth - 2)
            if best is None or rank > best[0]:
                best = (rank, score, depth, criterion)
    assert best is not None
    _, cv_score, depth, criterion = best
    return (
        {
            "max_depth": depth,
            "criterion": criterion,
            "min_samples_leaf": floor,
            "cv_score": round(cv_score, 4),
            "class_weight": class_weight,
        },
        fits,
    )


def _choose_label(
    x: np.ndarray,
    raw: np.ndarray,
    cut: int,
    kind: str,
    sense: str,
    *,
    max_depth: int,
    criteria: tuple[str, ...],
    seed: int,
    class_weight: str | None,
) -> tuple[np.ndarray, float, list[dict[str, Any]], int]:
    """Choisit la coupe de l'étiquette sur l'apprentissage. Le contrôle ne vote pas."""
    raw_train = np.asarray(raw[:cut], dtype=float)
    finite = raw_train[np.isfinite(raw_train)]
    median = float(np.median(finite)) if finite.size else 0.0
    candidates = cut_candidates(raw_train, kind)
    best: tuple[tuple[float, float], float, np.ndarray, dict[str, Any]] | None = None
    scores: list[dict[str, Any]] = []
    fits = 0
    x_train = x[:cut]
    for threshold in candidates:
        y_all = binarize(raw, threshold, sense)
        y_train = y_all[:cut]
        share = float(np.mean(y_train)) if y_train.size else 0.0
        if len(np.unique(y_train)) < 2:
            scores.append(
                {
                    "threshold": round(float(threshold), 6),
                    "share": round(share, 4),
                    "cv_score": None,
                    "chosen": False,
                }
            )
            continue
        params, n_fits = choose_params(
            x_train,
            y_train,
            max_depth=max_depth,
            criteria=criteria,
            seed=seed,
            class_weight=class_weight,
        )
        fits += n_fits
        cv_score = float(params["cv_score"])
        row = {
            "threshold": round(float(threshold), 6),
            "share": round(share, 4),
            "cv_score": cv_score,
            "chosen": False,
        }
        scores.append(row)
        rank = (cv_score, -abs(float(threshold) - median))
        if best is None or rank > best[0]:
            best = (rank, float(threshold), y_all, row)
    if best is None:
        raise ValueError("Aucune coupe n'a deux classes dans l'apprentissage.")
    best[3]["chosen"] = True
    return best[2], float(best[1]), scores, fits


def fit_holdout(
    x: np.ndarray,
    y: np.ndarray,
    *,
    max_depth: int = 4,
    criteria: tuple[str, ...] = ("gini", "entropy"),
    seed: int = 0,
    class_weight: str | None = None,
    raw: np.ndarray | None = None,
    label_cut: str | None = None,
    label_kind: str | None = None,
    label_sense: str | None = None,
    feature_names: list[str] | None = None,
    window_mode: str | None = None,
) -> dict[str, Any]:
    learned_label = label_cut == "learned"
    n = len(raw) if learned_label and raw is not None else len(y)
    if n < 24:
        raise ValueError(f"Pas assez de lignes de flux ({n}).")
    if not learned_label and len(np.unique(y)) < 2:
        raise ValueError("Une seule classe dans le flux : rien à couper.")
    cut = holdout_cut(n)
    feature_index = None
    windows_report = None
    names = list(feature_names) if feature_names is not None else None
    label_fits = 0
    if window_mode == "learned":
        if names is None or raw is None:
            raise ValueError("La sélection de fenêtres demande les noms et la série brute.")
        feature_index, windows_report = select_windows(
            x,
            raw,
            names,
            train_end=cut,
            min_leaf=leaf_floor(cut),
        )
        if not feature_index:
            raise ValueError("Aucune fenêtre retenue.")
        x = np.asarray(x)[:, feature_index]
        names = [names[i] for i in feature_index]
    if learned_label:
        if raw is None:
            raise ValueError("La coupe apprise demande la série brute.")
        kind = label_kind or "sum"
        sense = label_sense or ("le" if kind == "n1_low" else "ge")
        y, label_threshold, cut_scores, label_fits = _choose_label(
            x,
            np.asarray(raw, dtype=float),
            cut,
            kind,
            sense,
            max_depth=max_depth,
            criteria=criteria,
            seed=seed,
            class_weight=class_weight,
        )
    else:
        label_threshold = None
        cut_scores = None
    x_train, y_train = x[:cut], y[:cut]
    x_test, y_test = x[cut:], y[cut:]
    if len(np.unique(y_train)) < 2:
        raise ValueError("L'apprentissage ne contient qu'une classe.")
    params, fits = choose_params(
        x_train,
        y_train,
        max_depth=max_depth,
        criteria=criteria,
        seed=seed,
        class_weight=class_weight,
    )
    fits += label_fits
    clf = DecisionTreeClassifier(
        max_depth=int(params["max_depth"]),
        criterion=str(params["criterion"]),
        min_samples_leaf=int(params["min_samples_leaf"]),
        class_weight=class_weight,
        random_state=seed,
    )
    clf.fit(x_train, y_train)
    fits += 1
    pred = clf.predict(x_test) if len(y_test) else np.array([])
    score = balanced_accuracy(y_test, pred) if len(y_test) else 0.0
    return {
        "clf": clf,
        "cut": cut,
        "params": params,
        "fits": fits,
        "holdout_score": float(score),
        "x_train": x_train,
        "y_train": y_train,
        "x_test": x_test,
        "y_test": y_test,
        "pred_test": pred,
        "label_threshold": label_threshold,
        "cut_scores": cut_scores,
        "feature_index": feature_index,
        "feature_names": names,
        "windows": windows_report,
    }


def permutation_p(real: float, null_scores: list[float]) -> float:
    n = len(null_scores)
    if n == 0:
        return 1.0
    beaten = sum(1 for score in null_scores if score >= real - 1e-12)
    return (1.0 + beaten) / (1.0 + n)


Progress = Callable[[str, int, int], None]


def _unpack_null(
    rebuilt: tuple[np.ndarray, ...],
    *,
    learned: bool,
) -> tuple[np.ndarray, np.ndarray, np.ndarray | None]:
    if len(rebuilt) == 3:
        return rebuilt[0], rebuilt[1], rebuilt[2]
    if learned and len(rebuilt) == 2:
        x_null, raw_null = rebuilt
        return x_null, raw_null, raw_null
    return rebuilt[0], rebuilt[1], None


def prove(
    x: np.ndarray,
    y: np.ndarray,
    *,
    rebuild: Callable[[np.random.Generator], tuple[np.ndarray, ...]] | None,
    permutations: int,
    seed: int,
    max_depth: int,
    criteria: tuple[str, ...],
    class_weight: str | None,
    null: str,
    progress: Progress | None = None,
    raw: np.ndarray | None = None,
    label_cut: str | None = None,
    label_kind: str | None = None,
    label_sense: str | None = None,
    feature_names: list[str] | None = None,
    window_mode: str | None = None,
) -> dict[str, Any]:
    """Ajuste l'arbre, puis rejoue la recherche N fois sur le nul."""

    def tick(stage: str, k: int = 0, n: int = 0) -> None:
        if progress:
            progress(stage, k, n)

    learned = label_cut == "learned"
    tick("recherche", 0, 1)
    fitted = fit_holdout(
        x,
        y,
        max_depth=max_depth,
        criteria=criteria,
        seed=seed,
        class_weight=class_weight,
        raw=raw,
        label_cut=label_cut,
        label_kind=label_kind,
        label_sense=label_sense,
        feature_names=feature_names,
        window_mode=window_mode,
    )
    real = float(fitted["holdout_score"])
    search_fits = int(fitted["fits"])
    rng = np.random.default_rng(seed + 1)
    null_scores: list[float] = []
    permutation_fits = 0
    total = max(0, int(permutations))
    for k in range(total):
        tick("remaniements", k, total)
        if null == "shuffle_labels" or rebuild is None:
            y_null = rng.permutation(y)
            x_null = x
            raw_null = rng.permutation(raw) if learned and raw is not None else None
        else:
            x_null, y_null, raw_null = _unpack_null(tuple(rebuild(rng)), learned=learned)
        if learned:
            if raw_null is None or len(raw_null) < 24:
                null_scores.append(0.0)
                continue
        elif len(y_null) < 24 or len(np.unique(y_null)) < 2:
            null_scores.append(0.0)
            continue
        try:
            again = fit_holdout(
                x_null,
                y_null,
                max_depth=max_depth,
                criteria=criteria,
                seed=seed,
                class_weight=class_weight,
                raw=raw_null,
                label_cut=label_cut,
                label_kind=label_kind,
                label_sense=label_sense,
                feature_names=feature_names,
                window_mode=window_mode,
            )
        except ValueError:
            null_scores.append(0.0)
            continue
        null_scores.append(float(again["holdout_score"]))
        permutation_fits += int(again["fits"])
    tick("remaniements", total, total)
    p_value = permutation_p(real, null_scores)
    null_mean = float(np.mean(null_scores)) if null_scores else 0.0
    return {
        "fitted": fitted,
        "holdout_score": real,
        "null_scores": [round(score, 4) for score in null_scores],
        "null_mean": round(null_mean, 4),
        "p": round(p_value, 4),
        "beats_independence": bool(p_value <= 0.05),
        "search_fits": search_fits,
        "permutation_fits": permutation_fits,
        "permutations": len(null_scores),
    }
