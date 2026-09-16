"""σ des résidus, skill vs moyenne / persistance, loi hypergéométrique pair/impair."""

from __future__ import annotations

import math
from typing import Any

import numpy as np


def sample_std(values: np.ndarray) -> float:
    arr = np.asarray(values, dtype=float).ravel()
    arr = arr[np.isfinite(arr)]
    if arr.size < 2:
        return 0.0
    return float(np.std(arr, ddof=1))


def skill_from_sigma(sigma_model: float, sigma_null: float) -> float:
    if sigma_null <= 1e-12:
        return 0.0
    return float(1.0 - sigma_model / sigma_null)


def rolling_hit_std(hits: np.ndarray, window: int = 10) -> float:
    """Écart-type glissant du taux de réussite (stabilité du pronostic)."""
    arr = np.asarray(hits, dtype=float).ravel()
    if arr.size < 2:
        return 0.0
    w = max(2, min(int(window), arr.size))
    rates = []
    for i in range(w - 1, arr.size):
        rates.append(float(arr[i - w + 1 : i + 1].mean()))
    return sample_std(np.array(rates, dtype=float))


def hypergeom_parity_pmf() -> list[float]:
    """P(K pairs) pour 5 boules parmi 50 (25 paires, 25 impaires)."""

    def comb(n: int, k: int) -> int:
        if k < 0 or k > n:
            return 0
        return math.comb(n, k)

    denom = comb(50, 5)
    return [comb(25, k) * comb(25, 5 - k) / denom for k in range(6)]


def class_nll(proba: np.ndarray, y: np.ndarray) -> float:
    n = int(y.shape[0])
    if n == 0:
        return 0.0
    rows = np.arange(n)
    p = np.clip(proba[rows, y.astype(int)], 1e-12, 1.0)
    return float(-np.log(p).mean())


def confusion(y_true: np.ndarray, y_pred: np.ndarray, n_classes: int) -> list[list[int]]:
    matrix = [[0] * n_classes for _ in range(n_classes)]
    for actual, guess in zip(y_true.astype(int), y_pred.astype(int)):
        if 0 <= actual < n_classes and 0 <= guess < n_classes:
            matrix[int(actual)][int(guess)] += 1
    return matrix


def verdict_of(skill: float, *, eps: float = 0.02) -> str:
    if skill > eps:
        return "bat le nul"
    if skill < -eps:
        return "moins bon"
    return "à égalité"


def window_slice(n: int, last: int) -> slice:
    last = min(max(int(last), 0), n)
    return slice(n - last, n)


def score_regression(
    y: np.ndarray,
    pred: np.ndarray,
    mean_pred: np.ndarray,
    persist_pred: np.ndarray,
) -> dict[str, Any]:
    resid = y - pred
    resid_mean = y - mean_pred
    resid_persist = y - persist_pred
    sigma = sample_std(resid)
    sigma_mean = sample_std(resid_mean)
    sigma_persist = sample_std(resid_persist)
    sigma_null = min(sigma_mean, sigma_persist) if min(sigma_mean, sigma_persist) > 0 else max(sigma_mean, sigma_persist)
    skill = skill_from_sigma(sigma, sigma_null)
    return {
        "n": int(y.size),
        "sigma": round(sigma, 4),
        "sigma_mean": round(sigma_mean, 4),
        "sigma_persist": round(sigma_persist, 4),
        "skill": round(skill, 4),
        "mae": round(float(np.mean(np.abs(resid))) if y.size else 0.0, 4),
        "verdict": verdict_of(skill),
    }


def score_classes(
    y: np.ndarray,
    proba: np.ndarray,
    persist: np.ndarray,
    prior: np.ndarray,
) -> dict[str, Any]:
    pred = proba.argmax(axis=1)
    hits = (pred == y.astype(int)).astype(float)
    persist_hits = (persist.astype(int) == y.astype(int)).astype(float)
    prior_pred = int(prior.argmax())
    prior_hits = (np.full(y.shape, prior_pred) == y.astype(int)).astype(float)
    nll = class_nll(proba, y)
    prior_tile = np.repeat(prior.reshape(1, -1), y.shape[0], axis=0)
    nll_prior = class_nll(prior_tile, y)
    hit = float(hits.mean()) if y.size else 0.0
    hit_mean = float(prior_hits.mean()) if y.size else 0.0
    hit_persist = float(persist_hits.mean()) if y.size else 0.0
    hit_null = max(hit_mean, hit_persist)
    skill = skill_from_sigma(1.0 - hit, 1.0 - hit_null)
    return {
        "n": int(y.size),
        "hit_rate": round(hit, 4),
        "hit_rate_mean": round(hit_mean, 4),
        "hit_rate_persist": round(hit_persist, 4),
        "hit_rate_std": round(rolling_hit_std(hits), 4),
        "nll": round(nll, 4),
        "nll_mean": round(nll_prior, 4),
        "skill": round(skill, 4),
        "confusion": confusion(y, pred, proba.shape[1]),
        "verdict": verdict_of(skill),
    }
