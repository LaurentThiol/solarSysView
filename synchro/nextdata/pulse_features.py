"""Pulse connu avant un tirage : une onde par numéro, sans les sorties d’après.

L’index t n’ajuste que les présences [:t] de chaque boule et de chaque étoile.
L’onde de ce numéro est lue à t, puis une fois à t+1, sans réajustement.
π est sa probabilité fréquentielle : le taux de ses sorties au signe de son
onde, ramené vers le hasard quand son p de Rayleigh est grand. Une boule sans
deux sorties garde le taux de base.
"""

from __future__ import annotations

import math
from typing import Any, NamedTuple

import numpy as np

from synchro.pulse.model import PERIOD_MAX, PERIOD_MIN, SCORE_FLOOR, SCORE_RATIO

NUMBER_POOL = 50
STAR_POOL = 12
BALL_BASE = 5.0 / NUMBER_POOL
STAR_DRAWN = 2.0
TOP_BALLS = 5
TOP_STARS = 2
FUTURE_PULSE: tuple[str, ...] = (
    "pulse_ball_1",
    "pulse_ball_2",
    "pulse_ball_3",
    "pulse_ball_4",
    "pulse_ball_5",
    "pulse_pi_1",
    "pulse_pi_2",
    "pulse_pi_3",
    "pulse_pi_4",
    "pulse_pi_5",
    "pulse_sum",
    "pulse_n1",
    "pulse_spread",
    "pulse_parity",
    "star_pulse_1",
    "star_pulse_2",
    "star_pulse_pi_1",
    "star_pulse_pi_2",
    "star_pulse_sum",
    "star_pulse_e1",
)
PULSE_AHEAD: dict[str, str] = {name: f"{name}_ahead" for name in FUTURE_PULSE}
PULSE_VECTORS: tuple[str, ...] = (
    "pulse_pi",
    "pulse_p",
    "pulse_period",
    "pulse_phase",
    "star_pulse_pi",
    "star_pulse_p",
    "star_pulse_period",
    "star_pulse_phase",
)


class _Fit(NamedTuple):
    period: np.ndarray
    phase: np.ndarray
    radius: np.ndarray
    fitted: np.ndarray
    hits: np.ndarray
    pos_hits: np.ndarray
    pos_times: np.ndarray
    scanned: np.ndarray


def public_pulse(row: dict[str, Any]) -> dict[str, Any]:
    """Les numéros que leur π met en tête, chacun avec son π et son p."""
    return {
        "balls": [_public_number(row, "pulse_ball", "pulse_pi", "pulse_p", rank) for rank in range(1, TOP_BALLS + 1)],
        "stars": [_public_number(row, "star_pulse", "star_pulse_pi", "star_pulse_p", rank) for rank in range(1, TOP_STARS + 1)],
    }


def pulse_of(row: dict[str, Any] | None) -> dict[str, list[float]] | None:
    """Vecteurs π du tirage visé, pour le score d’une grille. None sans ligne."""
    if not row:
        return None
    return {
        "pi": [float(value) for value in (row.get("pulse_pi") or [])],
        "star_pi": [float(value) for value in (row.get("star_pulse_pi") or [])],
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
) -> list[dict[str, Any]]:
    """Un état par tirage, puis les deux dates d’horizon.

    `star_pools` compte deux urnes de plus que les tirages : le prochain
    tirage et celui d’après. La dernière entrée prolonge l’onde de chaque
    numéro, elle ne la refait pas.
    """
    draws = len(numbers)
    if len(stars) != draws:
        raise ValueError("Numéros et étoiles n’ont pas la même longueur.")
    if len(star_pools) != draws + 2:
        raise ValueError("L’urne attend deux dates d’horizon.")
    fit = _principal_prefixes(_hits(numbers, stars))
    states: list[dict[str, Any]] = []
    for index in range(draws + 1):
        ahead_pool = int(star_pools[index + 1] if index + 1 < len(star_pools) else star_pools[-1])
        main = _state(fit, index, index, int(star_pools[index]))
        ahead = _state(fit, index, index + 1, ahead_pool)
        states.append(_publish(main, ahead))
    # L’horizon suivant est la même onde, un index plus loin, pas un nouvel ajustement.
    carried = _state(fit, draws, draws + 1, int(star_pools[-1]))
    extended = _state(fit, draws, draws + 2, int(star_pools[-1]))
    states.append(_publish(carried, extended))
    return states


def _public_number(row: dict[str, Any], number_key: str, pi_key: str, p_key: str, rank: int) -> dict[str, float | int]:
    number = int(row.get(f"{number_key}_{rank}") or 0)
    return {
        "n": number,
        "pi": round(float(row.get(f"{pi_key}_{rank}") or 0.0), 4),
        "p": round(_vector_value(row, p_key, number), 6),
    }


def _vector_value(row: dict[str, Any], key: str, number: int) -> float:
    if number <= 0:
        return 1.0
    values = row.get(key) or []
    slot = number - 1
    if slot >= len(values):
        return 1.0
    return float(values[slot])


def _publish(main: dict[str, Any], ahead: dict[str, Any]) -> dict[str, Any]:
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


def _principal_prefixes(hits: np.ndarray) -> _Fit:
    """Fondamentale de chaque préfixe [:t], pour chaque numéro."""
    length, channels = hits.shape
    periods = np.arange(PERIOD_MIN, PERIOD_MAX + 1, dtype=int)
    period_count = int(periods.size)
    chosen_period = np.zeros((length + 1, channels), dtype=int)
    chosen_phase = np.zeros((length + 1, channels), dtype=np.float64)
    chosen_radius = np.zeros((length + 1, channels), dtype=np.float64)
    fitted = np.zeros((length + 1, channels), dtype=bool)
    caps = np.minimum(PERIOD_MAX, np.arange(length + 1) // 2)
    scanned = np.where(caps >= PERIOD_MIN, caps - PERIOD_MIN + 1, 0).astype(np.float64)
    counts = np.cumsum(hits, axis=0) if length else np.zeros((0, channels))
    prefix_counts = np.vstack([np.zeros((1, channels), dtype=np.float64), counts]) if length else np.zeros((1, channels))
    if length == 0 or period_count == 0:
        return _Fit(
            chosen_period,
            chosen_phase,
            chosen_radius,
            fitted,
            prefix_counts,
            np.zeros_like(prefix_counts),
            np.zeros_like(prefix_counts),
            scanned,
        )

    times = np.arange(length, dtype=np.float64)
    # Même produit que score_times : exp(1j * 2π t / P), pas exp(2j π t / P).
    angles = np.exp(1j * (2.0 * math.pi * times[None, :] / periods[:, None]))
    weighted = np.cumsum(angles[:, :, None] * hits[None, :, :], axis=1)
    prefix_sum = np.concatenate(
        [np.zeros((period_count, 1, channels), dtype=np.complex128), weighted],
        axis=1,
    )
    safe_counts = np.maximum(prefix_counts, 1.0)
    mean = prefix_sum / safe_counts[None, :, :]
    radius = np.abs(mean)
    psi = np.angle(mean)
    phase = np.mod(psi / (2.0 * math.pi), 1.0)
    radius = np.transpose(radius, (1, 0, 2))
    phase = np.transpose(phase, (1, 0, 2))

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
        chosen_radius[rows, cols] = radius[rows, slots, cols]
    pos_hits, pos_times = _sign_counts(hits, chosen_period, chosen_phase, fitted)
    return _Fit(chosen_period, chosen_phase, chosen_radius, fitted, prefix_counts, pos_hits, pos_times, scanned)


def _argmax_period(radius: np.ndarray, mask: np.ndarray) -> np.ndarray:
    """Indice de période : plus grand rayon, puis plus longue période."""
    period_count = radius.shape[1]
    score = np.where(mask, radius, -np.inf)
    best = np.max(score, axis=1, keepdims=True)
    tied = mask & (radius == best)
    indices = np.arange(period_count, dtype=int)[None, :, None]
    return np.max(np.where(tied, indices, -1), axis=1)


def _sign_counts(
    hits: np.ndarray,
    periods: np.ndarray,
    phase: np.ndarray,
    fitted: np.ndarray,
) -> tuple[np.ndarray, np.ndarray]:
    """Sorties et dates du préfixe où l’onde de ce numéro est positive."""
    length, channels = hits.shape
    pos_hits = np.zeros((length + 1, channels), dtype=np.float64)
    pos_times = np.zeros((length + 1, channels), dtype=np.float64)
    for size in range(2, length + 1):
        if not np.any(fitted[size]):
            continue
        times = np.arange(size, dtype=np.float64)
        positive = _wave_positive_times(periods[size], phase[size], times)
        pos_times[size] = positive.sum(axis=0)
        pos_hits[size] = (hits[:size] * positive).sum(axis=0)
    return pos_hits, pos_times


def _wave_positive(period: np.ndarray, phase: np.ndarray, index: int) -> np.ndarray:
    fitted = period >= PERIOD_MIN
    safe_period = np.where(fitted, period, 1).astype(np.float64)
    wave = np.cos(2.0 * math.pi * (float(index) / safe_period - phase))
    return (wave > 0.0) & fitted


def _wave_positive_times(period: np.ndarray, phase: np.ndarray, times: np.ndarray) -> np.ndarray:
    fitted = period >= PERIOD_MIN
    safe_period = np.where(fitted, period, 1).astype(np.float64)
    wave = np.cos(2.0 * math.pi * (times[:, None] / safe_period[None, :] - phase[None, :]))
    return (wave > 0.0) & fitted[None, :]


def _state(fit: _Fit, fit_index: int, read_at: int, pool: int) -> dict[str, Any]:
    """π de chaque numéro, lu sur l’ajustement du préfixe `fit_index`."""
    ball_base = np.full(NUMBER_POOL, BALL_BASE, dtype=np.float64)
    star_count = max(0, min(STAR_POOL, int(pool)))
    star_base = np.full(STAR_POOL, STAR_DRAWN / max(star_count, 1), dtype=np.float64)
    base = np.concatenate([ball_base, star_base])
    pi, probability, period, phase = _channel_pi(fit, fit_index, read_at, base)
    ball_pi = pi[:NUMBER_POOL]
    ball_p = probability[:NUMBER_POOL]
    ball_period = period[:NUMBER_POOL]
    ball_phase = phase[:NUMBER_POOL]
    star_pi = pi[NUMBER_POOL:]
    star_p = probability[NUMBER_POOL:]
    star_period = period[NUMBER_POOL:]
    star_phase = phase[NUMBER_POOL:]
    balls = _ranked(ball_pi, TOP_BALLS, NUMBER_POOL)
    stars = _ranked(star_pi, TOP_STARS, star_count)
    out: dict[str, Any] = {
        "pulse_pi": ball_pi.tolist(),
        "pulse_p": ball_p.tolist(),
        "pulse_period": [int(value) for value in ball_period.tolist()],
        "pulse_phase": ball_phase.tolist(),
        "star_pulse_pi": star_pi.tolist(),
        "star_pulse_p": star_p.tolist(),
        "star_pulse_period": [int(value) for value in star_period.tolist()],
        "star_pulse_phase": star_phase.tolist(),
    }
    for rank, (number, weight) in enumerate(balls, start=1):
        out[f"pulse_ball_{rank}"] = float(number)
        out[f"pulse_pi_{rank}"] = float(weight)
    for rank, (number, weight) in enumerate(stars, start=1):
        out[f"star_pulse_{rank}"] = float(number)
        out[f"star_pulse_pi_{rank}"] = float(weight)
    out.update(_ball_shape([number for number, _weight in balls if number > 0]))
    out.update(_star_shape([number for number, _weight in stars if number > 0]))
    return out


def _channel_pi(
    fit: _Fit,
    fit_index: int,
    read_at: int,
    base: np.ndarray,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    period = fit.period[fit_index]
    phase = fit.phase[fit_index]
    radius = fit.radius[fit_index]
    fitted = fit.fitted[fit_index]
    hits = fit.hits[fit_index]
    pos_hits = fit.pos_hits[fit_index]
    pos_times = fit.pos_times[fit_index]
    scanned = float(fit.scanned[fit_index])
    positive = _wave_positive(period, phase, read_at)
    neg_times = float(fit_index) - pos_times
    neg_hits = hits - pos_hits
    pos_rate = np.divide(pos_hits, pos_times, out=np.full_like(pos_hits, np.nan), where=pos_times > 0)
    neg_rate = np.divide(neg_hits, neg_times, out=np.full_like(neg_hits, np.nan), where=neg_times > 0)
    rate = np.where(positive, pos_rate, neg_rate)
    rate = np.where(np.isfinite(rate), rate, base)
    probability = np.minimum(1.0, np.exp(-hits * radius * radius) * scanned)
    probability = np.where(fitted, probability, 1.0)
    pi = np.where(fitted, probability * base + (1.0 - probability) * rate, base)
    period_out = np.where(fitted, period, 0)
    phase_out = np.where(fitted, phase, 0.0)
    return pi, probability, period_out, phase_out


def _ranked(weights: np.ndarray, limit: int, eligible: int) -> list[tuple[int, float]]:
    """Plus fort π d’abord. À égalité, le plus petit numéro. Hors urne : exclu."""
    count = max(0, min(int(weights.size), int(eligible)))
    order = sorted(range(count), key=lambda index: (-float(weights[index]), index))
    picked = [(index + 1, float(weights[index])) for index in order[:limit]]
    while len(picked) < limit:
        picked.append((0, 0.0))
    return picked


def _ball_shape(numbers: list[int]) -> dict[str, float]:
    if not numbers:
        return {"pulse_sum": 0.0, "pulse_n1": 0.0, "pulse_spread": 0.0, "pulse_parity": 0.0}
    return {
        "pulse_sum": float(sum(numbers)),
        "pulse_n1": float(min(numbers)),
        "pulse_spread": float(max(numbers) - min(numbers)) if len(numbers) >= 2 else 0.0,
        "pulse_parity": float(sum(1 for number in numbers if number % 2 == 0)),
    }


def _star_shape(numbers: list[int]) -> dict[str, float]:
    if not numbers:
        return {"star_pulse_sum": 0.0, "star_pulse_e1": 0.0}
    return {
        "star_pulse_sum": float(sum(numbers)),
        "star_pulse_e1": float(min(numbers)),
    }
