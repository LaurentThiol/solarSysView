"""STFT (ShortTimeFFT), crêtes, synchrosqueezing, CWT optionnelle."""

from __future__ import annotations

from typing import Any

import numpy as np
from scipy.signal import ShortTimeFFT, find_peaks, stft
from scipy.signal.windows import hann

from synchro.harmo.util import db10, detrend_mean, fgrid, flist, fnum, freq_pack
from synchro.short_cycle import SHORT_CYCLE_MAX, SHORT_CYCLE_MIN

SHORT_HOP = 2


def choose_nperseg(n: int, requested: int | None = None) -> int:
    n = max(8, int(n))
    cap = min(128, n)
    if requested:
        return max(8, min(int(requested), cap))
    p = int(2 ** np.floor(np.log2(max(8, n / 6.0))))
    return max(8, min(p, cap))


def compute_stft(
    x: np.ndarray, *, nperseg: int | None = None, hop: int | None = None
) -> dict[str, Any]:
    x = detrend_mean(np.asarray(x, dtype=float))
    n = int(x.size)
    nperseg = choose_nperseg(n, nperseg)
    hop = max(1, int(hop or max(1, nperseg // 4)))
    win = np.asarray(hann(nperseg), dtype=float)
    try:
        sft = ShortTimeFFT(win, hop=hop, fs=1.0, fft_mode="onesided")
        sx = np.asarray(sft.stft(x))
        freqs = np.asarray(sft.f, dtype=float)
        times = np.asarray(sft.t(n), dtype=float)
    except Exception:
        freqs, times, sx = stft(
            x,
            fs=1.0,
            window=win,
            nperseg=nperseg,
            noverlap=max(0, nperseg - hop),
            boundary=None,
            padded=False,
        )
        sx = np.asarray(sx)
        freqs = np.asarray(freqs, dtype=float)
        times = np.asarray(times, dtype=float)
    mag = np.abs(sx)
    if mag.ndim == 1:
        mag = mag[:, np.newaxis]
        sx = np.asarray(sx)
        if sx.ndim == 1:
            sx = sx[:, np.newaxis]
    freqs = np.asarray(freqs, dtype=float).ravel()
    times = np.asarray(times, dtype=float).ravel()
    if mag.ndim == 2 and times.size != mag.shape[1] and mag.shape[1] > 0:
        times = np.linspace(0.0, max(float(n - 1), 1.0), mag.shape[1])
    return {
        "freqs": freqs,
        "times": times,
        "sx": sx,
        "mag": mag,
        "nperseg": int(nperseg),
        "hop": int(hop),
    }


def synchrosqueeze(
    sx: np.ndarray, freqs: np.ndarray, hop: int
) -> tuple[np.ndarray, np.ndarray]:
    """Réassignement fréquentiel par IF (synchrosqueezing STFT maison)."""
    sx = np.asarray(sx)
    energy = np.abs(sx) ** 2
    phase = np.unwrap(np.angle(sx), axis=1)
    dphi = np.gradient(phase, axis=1) / max(float(hop), 1.0)
    if_est = np.clip(dphi / (2.0 * np.pi), 0.0, float(freqs[-1]) if freqs.size else 0.5)
    df = float(freqs[1] - freqs[0]) if freqs.size > 1 else 1.0
    bins = np.clip(np.rint(if_est / max(df, 1e-12)).astype(int), 0, max(0, freqs.size - 1))
    sst = np.zeros_like(energy)
    t_idx = np.broadcast_to(np.arange(energy.shape[1]), bins.shape)
    np.add.at(sst, (bins, t_idx), energy)
    return sst, if_est


def _viterbi_ridge(mag: np.ndarray, *, lam: float = 0.2, width: int | None = None) -> np.ndarray:
    f_bins, n_t = mag.shape
    if n_t == 0 or f_bins == 0:
        return np.zeros(0, dtype=int)
    width = int(width or max(3, f_bins // 6))
    logp = np.log(mag + 1e-12)
    logp = logp - np.max(logp, axis=0, keepdims=True)
    cost = np.full((f_bins, n_t), np.inf)
    prev = np.zeros((f_bins, n_t), dtype=int)
    cost[:, 0] = -logp[:, 0]
    bins = np.arange(f_bins)
    for t in range(1, n_t):
        for j in range(f_bins):
            lo = max(0, j - width)
            hi = min(f_bins, j + width + 1)
            trans = ((np.arange(lo, hi) - j) ** 2) * lam
            chunk = cost[lo:hi, t - 1] + trans
            k = int(np.argmin(chunk))
            cost[j, t] = chunk[k] - logp[j, t]
            prev[j, t] = lo + k
    path = np.zeros(n_t, dtype=int)
    path[-1] = int(np.argmin(cost[:, -1]))
    for t in range(n_t - 1, 0, -1):
        path[t - 1] = prev[path[t], t]
    return path


def extract_ridges(
    mag: np.ndarray,
    freqs: np.ndarray,
    times: np.ndarray,
    *,
    n_ridges: int = 3,
    draws_per_year: float = 104.0,
) -> list[dict[str, Any]]:
    original = np.asarray(mag, dtype=float)
    if original.ndim == 1:
        original = original[:, np.newaxis]
    if original.ndim != 2:
        return []
    work = original.copy()
    df = float(freqs[1] - freqs[0]) if freqs.size > 1 else 1.0
    ridges: list[dict[str, Any]] = []
    n_t = work.shape[1]
    stft_energy = float(np.sum(original**2))
    if n_t < 2:
        return ridges
    times = np.asarray(times, dtype=float).ravel()
    if times.size != n_t:
        times = np.linspace(0.0, max(float(n_t - 1), 1.0), n_t)
    freqs = np.asarray(freqs, dtype=float).ravel()
    for _ in range(n_ridges):
        path = _viterbi_ridge(work)
        if path.size == 0:
            break
        f_inst = freqs[np.clip(path, 0, freqs.size - 1)]
        energy = float(np.sum(original[path, np.arange(n_t)] ** 2))
        energy_fraction = energy / stft_energy if stft_energy > 0 else 0.0
        t = times - float(np.mean(times))
        f = f_inst - float(np.mean(f_inst))
        denom = float(np.dot(t, t))
        slope = float(np.dot(t, f) / denom) if denom > 0 else 0.0
        df_span = float(f_inst[-1] - f_inst[0])
        horizontal = abs(df_span) < 2.5 * df or abs(slope) < 0.5 * df / max(float(times[-1] - times[0]), 1.0)
        kind = "grid" if horizontal else "mechanical"
        # éteindre une bande autour de la crête pour extraire la suivante
        for t_i, b in enumerate(path):
            lo = max(0, int(b) - 2)
            hi = min(work.shape[0], int(b) + 3)
            work[lo:hi, t_i] *= 0.05
        mean_f = float(np.mean(f_inst))
        if any(abs(mean_f - float(r["mean_freq"])) < 2.5 * df for r in ridges):
            continue
        ridges.append(
            {
                "kind": kind,
                "slope": fnum(slope),
                "energy": fnum(energy),
                "energy_fraction": fnum(energy_fraction),
                "mean_freq": fnum(mean_f),
                **freq_pack(mean_f, draws_per_year),
                "df_span": fnum(df_span),
                "times": flist(times),
                "freqs": flist(f_inst),
            }
        )
    return ridges


def downsample_tf(
    freqs: np.ndarray,
    times: np.ndarray,
    mag: np.ndarray,
    *,
    max_f: int = 96,
    max_t: int = 160,
) -> dict[str, Any]:
    mag = np.asarray(mag, dtype=float)
    freqs = np.asarray(freqs, dtype=float)
    times = np.asarray(times, dtype=float)
    f_n, n_t = mag.shape if mag.ndim == 2 else (0, 0)
    if f_n == 0 or n_t == 0:
        return {"freqs": [], "times": [], "z": [], "db_min": 0.0, "db_max": 0.0}
    fi = np.unique(np.linspace(0, f_n - 1, min(max_f, f_n)).astype(int))
    ti = np.unique(np.linspace(0, n_t - 1, min(max_t, n_t)).astype(int))
    z = mag[np.ix_(fi, ti)]
    z_db = db10(z)
    return {
        "freqs": flist(freqs[fi]),
        "times": flist(times[ti]),
        "z": fgrid(z_db),
        "db_min": fnum(np.min(z_db)),
        "db_max": fnum(np.max(z_db)),
        "unit": "dB",
    }


def optional_cwt(x: np.ndarray) -> dict[str, Any] | None:
    try:
        import pywt
    except Exception:
        return None
    x = detrend_mean(np.asarray(x, dtype=float))
    n = int(x.size)
    if n < 16:
        return None
    scales = np.arange(1, min(48, n // 2))
    try:
        coef, freqs = pywt.cwt(x, scales, "morl", sampling_period=1.0)
    except Exception:
        return None
    mag = np.abs(coef)
    return downsample_tf(np.asarray(freqs), np.arange(n, dtype=float), mag, max_f=48, max_t=160) | {
        "available": True,
        "wavelet": "morl",
    }


def optional_ssq(x: np.ndarray) -> dict[str, Any] | None:
    try:
        import ssqueezepy as ssq
    except Exception:
        return None
    x = detrend_mean(np.asarray(x, dtype=float))
    try:
        tx, *_rest = ssq.ssq_stft(x)
    except Exception:
        return None
    mag = np.abs(np.asarray(tx))
    freqs = np.linspace(0.0, 0.5, mag.shape[0])
    times = np.linspace(0.0, max(len(x) - 1, 1), mag.shape[1])
    return downsample_tf(freqs, times, mag) | {"available": True, "source": "ssqueezepy"}


def short_cycle_peaks(
    x: np.ndarray, *, draws_per_year: float = 104.0
) -> list[dict[str, Any]]:
    """Pics d'une STFT de 8 tirages, pas 2, dont la période tombe dans 4 à 8.

    Le segment court localise une arche que le Welch long moyenne. On ne
    garde, par période arrondie, que le pic le plus fort.
    """
    series = np.asarray(x, dtype=float)
    if int(series.size) < SHORT_CYCLE_MAX:
        return []
    st = compute_stft(series, nperseg=SHORT_CYCLE_MAX, hop=SHORT_HOP)
    mag = np.asarray(st["mag"], dtype=float)
    freqs = np.asarray(st["freqs"], dtype=float).ravel()
    times = np.asarray(st["times"], dtype=float).ravel()
    if mag.ndim != 2 or mag.shape[1] == 0 or freqs.size < 2:
        return []
    best: dict[int, dict[str, Any]] = {}
    for slot in range(mag.shape[1]):
        column = mag[:, slot].copy()
        column[0] = 0.0
        if float(np.max(column)) <= 0:
            continue
        k = int(np.argmax(column))
        packed = freq_pack(float(freqs[k]) if k < freqs.size else 0.0, draws_per_year)
        period = packed.get("period_draws")
        if period is None or not (SHORT_CYCLE_MIN <= float(period) <= SHORT_CYCLE_MAX):
            continue
        peak = {
            "band": "court",
            "time": fnum(times[slot]) if slot < times.size else None,
            "cycles_per_draw": packed["cycles_per_draw"],
            "period_draws": packed["period_draws"],
            "cycles_per_year": packed["cycles_per_year"],
            "amp": fnum(column[k]),
            "nperseg": SHORT_CYCLE_MAX,
            "hop": SHORT_HOP,
        }
        key = int(round(float(period)))
        current = best.get(key)
        if current is None or float(peak["amp"]) > float(current["amp"]):
            best[key] = peak
    return [best[key] for key in sorted(best)]


def tf_bundle(
    x: np.ndarray,
    *,
    nperseg: int | None = None,
    draws_per_year: float = 104.0,
    want_sst: bool = True,
    want_wavelets: bool = False,
) -> dict[str, Any]:
    st = compute_stft(x, nperseg=nperseg)
    mag = st["mag"]
    freqs = st["freqs"]
    times = st["times"]
    ridges = extract_ridges(mag, freqs, times, draws_per_year=draws_per_year)
    sst = None
    if want_sst:
        sst_mag, _if_est = synchrosqueeze(st["sx"], freqs, st["hop"])
        sst = downsample_tf(freqs, times, np.sqrt(np.maximum(sst_mag, 0.0)))
    cwt = optional_cwt(x) if want_wavelets else None
    ssq = optional_ssq(x) if want_wavelets else None
    heatmap = downsample_tf(freqs, times, mag)
    return {
        "nperseg": st["nperseg"],
        "hop": st["hop"],
        "stft": heatmap,
        "sst": sst,
        "ridges": ridges,
        "cwt": cwt,
        "ssq": ssq,
        "freqs": freqs,
        "times": times,
        "mag": mag,
        "sx": st["sx"],
        "hop_samples": st["hop"],
    }
