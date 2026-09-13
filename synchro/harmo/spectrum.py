"""FFT fenêtrée, Welch, multitaper, Lomb-Scargle, peigne, THD, cepstre."""

from __future__ import annotations

from typing import Any

import numpy as np
from scipy.fft import irfft, rfft, rfftfreq
from scipy.signal import find_peaks, lombscargle, welch
from scipy.signal.windows import blackmanharris, dpss, flattop, hann

from synchro.harmo.util import db10, detrend_mean, downsample_xy, fnum, flist, freq_pack

WINDOWS = {
    "blackmanharris": blackmanharris,
    "flattop": flattop,
    "hann": hann,
}


def window_array(name: str, n: int) -> np.ndarray:
    fn = WINDOWS.get(name, blackmanharris)
    return np.asarray(fn(n), dtype=float)


def rfft_spectrum(
    x: np.ndarray, *, window: str = "blackmanharris"
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Amplitude unilatérale corrigée du gain cohérent, et puissance."""
    x = detrend_mean(np.asarray(x, dtype=float))
    n = int(x.size)
    if n < 4:
        return np.array([0.0]), np.array([0.0]), np.array([0.0])
    w = window_array(window, n)
    gain = float(np.sum(w))
    spec = rfft(x * w)
    freqs = rfftfreq(n, d=1.0)
    mag = np.abs(spec) * 2.0 / max(gain, 1e-12)
    mag[0] /= 2.0
    if n % 2 == 0:
        mag[-1] /= 2.0
    power = mag**2
    return freqs, mag, power


def peak_list(
    freqs: np.ndarray,
    mag: np.ndarray,
    *,
    draws_per_year: float,
    max_peaks: int = 16,
) -> list[dict[str, Any]]:
    if mag.size < 4:
        return []
    body = mag.copy()
    body[0] = 0.0
    med = float(np.median(body[1:])) if body.size > 1 else 0.0
    peak_max = float(np.max(body)) if body.size else 0.0
    prominence = max(med * 2.5, peak_max * 0.05, 1e-12)
    idx, props = find_peaks(body, prominence=prominence)
    if idx.size == 0:
        k = int(np.argmax(body))
        if k > 0:
            idx = np.array([k])
            props = {"prominences": np.array([body[k]])}
    widths = None
    if idx.size:
        try:
            from scipy.signal import peak_widths

            widths = peak_widths(body, idx, rel_height=0.5)[0]
        except Exception:
            widths = None
    out: list[dict[str, Any]] = []
    df = float(freqs[1] - freqs[0]) if freqs.size > 1 else 1.0
    for i, k in enumerate(idx):
        f = float(freqs[k])
        if f <= 0:
            continue
        width_bins = float(widths[i]) if widths is not None and i < len(widths) else 1.0
        q = f / max(width_bins * df, 1e-12)
        pack = freq_pack(f, draws_per_year)
        out.append(
            {
                **pack,
                "amp": fnum(mag[k]),
                "power": fnum(mag[k] ** 2),
                "prominence": fnum(props["prominences"][i]) if "prominences" in props else fnum(mag[k]),
                "q": fnum(q),
                "bin": int(k),
            }
        )
    out.sort(key=lambda row: row["amp"], reverse=True)
    return out[:max_peaks]


def interpolate_amp(freqs: np.ndarray, mag: np.ndarray, f: float) -> float:
    if f <= 0 or f > float(freqs[-1]):
        return 0.0
    return float(np.interp(f, freqs, mag))


def thd_hnr(
    freqs: np.ndarray,
    mag: np.ndarray,
    f0: float,
    *,
    n_harmonics: int = 10,
) -> dict[str, Any]:
    if f0 <= 0 or freqs.size < 4:
        return {"f0": fnum(f0), "thd": None, "hnr": None, "n_harmonics": 0, "harmonics": []}
    fund = interpolate_amp(freqs, mag, f0)
    harmonics: list[dict[str, float]] = []
    harm_sq = 0.0
    for k in range(1, n_harmonics + 1):
        fk = k * f0
        if fk >= float(freqs[-1]):
            break
        ak = interpolate_amp(freqs, mag, fk)
        harmonics.append({"k": k, "freq": fnum(fk), "amp": fnum(ak)})
        if k >= 2:
            harm_sq += ak * ak
    thd = float(np.sqrt(harm_sq) / fund) if fund > 0 else None
    harm_energy = fund * fund + harm_sq
    total = float(np.sum(mag[1:] ** 2))
    residual = max(total - harm_energy, 0.0)
    hnr = float(harm_energy / residual) if residual > 0 else None
    return {
        "f0": fnum(f0),
        "thd": fnum(thd) if thd is not None else None,
        "hnr": fnum(hnr) if hnr is not None else None,
        "fund": fnum(fund),
        "n_harmonics": len(harmonics),
        "harmonics": harmonics,
        "harmonic_energy": fnum(harm_energy),
    }


def comb_energy(freqs: np.ndarray, power: np.ndarray, f0: float, n_harmonics: int = 8) -> float:
    if f0 <= 0 or power.size < 4:
        return 0.0
    df = float(freqs[1] - freqs[0]) if freqs.size > 1 else 1.0
    half = max(df * 1.5, f0 * 0.02)
    total = 0.0
    for k in range(1, n_harmonics + 1):
        fk = k * f0
        if fk >= float(freqs[-1]):
            break
        mask = np.abs(freqs - fk) <= half
        if np.any(mask):
            total += float(np.sum(power[mask]))
    return total


def scan_comb(
    freqs: np.ndarray,
    power: np.ndarray,
    peaks: list[dict[str, Any]],
    *,
    draws_per_year: float,
) -> dict[str, Any]:
    n = max(4, 2 * (len(freqs) - 1))
    fmin = 1.0 / n
    fmax = 0.25
    df = float(freqs[1] - freqs[0]) if freqs.size > 1 else 1.0
    peak_freqs = [
        float(p.get("cycles_per_draw") or 0.0)
        for p in peaks
        if (p.get("cycles_per_draw") or 0.0) > 0
    ]
    candidates: list[float] = []
    for f in peak_freqs:
        for k in range(1, 9):
            f0 = f / k
            if fmin <= f0 <= fmax:
                candidates.append(f0)
    candidates.extend(peak_freqs)
    if draws_per_year > 0:
        for k in (1, 2, 4):
            f0 = k / draws_per_year
            if fmin <= f0 <= fmax:
                candidates.append(f0)
    best_f0 = 0.0
    best_score = -1.0
    seen: set[int] = set()
    for f0 in candidates:
        key = int(round(f0 * 10_000))
        if key in seen:
            continue
        seen.add(key)
        score = comb_energy(freqs, power, f0)
        fund = float(np.interp(f0, freqs, power))
        # Une sous-harmonique capte la raie au rang k>1 : la fondamentale
        # doit elle-même porter une part visible du peigne.
        if score > 0 and fund < 0.15 * score:
            score *= 0.05
        near = any(abs(f0 - pf) <= 1.75 * df for pf in peak_freqs)
        if not near:
            score *= 0.2
        if score > best_score:
            best_score = score
            best_f0 = f0
    thd = thd_hnr(freqs, np.sqrt(np.maximum(power, 0.0)), best_f0) if best_f0 else {}
    pack = freq_pack(best_f0, draws_per_year) if best_f0 else freq_pack(0.0, draws_per_year)
    total = float(np.sum(power[1:])) if power.size > 1 else 0.0
    return {
        **pack,
        "score": fnum(best_score),
        "fraction": fnum(best_score / total) if total > 0 else 0.0,
        "thd": thd.get("thd") if thd else None,
        "hnr": thd.get("hnr") if thd else None,
        "harmonics": thd.get("harmonics") or [],
    }


def calendar_comb(
    freqs: np.ndarray, power: np.ndarray, mag: np.ndarray, draws_per_year: float
) -> dict[str, Any]:
    if draws_per_year <= 0:
        return {"fundamentals": [], "energy": 0.0, "fraction": 0.0}
    items = []
    energy = 0.0
    for k, label in ((1, "année"), (2, "semestre"), (4, "trimestre")):
        f0 = k / draws_per_year
        if f0 >= 0.5:
            continue
        e = comb_energy(freqs, power, f0, n_harmonics=6)
        energy += e
        items.append(
            {
                "label": label,
                "k": k,
                **freq_pack(f0, draws_per_year),
                "amp": fnum(interpolate_amp(freqs, mag, f0)),
                "energy": fnum(e),
            }
        )
    total = float(np.sum(power[1:])) if power.size > 1 else 0.0
    return {
        "fundamentals": items,
        "energy": fnum(energy),
        "fraction": fnum(energy / total) if total > 0 else 0.0,
        "draws_per_year": fnum(draws_per_year),
    }


def real_cepstrum(x: np.ndarray, *, draws_per_year: float) -> dict[str, Any]:
    x = detrend_mean(np.asarray(x, dtype=float))
    n = int(x.size)
    if n < 8:
        return {"points": [], "peaks": []}
    w = window_array("hann", n)
    mag = np.abs(rfft(x * w))
    log_mag = np.log(np.maximum(mag, 1e-12))
    cep = irfft(log_mag)
    quef = np.arange(cep.size, dtype=float)
    # Quefrency utile : 2 .. n/2 (période en tirages)
    body = np.abs(cep)
    body[:2] = 0.0
    half = n // 2
    peaks_idx, _ = find_peaks(body[:half], prominence=np.median(body[2:half]) * 2 if half > 4 else None)
    peaks: list[dict[str, Any]] = []
    for k in peaks_idx[:8]:
        period = float(quef[k])
        if period < 2:
            continue
        f0 = 1.0 / period
        peaks.append(
            {
                "quefrency_draws": fnum(period),
                **freq_pack(f0, draws_per_year),
                "amp": fnum(body[k]),
            }
        )
    peaks.sort(key=lambda row: row["amp"], reverse=True)
    return {
        "points": downsample_xy(quef[:half], body[:half], 256),
        "peaks": peaks[:8],
    }


def welch_psd(x: np.ndarray, *, nperseg: int | None = None) -> tuple[np.ndarray, np.ndarray]:
    x = detrend_mean(np.asarray(x, dtype=float))
    n = int(x.size)
    if n < 8:
        return np.array([0.0]), np.array([0.0])
    if nperseg is None:
        nperseg = int(min(n, max(16, 2 ** int(np.floor(np.log2(max(16, n // 4)))))))
    nperseg = max(8, min(int(nperseg), n))
    freqs, pxx = welch(
        x,
        fs=1.0,
        window="hann",
        nperseg=nperseg,
        noverlap=max(0, nperseg // 2),
        detrend="constant",
        scaling="spectrum",
    )
    return freqs, pxx


def multitaper_psd(x: np.ndarray, *, nw: float = 3.0, kmax: int = 5) -> dict[str, Any]:
    x = detrend_mean(np.asarray(x, dtype=float))
    n = int(x.size)
    freqs = rfftfreq(n, d=1.0)
    empty = {"freqs": flist(freqs), "power": flist(np.zeros_like(freqs)), "f_test": []}
    if n < 16:
        return empty
    k = int(min(kmax, n - 2, max(2, int(2 * nw - 1))))
    try:
        tapers = dpss(n, nw, Kmax=k)
    except Exception:
        return empty
    specs = np.stack([rfft(x * np.asarray(h, dtype=float)) for h in tapers], axis=0)
    power = np.mean(np.abs(specs) ** 2, axis=0)
    mean = specs.mean(axis=0)
    resid = np.mean(np.abs(specs - mean) ** 2, axis=0)
    f_stat = (k - 1) * np.abs(mean) ** 2 / (resid + 1e-18)
    f_stat[0] = 0.0
    idx, _ = find_peaks(f_stat, prominence=max(float(np.median(f_stat[1:])) * 3, 4.0))
    lines = []
    for i in idx[np.argsort(f_stat[idx])[::-1][:8]]:
        lines.append({"bin": int(i), "freq": fnum(freqs[i]), "f_stat": fnum(f_stat[i])})
    return {"freqs": freqs, "power": power, "f_test": lines, "f_stat": f_stat}


def lomb_scargle(
    t_days: np.ndarray, x: np.ndarray, *, draws_per_year: float
) -> dict[str, Any]:
    t_years = np.asarray(t_days, dtype=float) / 365.25
    y = detrend_mean(np.asarray(x, dtype=float))
    if t_years.size < 8:
        return {"points": [], "peaks": [], "calendar": []}
    span = float(t_years[-1] - t_years[0]) if t_years.size else 0.0
    f_min = 0.25 if span <= 0 else max(0.25, 1.0 / span)
    f_max = min(12.0, 0.45 * draws_per_year) if draws_per_year else 12.0
    freqs = np.linspace(f_min, max(f_min * 1.1, f_max), 400)
    omega = 2.0 * np.pi * freqs
    try:
        power = lombscargle(t_years, y, omega, normalize=True)
    except TypeError:
        try:
            power = lombscargle(t_years, y, omega, normalize="normalize")
        except Exception:
            return {"points": [], "peaks": [], "calendar": []}
    except Exception:
        return {"points": [], "peaks": [], "calendar": []}
    peaks_idx, _ = find_peaks(power, prominence=max(float(np.median(power)) * 2, 0.02))
    peaks: list[dict[str, Any]] = []
    for i in peaks_idx[np.argsort(power[peaks_idx])[::-1][:8]]:
        f_year = float(freqs[i])
        f_draw = f_year / draws_per_year if draws_per_year else 0.0
        peaks.append(
            {
                "cycles_per_year": fnum(f_year),
                "cycles_per_draw": fnum(f_draw),
                "period_draws": fnum(1.0 / f_draw) if f_draw else None,
                "power": fnum(power[i]),
            }
        )
    calendar = []
    for k, label in ((1, "année"), (2, "semestre"), (4, "trimestre")):
        amp = float(np.interp(k, freqs, power))
        calendar.append({"label": label, "cycles_per_year": k, "power": fnum(amp)})
    return {
        "points": downsample_xy(freqs, power, 400),
        "peaks": peaks,
        "calendar": calendar,
    }


def spectrum_bundle(
    x: np.ndarray,
    t_days: np.ndarray,
    *,
    window: str = "blackmanharris",
    draws_per_year: float = 104.0,
    nperseg: int | None = None,
) -> dict[str, Any]:
    freqs, mag, power = rfft_spectrum(x, window=window)
    peaks = peak_list(freqs, mag, draws_per_year=draws_per_year)
    comb = scan_comb(freqs, power, peaks, draws_per_year=draws_per_year)
    cal = calendar_comb(freqs, power, mag, draws_per_year)
    f0 = float(comb.get("cycles_per_draw") or 0.0)
    thd = thd_hnr(freqs, mag, f0) if f0 else {"thd": None, "hnr": None, "harmonics": []}
    w_freq, w_psd = welch_psd(x, nperseg=nperseg)
    mt = multitaper_psd(x)
    cep = real_cepstrum(x, draws_per_year=draws_per_year)
    lomb = lomb_scargle(t_days, x, draws_per_year=draws_per_year)
    welch_peaks = peak_list(w_freq, np.sqrt(np.maximum(w_psd, 0.0)), draws_per_year=draws_per_year, max_peaks=10)
    mt_peaks = []
    if isinstance(mt.get("freqs"), np.ndarray):
        mt_peaks = peak_list(
            np.asarray(mt["freqs"]),
            np.sqrt(np.maximum(np.asarray(mt["power"]), 0.0)),
            draws_per_year=draws_per_year,
            max_peaks=8,
        )
    return {
        "window": window,
        "fft": {
            "points": downsample_xy(freqs, db10(power), 512),
            "peaks": peaks,
            "unit": "dB",
        },
        "comb": comb,
        "calendar": cal,
        "thd": thd,
        "cepstrum": cep,
        "welch": {
            "points": downsample_xy(w_freq, db10(w_psd), 512),
            "peaks": welch_peaks,
            "nperseg": int(nperseg or min(int(x.size), max(16, int(x.size) // 4))),
        },
        "multitaper": {
            "points": downsample_xy(
                np.asarray(mt["freqs"]), db10(np.asarray(mt["power"])), 512
            )
            if isinstance(mt.get("freqs"), np.ndarray)
            else downsample_xy(np.asarray(mt.get("freqs") or [0.0]), np.zeros(1)),
            "f_test": mt.get("f_test") or [],
            "peaks": mt_peaks,
        },
        "lombscargle": lomb,
        "freqs": freqs,
        "mag": mag,
        "power": power,
        "mt_power": mt.get("power"),
        "mt_freqs": mt.get("freqs"),
        "welch_freqs": w_freq,
        "welch_power": w_psd,
    }
