"""Séparation d’énergie en trois dictionnaires : réseau, mécanique, acoustique.

Les scores se combinent en fractions (0–1), jamais en mélangeant une énergie
STFT (~10³) et une puissance FFT (~1).
"""

from __future__ import annotations

from typing import Any

import numpy as np

from synchro.harmo.util import fnum


def _ridge_fraction(
    ridges: list[dict[str, Any]], kind: str, *, min_fraction: float
) -> float:
    total = 0.0
    for ridge in ridges:
        if ridge.get("kind") != kind:
            continue
        frac = float(ridge.get("energy_fraction") or 0.0)
        if frac < min_fraction:
            continue
        total += frac
    return min(total, 1.0)


def unmix_shares(
    *,
    fft_power: np.ndarray,
    comb_energy: float,
    ridges: list[dict[str, Any]],
    envelope_energy: float,
    envelope_snr: float = 0.0,
    envelope_periodic: bool = False,
    harmonic_energy: float,
    percussive_energy: float,
    comb_fraction: float | None = None,
) -> dict[str, Any]:
    power = np.asarray(fft_power, dtype=float)
    total_fft = float(np.sum(power[1:])) if power.size > 1 else 0.0
    if comb_fraction is None:
        comb_fraction = float(comb_energy) / total_fft if total_fft > 0 else 0.0
    comb_frac = min(max(float(comb_fraction), 0.0), 1.0)

    grid_ridge = _ridge_fraction(ridges, "grid", min_fraction=0.04)
    mech_ridge = _ridge_fraction(ridges, "mechanical", min_fraction=0.08)

    hpss_total = max(float(harmonic_energy) + float(percussive_energy), 0.0)
    perc_frac = (
        float(percussive_energy) / hpss_total if hpss_total > 0 else 0.0
    )
    residual_frac = max(1.0 - comb_frac, 0.0)

    env_frac = 0.0
    if envelope_periodic and float(envelope_snr) >= 4.0:
        env_frac = 0.2

    grid = grid_ridge + comb_frac
    mech = mech_ridge + env_frac
    acou = perc_frac + 0.6 * residual_frac

    raw = {
        "grid": max(grid, 0.0),
        "mechanical": max(mech, 0.0),
        "acoustic": max(acou, 0.0),
    }
    s = sum(raw.values())
    if s <= 0:
        shares = {"grid": 1.0 / 3.0, "mechanical": 1.0 / 3.0, "acoustic": 1.0 / 3.0}
    else:
        shares = {k: v / s for k, v in raw.items()}

    smear = 0.0
    if grid_ridge + mech_ridge > 0:
        smear = mech_ridge / (mech_ridge + grid_ridge)
    return {
        "shares": {k: fnum(v) for k, v in shares.items()},
        "raw": {k: fnum(v) for k, v in raw.items()},
        "smear": fnum(smear),
        "components": [
            {
                "id": "grid",
                "label": "Réseau",
                "share": fnum(shares["grid"]),
                "hint": "Raies fixes, crêtes STFT horizontales, peigne calendaire.",
            },
            {
                "id": "mechanical",
                "label": "Mécanique",
                "share": fnum(shares["mechanical"]),
                "hint": "Crêtes obliques, smearing, spectre d’enveloppe.",
            },
            {
                "id": "acoustic",
                "label": "Acoustique",
                "share": fnum(shares["acoustic"]),
                "hint": "Continuum Welch / HPSS percussif, résonances larges.",
            },
        ],
    }
