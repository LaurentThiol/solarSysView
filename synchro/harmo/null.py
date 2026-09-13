"""Modèle nul : mêmes dates, tirages uniformes indépendants."""

from __future__ import annotations

import random
from typing import Any

import numpy as np

from synchro.analysis.common import as_date
from synchro.analysis.montecarlo import simulate_draw
from synchro.harmo.series import build_signal, default_index
from synchro.harmo.spectrum import rfft_spectrum, scan_comb, peak_list, thd_hnr
from synchro.harmo.util import fnum


def _clone_draw(template: dict[str, Any], numbers: list[int], stars: list[int]) -> dict[str, Any]:
    pool = int(template.get("star_pool") or 12)
    return {
        "draw_date": as_date(template["draw_date"]),
        "weekday": template.get("weekday"),
        "numbers": numbers,
        "stars": stars,
        "star_pool": pool,
    }


def null_spectrum_stats(
    draws: list[dict[str, Any]],
    *,
    variable: str,
    n: int | None,
    window: str,
    n_sim: int,
    seed: int,
    observed_peak: float,
    observed_thd: float | None,
) -> dict[str, Any]:
    n_sim = max(8, min(int(n_sim), 200))
    rng = random.Random(seed)
    idx = default_index(variable, n)
    peak_dist: list[float] = []
    thd_dist: list[float] = []
    for _ in range(n_sim):
        fake = []
        for row in draws:
            pool = int(row.get("star_pool") or 12)
            nums, stars = simulate_draw(rng, star_pool=pool)
            fake.append(_clone_draw(row, nums, stars))
        signal = build_signal(fake, variable=variable, n=idx)
        x = np.asarray(signal["x"], dtype=float)
        _freqs, mag, _power = rfft_spectrum(x, window=window)
        body = mag.copy()
        if body.size:
            body[0] = 0.0
            peak_dist.append(float(np.max(body)))
        peaks = peak_list(_freqs, mag, draws_per_year=float(signal["sampling"]["draws_per_year"]))
        comb = scan_comb(_freqs, _power, peaks, draws_per_year=float(signal["sampling"]["draws_per_year"]))
        f0 = float(comb.get("cycles_per_draw") or 0.0)
        thd = thd_hnr(_freqs, mag, f0).get("thd") if f0 else None
        if thd is not None:
            thd_dist.append(float(thd))
    def rank_ge(dist: list[float], value: float) -> float:
        if not dist:
            return 1.0
        return float(sum(1 for v in dist if v >= value) / len(dist))

    return {
        "n_sim": n_sim,
        "seed": int(seed),
        "observed_peak": fnum(observed_peak),
        "observed_thd": fnum(observed_thd) if observed_thd is not None else None,
        "peak": {
            "mean": fnum(np.mean(peak_dist)) if peak_dist else None,
            "p_ge_observed": fnum(rank_ge(peak_dist, observed_peak)),
        },
        "thd": {
            "mean": fnum(np.mean(thd_dist)) if thd_dist else None,
            "p_ge_observed": (
                fnum(rank_ge(thd_dist, float(observed_thd)))
                if observed_thd is not None and thd_dist
                else None
            ),
        },
        "null": (
            "Tirages uniformes indépendants, mêmes dates (et donc le même "
            "échantillonnage 3+4 jours). Un pic « significatif » contre du "
            "bruit blanc ne l’est pas forcément contre ce modèle nul."
        ),
    }
