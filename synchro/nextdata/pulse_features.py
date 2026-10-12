"""État Pulse connu avant un tirage : fondamentale simple, sans les sorties d’après.

La page Pulse ajuste une fenêtre déjà close. Ici, l’index t ne voit que les
présences [:t]. L’onde est lue à t, et une fois de plus à t+1, sans réajuster
sur le tirage t. Quatre parts : boules et étoiles, en lobe et pondérées par
la concordance. Une boule sans deux sorties compte pour zéro.
"""

from __future__ import annotations

import math
from typing import Any

import numpy as np

from synchro.pulse.model import PERIOD_MAX, PERIOD_MIN, SCORE_FLOOR, SCORE_RATIO

NUMBER_POOL = 50
STAR_POOL = 12
FUTURE_PULSE: tuple[str, ...] = (
    "pulse_lobe",
    "pulse_mass",
    "star_pulse_lobe",
    "star_pulse_mass",
)
PULSE_AHEAD: dict[str, str] = {name: f"{name}_ahead" for name in FUTURE_PULSE}


def public_pulse(row: dict[str, Any]) -> dict[str, float]:
    """Les quatre parts du tirage visé, pour l’écran."""
    return {
        "lobe": round(float(row.get("pulse_lobe") or 0.0), 4),
        "mass": round(float(row.get("pulse_mass") or 0.0), 4),
        "star_lobe": round(float(row.get("star_pulse_lobe") or 0.0), 4),
        "star_mass": round(float(row.get("star_pulse_mass") or 0.0), 4),
    }


def shifted_pulse(rows: list[dict[str, Any]], horizon: list[dict[str, Any]], names: list[str]) -> list[list[float]]:
    """Pulse vu par Darts : la ligne i porte l’état du tirage i+1.

    Le lag 1 du tirage t relit donc l’état calculé sur [:t], pas le
    réajustement de la ligne t+1, qui contient déjà le tirage prévu.
    """
    if not names:
        return []
    follower_at_end = horizon[0] if horizon else {}
    out: list[list[float]] = []
    for index, _row in enumerate(rows):
        follower = rows[index + 1] if index + 1 < len(rows) else follower_at_end
        out.append([float(follower.get(name) or 0.0) for name in names])
    return out


def causal_pulse(
    numbers: list[list[int]],
    stars: list[list[int]],
    star_pools: list[int],
) -> list[dict[str, float]]:
    """Un état par tirage, puis les deux dates d’horizon.

    `star_pools` compte deux urnes de plus que les tirages : le prochain
    tirage et celui d’après. La dernière entrée prolonge l’ajustement de
    l’archive, elle ne le refait pas.
    """
    draws = len(numbers)
    if len(stars) != draws:
        raise ValueError("Numéros et étoiles n’ont pas la même longueur.")
    if len(star_pools) != draws + 2:
        raise ValueError("L’urne attend deux dates d’horizon.")
    periods, phases, concordance = _principal_prefixes(_hits(numbers, stars))
    states: list[dict[str, float]] = []
    for index in range(draws + 1):
        main = _aggregate(periods[index], phases[index], concordance[index], index, int(star_pools[index]))
        ahead_pool = int(star_pools[index + 1] if index + 1 < len(star_pools) else star_pools[-1])
        ahead = _aggregate(periods[index], phases[index], concordance[index], index + 1, ahead_pool)
        states.append(_join(main, ahead))
    # L’horizon suivant est la même onde, un index plus loin, pas un nouvel ajustement.
    last = states[-1]
    extended_pool = int(star_pools[-1])
    extended = _aggregate(periods[-1], phases[-1], concordance[-1], draws + 2, extended_pool)
    states.append(_join(
        {name: last[PULSE_AHEAD[name]] for name in FUTURE_PULSE},
        extended,
    ))
    return states


def _join(main: dict[str, float], ahead: dict[str, float]) -> dict[str, float]:
    out = dict(main)
    for name in FUTURE_PULSE:
        out[PULSE_AHEAD[name]] = ahead[name]
    return out


def _hits(numbers: list[list[int]], stars: list[list[int]]) -> np.ndarray:
    hits = np.zeros((len(numbers), NUMBER_POOL + STAR_POOL), dtype=np.float64)
    for index, (pool, star) in enumerate(zip(numbers, stars)):
        for ball in pool:
            slot = int(ball) - 1
            if 0 <= slot < NUMBER_POOL:
                hits[index, slot] = 1.0
        for value in star:
            slot = NUMBER_POOL + int(value) - 1
            if NUMBER_POOL <= slot < NUMBER_POOL + STAR_POOL:
                hits[index, slot] = 1.0
    return hits


def _principal_prefixes(hits: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Période, phase et concordance de chaque préfixe [:t], pour chaque canal."""
    length, channels = hits.shape
    periods = np.arange(PERIOD_MIN, PERIOD_MAX + 1, dtype=int)
    period_count = int(periods.size)
    chosen_period = np.zeros((length + 1, channels), dtype=int)
    chosen_phase = np.zeros((length + 1, channels), dtype=np.float64)
    chosen_psi = np.zeros((length + 1, channels), dtype=np.float64)
    chosen_concordance = np.zeros((length + 1, channels), dtype=np.float64)
    if length == 0 or period_count == 0:
        return chosen_period, chosen_phase, chosen_concordance

    times = np.arange(length, dtype=np.float64)
    # Même produit que score_times : exp(1j * 2π t / P), pas exp(2j π t / P).
    angles = np.exp(1j * (2.0 * math.pi * times[None, :] / periods[:, None]))
    weighted = np.cumsum(angles[:, :, None] * hits[None, :, :], axis=1)
    counts = np.cumsum(hits, axis=0)
    prefix_sum = np.concatenate(
        [np.zeros((period_count, 1, channels), dtype=np.complex128), weighted],
        axis=1,
    )
    prefix_counts = np.vstack([np.zeros((1, channels), dtype=np.float64), counts])
    safe_counts = np.maximum(prefix_counts, 1.0)
    mean = prefix_sum / safe_counts[None, :, :]
    radius = np.abs(mean)
    psi = np.angle(mean)
    phase = np.mod(psi / (2.0 * math.pi), 1.0)
    radius = np.transpose(radius, (1, 0, 2))
    psi = np.transpose(psi, (1, 0, 2))
    phase = np.transpose(phase, (1, 0, 2))

    caps = np.minimum(PERIOD_MAX, np.arange(length + 1) // 2)
    period_ok = periods[None, :, None] <= caps[:, None, None]
    valid = period_ok & (prefix_counts[:, None, :] >= 2.0)
    best_r = np.max(np.where(valid, radius, -1.0), axis=1)
    floor = np.maximum(SCORE_FLOOR, SCORE_RATIO * np.clip(best_r, 0.0, None))
    candidates = valid & (radius >= floor[:, None, :] - 1e-12)
    missing = np.any(valid, axis=1) & ~np.any(candidates, axis=1)
    if np.any(missing):
        fallback = _argmax_period(radius, valid)
        picked_l, picked_c = np.nonzero(missing)
        candidates[picked_l, fallback[picked_l, picked_c], picked_c] = True

    longer = periods[None, :] > periods[:, None]
    multiple = longer & (np.mod(periods[None, :], periods[:, None]) == 0)
    dropped = np.einsum("ljc,ij->lic", candidates.astype(np.float64), multiple.astype(np.float64)) > 0.0
    kept = candidates & ~dropped
    pool = np.where(np.any(kept, axis=1, keepdims=True), kept, candidates)
    chosen = _argmax_period(radius, pool)
    fitted = chosen >= 0
    if np.any(fitted):
        rows, cols = np.nonzero(fitted)
        slots = chosen[rows, cols]
        chosen_period[rows, cols] = periods[slots]
        chosen_phase[rows, cols] = phase[rows, slots, cols]
        chosen_psi[rows, cols] = psi[rows, slots, cols]
        chosen_concordance[:, :] = _concordance_of(
            hits,
            chosen_period,
            chosen_psi,
            fitted,
            prefix_counts,
        )
    return chosen_period, chosen_phase, chosen_concordance


def _argmax_period(radius: np.ndarray, mask: np.ndarray) -> np.ndarray:
    """Indice de période : plus grand rayon, puis plus longue période."""
    period_count = radius.shape[1]
    score = np.where(mask, radius, -np.inf)
    best = np.max(score, axis=1, keepdims=True)
    tied = mask & (radius == best)
    indices = np.arange(period_count, dtype=int)[None, :, None]
    return np.max(np.where(tied, indices, -1), axis=1)


def _concordance_of(
    hits: np.ndarray,
    periods: np.ndarray,
    psi: np.ndarray,
    fitted: np.ndarray,
    prefix_counts: np.ndarray,
) -> np.ndarray:
    """Part des sorties du préfixe qui tombent dans le lobe, ramenée à 0–1.

    Le signe suit `score_times` : cos(2π t / P − ψ) > 0, avec ψ l’argument
    de la moyenne, pas la phase ramenée à l’unité.
    """
    length, channels = hits.shape
    rates = np.zeros((length + 1, channels), dtype=np.float64)
    for size in range(2, length + 1):
        active = fitted[size]
        if not np.any(active):
            continue
        safe_period = np.where(active, periods[size], 1).astype(np.float64)
        times = np.arange(size, dtype=np.float64)[:, None]
        angles = 2.0 * math.pi * times / safe_period[None, :]
        inside = (hits[:size] * (np.cos(angles - psi[size][None, :]) > 0.0)).sum(axis=0)
        counts = prefix_counts[size]
        rates[size] = np.divide(inside, counts, out=np.zeros(channels), where=counts >= 2.0)
    concordance = np.clip(2.0 * (rates - 0.5), 0.0, 1.0)
    return np.where(fitted, concordance, 0.0)


def _wave_positive(period: np.ndarray, phase: np.ndarray, index: int) -> np.ndarray:
    fitted = period >= PERIOD_MIN
    safe_period = np.where(fitted, period, 1).astype(np.float64)
    wave = np.cos(2.0 * math.pi * (float(index) / safe_period - phase))
    return (wave > 0.0) & fitted


def _aggregate(
    period: np.ndarray,
    phase: np.ndarray,
    concordance: np.ndarray,
    index: int,
    pool: int,
) -> dict[str, float]:
    inside = _wave_positive(period, phase, index).astype(np.float64)
    number_inside = inside[:NUMBER_POOL]
    number_weight = concordance[:NUMBER_POOL]
    star_count = max(0, min(STAR_POOL, int(pool)))
    star_inside = inside[NUMBER_POOL : NUMBER_POOL + star_count]
    star_weight = concordance[NUMBER_POOL : NUMBER_POOL + star_count]
    return {
        "pulse_lobe": float(number_inside.mean()) if number_inside.size else 0.0,
        "pulse_mass": float((number_weight * number_inside).mean()) if number_inside.size else 0.0,
        "star_pulse_lobe": float(star_inside.mean()) if star_inside.size else 0.0,
        "star_pulse_mass": float((star_weight * star_inside).mean()) if star_inside.size else 0.0,
    }
