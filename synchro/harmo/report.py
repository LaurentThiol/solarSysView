"""Payloads JSON par vue Harmo."""

from __future__ import annotations

from typing import Any

import numpy as np

from synchro.analysis.variables import VARIABLE_NAMES
from synchro.harmo.envelope import envelope_bundle
from synchro.harmo.hpss import hpss_bundle
from synchro.harmo.null import null_spectrum_stats
from synchro.harmo.orders import orders_bundle
from synchro.harmo.series import build_signal
from synchro.harmo.spectrum import spectrum_bundle
from synchro.harmo.tf import tf_bundle
from synchro.harmo.unmix import unmix_shares
from synchro.harmo.util import DISCLAIMER, fnum

WINDOWS = ("blackmanharris", "flattop", "hann")


def window_public(resolved: dict[str, Any]) -> dict[str, Any]:
    return {
        "preset": resolved.get("preset"),
        "from_date": resolved.get("from_date"),
        "to_date": resolved.get("to_date"),
        "draw_count": resolved.get("draw_count"),
        "warmup_count": resolved.get("warmup_count"),
        "warmup_from": resolved.get("warmup_from"),
        "star_pools": resolved.get("star_pools"),
        "star_pool_break": resolved.get("star_pool_break"),
    }


def _short_payload(signal: dict[str, Any], window: dict[str, Any]) -> dict[str, Any]:
    return {
        "ok": False,
        "error": (
            f"Fenêtre trop courte pour une étude spectrale "
            f"({signal['draw_count']} tirages, minimum {signal['min_samples']})."
        ),
        "draw_count": signal["draw_count"],
        "min_samples": signal["min_samples"],
        "variable": signal["variable"],
        "n": signal["n"],
        "window": window,
        "notes": signal["notes"],
        "disclaimer": DISCLAIMER,
    }


def build_context(
    work: list[dict[str, Any]],
    *,
    variable: str,
    n: int | None,
    resolved: dict[str, Any],
) -> dict[str, Any]:
    if variable not in VARIABLE_NAMES:
        raise ValueError(f"Variable inconnue: {variable}")
    signal = build_signal(
        work,
        variable=variable,
        n=n,
        with_warmup=resolved.get("with_warmup"),
        warmup_count=int(resolved.get("warmup_count") or 0),
    )
    signal["window"] = window_public(resolved)
    return signal


def _base(signal: dict[str, Any]) -> dict[str, Any]:
    sampling = dict(signal["sampling"])
    sampling.pop("t_days", None)
    return {
        "ok": True,
        "variable": signal["variable"],
        "n": signal["n"],
        "draw_count": signal["draw_count"],
        "from_date": signal["from_date"],
        "to_date": signal["to_date"],
        "sampling": sampling,
        "notes": signal["notes"],
        "window": signal.get("window") or {},
        "disclaimer": DISCLAIMER,
    }


def spectrum_report(signal: dict[str, Any], *, window: str = "blackmanharris") -> dict[str, Any]:
    if signal.get("too_short"):
        return _short_payload(signal, signal.get("window") or {})
    win = window if window in WINDOWS else "blackmanharris"
    dpy = float(signal["sampling"]["draws_per_year"])
    spec = spectrum_bundle(
        signal["x"], signal["t_days"], window=win, draws_per_year=dpy
    )
    out = _base(signal)
    out.update(
        {
            "fft": spec["fft"],
            "comb": spec["comb"],
            "calendar": spec["calendar"],
            "thd": spec["thd"],
            "cepstrum": spec["cepstrum"],
            "lombscargle": spec["lombscargle"],
            "multitaper": spec["multitaper"],
            "fft_window": win,
        }
    )
    return out


def welch_report(signal: dict[str, Any], *, nperseg: int | None = None) -> dict[str, Any]:
    if signal.get("too_short"):
        return _short_payload(signal, signal.get("window") or {})
    dpy = float(signal["sampling"]["draws_per_year"])
    spec = spectrum_bundle(
        signal["x"], signal["t_days"], draws_per_year=dpy, nperseg=nperseg
    )
    tf = tf_bundle(signal["x"], nperseg=nperseg, draws_per_year=dpy, want_sst=False)
    hpss = hpss_bundle(tf["mag"], signal["x"])
    out = _base(signal)
    out.update(
        {
            "welch": spec["welch"],
            "multitaper": spec["multitaper"],
            "hpss": {
                "harmonic_energy": hpss["harmonic_energy"],
                "percussive_energy": hpss["percussive_energy"],
                "harmonic_fraction": hpss["harmonic_fraction"],
                "percussive_fraction": hpss["percussive_fraction"],
                "source": hpss["source"],
                "librosa": hpss.get("librosa"),
            },
            "calendar": spec["calendar"],
        }
    )
    return out


def stft_report(
    signal: dict[str, Any], *, nperseg: int | None = None, want_sst: bool = True
) -> dict[str, Any]:
    if signal.get("too_short"):
        return _short_payload(signal, signal.get("window") or {})
    dpy = float(signal["sampling"]["draws_per_year"])
    tf = tf_bundle(signal["x"], nperseg=nperseg, draws_per_year=dpy, want_sst=want_sst)
    ridges = []
    for ridge in tf["ridges"]:
        ridges.append(
            {
                "kind": ridge["kind"],
                "slope": ridge["slope"],
                "energy": ridge["energy"],
                "mean_freq": ridge["mean_freq"],
                "cycles_per_draw": ridge.get("cycles_per_draw"),
                "cycles_per_year": ridge.get("cycles_per_year"),
                "period_draws": ridge.get("period_draws"),
                "df_span": ridge["df_span"],
                "times": ridge["times"],
                "freqs": ridge["freqs"],
            }
        )
    out = _base(signal)
    out.update(
        {
            "nperseg": tf["nperseg"],
            "hop": tf["hop"],
            "stft": tf["stft"],
            "sst": tf["sst"],
            "ridges": ridges,
            "cwt": tf["cwt"],
            "ssq": tf["ssq"],
        }
    )
    return out


def envelope_report(signal: dict[str, Any]) -> dict[str, Any]:
    if signal.get("too_short"):
        return _short_payload(signal, signal.get("window") or {})
    dpy = float(signal["sampling"]["draws_per_year"])
    env = envelope_bundle(signal["x"], draws_per_year=dpy, dates=signal["dates"])
    out = _base(signal)
    out.update(
        {
            "envelope": env["envelope"],
            "spectrum": env["spectrum"],
            "inst_freq": env["inst_freq"],
            "energy": env["energy"],
            "mean": env["mean"],
            "snr": env.get("snr"),
            "periodic": env.get("periodic"),
        }
    )
    return out


def orders_report(signal: dict[str, Any], *, nperseg: int | None = None) -> dict[str, Any]:
    if signal.get("too_short"):
        return _short_payload(signal, signal.get("window") or {})
    dpy = float(signal["sampling"]["draws_per_year"])
    tf = tf_bundle(signal["x"], nperseg=nperseg, draws_per_year=dpy, want_sst=False)
    tracked = orders_bundle(signal["x"], tf["ridges"])
    out = _base(signal)
    out.update(
        {
            "ok_orders": bool(tracked.get("ok")),
            "reason": tracked.get("reason"),
            "n_revolutions": tracked.get("n_revolutions"),
            "points": tracked.get("points") or [],
            "peaks": tracked.get("peaks") or [],
            "f_inst": tracked.get("f_inst") or [],
            "ridge": tracked.get("ridge"),
            "ridges": [
                {
                    "kind": r["kind"],
                    "mean_freq": ridge_mean(r),
                    "slope": r["slope"],
                    "energy": r["energy"],
                }
                for r in tf["ridges"]
            ],
        }
    )
    return out


def ridge_mean(ridge: dict[str, Any]) -> float:
    return fnum(ridge.get("mean_freq"))


def unmix_report(signal: dict[str, Any], *, nperseg: int | None = None) -> dict[str, Any]:
    if signal.get("too_short"):
        return _short_payload(signal, signal.get("window") or {})
    dpy = float(signal["sampling"]["draws_per_year"])
    spec = spectrum_bundle(signal["x"], signal["t_days"], draws_per_year=dpy, nperseg=nperseg)
    tf = tf_bundle(signal["x"], nperseg=nperseg, draws_per_year=dpy, want_sst=False)
    env = envelope_bundle(signal["x"], draws_per_year=dpy, dates=signal["dates"])
    hpss = hpss_bundle(tf["mag"], signal["x"])
    mix = unmix_shares(
        fft_power=spec["power"],
        comb_energy=float(spec["comb"].get("score") or 0.0),
        comb_fraction=float(spec["comb"].get("fraction") or 0.0),
        ridges=tf["ridges"],
        envelope_energy=float(env.get("energy") or 0.0),
        envelope_snr=float(env.get("snr") or 0.0),
        envelope_periodic=bool(env.get("periodic")),
        harmonic_energy=float(hpss["harmonic_energy"]),
        percussive_energy=float(hpss["percussive_energy"]),
    )
    classified = []
    for peak in spec["fft"]["peaks"][:8]:
        q = float(peak.get("q") or 0.0)
        kind = "grid" if q > 8 else "acoustic"
        classified.append({**peak, "kind": kind})
    for ridge in tf["ridges"]:
        classified.append(
            {
                "kind": ridge["kind"],
                "cycles_per_draw": ridge.get("cycles_per_draw"),
                "cycles_per_year": ridge.get("cycles_per_year"),
                "period_draws": ridge.get("period_draws"),
                "amp": ridge.get("energy"),
                "q": None,
                "source": "ridge",
                "slope": ridge["slope"],
            }
        )
    out = _base(signal)
    out.update(
        {
            "shares": mix["shares"],
            "components": mix["components"],
            "smear": mix["smear"],
            "comb": spec["comb"],
            "calendar": spec["calendar"],
            "thd": spec["thd"],
            "peaks": classified,
            "ridges": [
                {
                    "kind": r["kind"],
                    "slope": r["slope"],
                    "energy": r["energy"],
                    "mean_freq": r["mean_freq"],
                    "cycles_per_draw": r.get("cycles_per_draw"),
                    "cycles_per_year": r.get("cycles_per_year"),
                }
                for r in tf["ridges"]
            ],
            "hpss": {
                "harmonic_fraction": hpss["harmonic_fraction"],
                "percussive_fraction": hpss["percussive_fraction"],
                "librosa": hpss.get("librosa"),
            },
        }
    )
    return out


def null_report(
    work: list[dict[str, Any]],
    signal: dict[str, Any],
    *,
    window: str = "blackmanharris",
    n_sim: int = 40,
    seed: int = 0,
) -> dict[str, Any]:
    if signal.get("too_short"):
        return _short_payload(signal, signal.get("window") or {})
    spec = spectrum_bundle(
        signal["x"],
        signal["t_days"],
        window=window,
        draws_per_year=float(signal["sampling"]["draws_per_year"]),
    )
    peak = 0.0
    if spec["fft"]["peaks"]:
        peak = float(spec["fft"]["peaks"][0]["amp"])
    else:
        mag = np.asarray(spec["mag"])
        if mag.size > 1:
            peak = float(np.max(mag[1:]))
    thd = spec["thd"].get("thd") if spec.get("thd") else None
    stats = null_spectrum_stats(
        work,
        variable=signal["variable"],
        n=signal["n"],
        window=window,
        n_sim=n_sim,
        seed=seed,
        observed_peak=peak,
        observed_thd=thd,
    )
    out = _base(signal)
    out.update(stats)
    out["thd_observed"] = spec["thd"]
    out["comb"] = spec["comb"]
    out["fft_peaks"] = spec["fft"]["peaks"][:6]
    return out
