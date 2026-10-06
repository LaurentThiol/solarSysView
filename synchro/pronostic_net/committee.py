"""Comité de onze têtes et d’un global, fenêtre strictement antérieure.

k n’entre pas ici. Le navigateur applique la marge sur les (μ, σ) renvoyés.
"""

from __future__ import annotations

import os
import time
from typing import Any

import numpy as np

from synchro.brain_specialists.model import TinyMLP, _adam_step, fit_mlp, predict_regression

AXES: tuple[dict[str, Any], ...] = (
    {"id": "sum", "pool": "numbers", "kind": "sum"},
    {"id": "parity", "pool": "numbers", "kind": "parity"},
    {"id": "n1", "pool": "numbers", "kind": "slot", "slot": 0},
    {"id": "n2", "pool": "numbers", "kind": "slot", "slot": 1},
    {"id": "n3", "pool": "numbers", "kind": "slot", "slot": 2},
    {"id": "n4", "pool": "numbers", "kind": "slot", "slot": 3},
    {"id": "n5", "pool": "numbers", "kind": "slot", "slot": 4},
    {"id": "starSum", "pool": "stars", "kind": "sum"},
    {"id": "starParity", "pool": "stars", "kind": "parity"},
    {"id": "e1", "pool": "stars", "kind": "slot", "slot": 0},
    {"id": "e2", "pool": "stars", "kind": "slot", "slot": 1},
)

N_AXES = len(AXES)
HIDDEN = 8
MIN_FIT = 4
MIN_GLOBAL = 8
GATE_WINDOW = 10
SCALE_MIN = 5
SCALE_Q = 0.6827
SCALE_FLOOR = 1e-6
NUMBER_SLOTS = (2, 3, 4, 5, 6)
STAR_SLOTS = (9, 10)
SUM_INDEX = {"numbers": 0, "stars": 7}
SCOPES = ("mixte", "mardi", "vendredi")
# En dessous, le démarrage des processus coûte plus cher que le calcul.
PARALLEL_MIN_DRAWS = 160


def slot_bounds(pool: str, index: int) -> tuple[float, float]:
    """n_i ∈ [i, pool − draw + i], i à partir de 1."""
    draw = 5 if pool == "numbers" else 2
    size = 50 if pool == "numbers" else 12
    i = index + 1
    return float(i), float(size - draw + i)


def axis_bounds(axis: dict[str, Any]) -> tuple[float, float]:
    if axis["kind"] == "sum":
        return (15.0, 240.0) if axis["pool"] == "numbers" else (3.0, 23.0)
    if axis["kind"] == "parity":
        return (0.0, 5.0) if axis["pool"] == "numbers" else (0.0, 2.0)
    return slot_bounds(axis["pool"], int(axis["slot"]))


def sigma_scale(abs_z: list[float]) -> float:
    """Facteur pour que μ ± 1 σ couvre environ 68 % des tirages d’avant.

    Moins de cinq écarts, ou un quantile quasi nul : on laisse σ tel quel.
    """
    if len(abs_z) < SCALE_MIN:
        return 1.0
    quantile = float(np.quantile(np.asarray(abs_z, dtype=float), SCALE_Q, method="linear"))
    if not np.isfinite(quantile) or quantile < SCALE_FLOOR:
        return 1.0
    return quantile


def project_increasing(mus: list[float], los: list[float], his: list[float]) -> list[float]:
    """n1 ≤ n2 ≤ … dans les bornes emboîtées de chaque rang."""
    x = [min(his[i], max(los[i], float(mus[i]))) for i in range(len(mus))]
    n = len(x)
    for _ in range(n + 1):
        for i in range(1, n):
            x[i] = min(his[i], max(los[i], max(x[i], x[i - 1])))
        for i in range(n - 2, -1, -1):
            x[i] = min(his[i], max(los[i], min(x[i], x[i + 1])))
    return x


def clip_sum(mu: float, slot_mus: list[float], slot_sigmas: list[float], lo: float, hi: float) -> float:
    """Ramène la somme près de la somme des rangs, dans les bornes théoriques."""
    center = float(sum(slot_mus))
    spread = max(1.0, float(sum(max(0.0, s) for s in slot_sigmas)))
    band_lo = max(lo, center - spread)
    band_hi = min(hi, center + spread)
    if band_lo > band_hi:
        return min(hi, max(lo, center))
    return min(band_hi, max(band_lo, float(mu)))


def project_moments(mu: list[float], sigma: list[float]) -> list[float]:
    """μ jouables : rangs croissants, somme compatible, parité dans ses bornes."""
    out = [float(value) for value in mu]
    for pool, slots in (("numbers", NUMBER_SLOTS), ("stars", STAR_SLOTS)):
        los = []
        his = []
        for index in slots:
            lo, hi = axis_bounds(AXES[index])
            los.append(lo)
            his.append(hi)
        ordered = project_increasing([out[index] for index in slots], los, his)
        for index, value in zip(slots, ordered):
            out[index] = value
        sum_index = SUM_INDEX[pool]
        lo, hi = axis_bounds(AXES[sum_index])
        out[sum_index] = clip_sum(
            out[sum_index],
            [out[index] for index in slots],
            [float(sigma[index]) for index in slots],
            lo,
            hi,
        )
    for index, axis in enumerate(AXES):
        if axis["kind"] != "parity":
            continue
        lo, hi = axis_bounds(axis)
        out[index] = min(hi, max(lo, out[index]))
    return out


def _num(value: float) -> float:
    if not np.isfinite(value):
        return 0.0
    return float(round(float(value), 6))


def _features(values: np.ndarray) -> np.ndarray:
    n = int(values.shape[0])
    mu = float(values.mean()) if n else 0.0
    if n < 2:
        sd = 0.0
    else:
        sd = float(np.sqrt(((values - mu) ** 2).sum() / (n - 1)))
    last = float(values[-1]) if n else 0.0
    z = 0.0 if sd <= 1e-12 else (last - mu) / sd
    x = np.arange(n, dtype=float)
    x -= x.mean() if n else 0.0
    denom = float((x * x).sum())
    slope = float((x * (values - mu)).sum() / denom) if denom > 0 else 0.0
    half = n // 2
    gap = float(values[half:].mean() - values[:half].mean()) if half else 0.0
    return np.array([mu, sd, last, z, slope, gap], dtype=float)


def _standardize(x: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    mu = x.mean(axis=0)
    sd = x.std(axis=0)
    sd = np.where(sd < 1e-8, 1.0, sd)
    return mu, sd


def _fit_predict_axis(x: np.ndarray, y: np.ndarray, query: np.ndarray, epochs: int, seed: int) -> tuple[float, float]:
    y_mu = float(y.mean())
    y_sd = float(y.std())
    if y_sd < 1e-8:
        return y_mu, 0.0
    x_mu, x_sd = _standardize(x)
    net = fit_mlp(
        (x - x_mu) / x_sd,
        (y - y_mu) / y_sd,
        kind="regression",
        n_hidden=HIDDEN,
        epochs=max(1, epochs),
        lr=0.05,
        batch=max(1, min(32, int(y.shape[0]))),
        l2=1e-3,
        seed=seed,
    )
    mu_z, sigma_z = predict_regression(net, ((query - x_mu) / x_sd).reshape(1, -1))
    mu = float(mu_z[0]) * y_sd + y_mu
    sigma = abs(float(sigma_z[0])) * y_sd
    if not np.isfinite(mu) or not np.isfinite(sigma):
        return y_mu, float(np.sqrt(((y - y_mu) ** 2).sum() / max(len(y) - 1, 1)))
    return mu, sigma


def _fit_gaussian_multi(
    x: np.ndarray,
    y: np.ndarray,
    *,
    epochs: int,
    seed: int,
) -> TinyMLP:
    n = int(x.shape[0])
    n_axes = int(y.shape[1])
    net = TinyMLP(int(x.shape[1]), HIDDEN, n_axes * 2, seed=seed)
    if n == 0:
        return net
    rng = np.random.default_rng(seed + 7)
    batch_size = max(1, min(32, n))
    moments = [(np.zeros_like(p), np.zeros_like(p)) for p in net.params()]
    step = 0
    l2 = 1e-3
    lr = 0.05
    for _ in range(max(1, epochs)):
        order = rng.permutation(n)
        for start in range(0, n, batch_size):
            idx = order[start : start + batch_size]
            xb = x[idx]
            yb = y[idx]
            logits, hidden = net.forward(xb)
            n_b = float(xb.shape[0])
            mu = logits[:, 0::2]
            log_sigma = np.clip(logits[:, 1::2], -5.0, 2.0)
            resid = mu - yb
            inv_var = np.exp(-2.0 * log_sigma)
            d_out = np.empty_like(logits)
            d_out[:, 0::2] = resid * inv_var / n_b
            d_out[:, 1::2] = (1.0 - (resid * resid) * inv_var) / n_b
            d_hidden = d_out @ net.W2.T
            d_hidden *= (hidden > 0).astype(float)
            grads = [
                xb.T @ d_hidden + l2 * net.W1,
                d_hidden.sum(axis=0),
                hidden.T @ d_out + l2 * net.W2,
                d_out.sum(axis=0),
            ]
            step += 1
            for param, grad, (m, v) in zip(net.params(), grads, moments):
                np.clip(grad, -5.0, 5.0, out=grad)
                _adam_step(param, grad, m, v, step, lr)
    return net


def _fit_predict_global(
    x: np.ndarray,
    y: np.ndarray,
    query: np.ndarray,
    epochs: int,
    seed: int,
) -> tuple[np.ndarray, np.ndarray]:
    y_mu = y.mean(axis=0)
    y_sd = y.std(axis=0)
    y_sd = np.where(y_sd < 1e-8, 1.0, y_sd)
    x_mu, x_sd = _standardize(x)
    net = _fit_gaussian_multi((x - x_mu) / x_sd, (y - y_mu) / y_sd, epochs=epochs, seed=seed)
    logits, _ = net.forward(((query - x_mu) / x_sd).reshape(1, -1))
    mu = logits[0, 0::2] * y_sd + y_mu
    sigma = np.exp(np.clip(logits[0, 1::2], -5.0, 2.0)) * y_sd
    return mu.astype(float), np.abs(sigma).astype(float)


def _median(values: list[float]) -> float:
    return float(np.median(np.asarray(values, dtype=float)))


def _scale_from_history(
    history_mu: list[np.ndarray],
    history_sigma: list[np.ndarray],
    history_actual: list[np.ndarray],
) -> np.ndarray:
    scales = np.ones(N_AXES, dtype=float)
    for axis in range(N_AXES):
        abs_z: list[float] = []
        for mu, sigma, actual in zip(history_mu, history_sigma, history_actual):
            raw = float(sigma[axis])
            if raw <= SCALE_FLOOR:
                continue
            abs_z.append(abs(float(actual[axis]) - float(mu[axis])) / raw)
        scales[axis] = sigma_scale(abs_z)
    return scales


def _axis_payload(
    *,
    mu: np.ndarray,
    sigma: np.ndarray,
    baseline_mu: np.ndarray,
    baseline_sigma: np.ndarray,
    fell_back: list[bool],
    actual: np.ndarray | None,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for index, axis in enumerate(AXES):
        item: dict[str, Any] = {
            "id": axis["id"],
            "mu": _num(float(mu[index])),
            "sigma": _num(max(0.0, float(sigma[index]))),
            "baselineMu": _num(float(baseline_mu[index])),
            "baselineSigma": _num(max(0.0, float(baseline_sigma[index]))),
            "fellBack": bool(fell_back[index]),
        }
        if actual is not None:
            item["actual"] = _num(float(actual[index]))
        rows.append(item)
    return rows


def parse_committee_request(payload: Any) -> tuple[int, list[Any]]:
    """Lit le corps sans le rejeter pour un seul champ mal typé."""
    if not isinstance(payload, dict):
        raise ValueError("Le comité n’a pas reçu une requête lisible.")
    lookback = payload.get("lookback")
    if lookback in (50, "50"):
        window = 50
    elif lookback in (20, "20"):
        window = 20
    else:
        raise ValueError("La fenêtre du comité est 20 ou 50.")
    draws = payload.get("draws", [])
    if not isinstance(draws, list):
        raise ValueError("Les tirages du comité sont illisibles.")
    if len(draws) > 5000:
        raise ValueError("Trop de tirages pour le comité.")
    return window, draws


def _ball(value: Any) -> int:
    if isinstance(value, bool) or value is None:
        raise TypeError
    if isinstance(value, float) and not value.is_integer():
        raise ValueError
    return int(value)


def _normalize_draws(draws: list[Any]) -> list[dict[str, Any]]:
    cleaned: list[dict[str, Any]] = []
    for item in draws:
        if not isinstance(item, dict):
            continue
        try:
            numbers = sorted(_ball(value) for value in item.get("numbers") or [])
            stars = sorted(_ball(value) for value in item.get("stars") or [])
        except (TypeError, ValueError):
            continue
        if len(numbers) != 5 or len(set(numbers)) != 5:
            continue
        if len(stars) != 2 or len(set(stars)) != 2:
            continue
        if any(value < 1 or value > 50 for value in numbers):
            continue
        if any(value < 1 or value > 12 for value in stars):
            continue
        weekday = str(item.get("weekday") or "").strip().lower()
        if weekday not in ("mardi", "vendredi"):
            weekday = ""
        cleaned.append(
            {
                "date": str(item.get("date") or ""),
                "numbers": numbers,
                "stars": stars,
                "weekday": weekday,
            }
        )
    cleaned.sort(key=lambda draw: (draw["date"], ",".join(map(str, draw["numbers"]))))
    return cleaned


def _values_of(draw: dict[str, Any]) -> np.ndarray:
    numbers = draw["numbers"]
    stars = draw["stars"]
    return np.array(
        [
            float(sum(numbers)),
            float(sum(1 for value in numbers if value % 2 == 0)),
            *[float(value) for value in numbers],
            float(sum(stars)),
            float(sum(1 for value in stars if value % 2 == 0)),
            *[float(value) for value in stars],
        ],
        dtype=float,
    )


def run_scope(
    draws: list[dict[str, Any]],
    lookback: int,
    *,
    epochs: int = 8,
    seed: int = 0,
) -> dict[str, Any]:
    """Walk-forward sur une série déjà filtrée. lookback tirages strictement avant t."""
    window = max(2, int(lookback))
    n = len(draws)
    if n < window:
        return {"available": n, "rows": [], "next": None}
    values = np.vstack([_values_of(draw) for draw in draws])
    feats = np.zeros((n + 1, N_AXES, 6), dtype=float)
    for t in range(window, n + 1):
        block = values[t - window : t]
        for axis in range(N_AXES):
            feats[t, axis] = _features(block[:, axis])

    raw_mu = np.full((n, N_AXES), np.nan)
    fitted = np.zeros((n, N_AXES), dtype=bool)
    base_mu_at = np.zeros((n, N_AXES), dtype=float)
    history_mu: list[np.ndarray] = []
    history_sigma: list[np.ndarray] = []
    history_actual: list[np.ndarray] = []
    global_x: list[np.ndarray] = []
    global_y: list[np.ndarray] = []
    rows: list[dict[str, Any]] = []

    def forecast_at(t: int) -> tuple[np.ndarray, np.ndarray, list[bool], np.ndarray, np.ndarray]:
        baseline_mu = feats[t, :, 0].copy()
        baseline_sigma = np.maximum(feats[t, :, 1], 0.0)
        gated_mu = baseline_mu.copy()
        gated_sigma = baseline_sigma.copy()
        fell_back = [True] * N_AXES
        for axis in range(N_AXES):
            # La fenêtre du comité, pas toute l’archive : sinon chaque tirage
            # réapprend des milliers de lignes et la requête expire.
            train_idx = list(range(max(window, t - window), t))
            y = values[train_idx, axis] if train_idx else np.zeros(0)
            used_net = False
            pred_mu = float(baseline_mu[axis])
            pred_sigma = float(baseline_sigma[axis])
            if len(train_idx) >= MIN_FIT and float(y.std()) >= 1e-8:
                x = feats[train_idx, axis, :]
                pred_mu, pred_sigma = _fit_predict_axis(
                    x,
                    y,
                    feats[t, axis],
                    epochs,
                    seed + axis * 17 + window,
                )
                used_net = True
                if t < n:
                    raw_mu[t, axis] = pred_mu
                    fitted[t, axis] = True
            if t < n:
                base_mu_at[t, axis] = float(baseline_mu[axis])
            priors: list[int] = []
            for s in range(min(t, n) - 1, window - 1, -1):
                if fitted[s, axis]:
                    priors.append(s)
                if len(priors) >= GATE_WINDOW:
                    break
            replace = not used_net
            if used_net and priors:
                net_err = [abs(float(raw_mu[s, axis]) - float(values[s, axis])) for s in priors]
                base_err = [abs(float(base_mu_at[s, axis]) - float(values[s, axis])) for s in priors]
                replace = _median(net_err) > _median(base_err)
            fell_back[axis] = replace
            if not replace:
                gated_mu[axis] = pred_mu
                gated_sigma[axis] = max(0.0, pred_sigma)
        return gated_mu, gated_sigma, fell_back, baseline_mu, baseline_sigma

    for t in range(window, n):
        actual = values[t]
        gated_mu, gated_sigma, fell_back, baseline_mu, baseline_sigma = forecast_at(t)
        g_input = np.concatenate([gated_mu, gated_sigma, baseline_mu, baseline_sigma])
        fell_all = all(fell_back)
        if fell_all:
            emitted_mu = baseline_mu.copy()
            raw_sigma = baseline_sigma.copy()
            shown_sigma = baseline_sigma.copy()
        else:
            if len(global_x) >= MIN_GLOBAL:
                g_mu, g_sigma = _fit_predict_global(
                    np.vstack(global_x[-window:]),
                    np.vstack(global_y[-window:]),
                    g_input,
                    epochs,
                    seed + 1000 + window,
                )
                work_mu = np.where(np.isfinite(g_mu), g_mu, gated_mu)
                work_sigma = np.where(np.isfinite(g_sigma), np.maximum(g_sigma, 0.0), gated_sigma)
            else:
                work_mu = gated_mu
                work_sigma = gated_sigma
            emitted_mu = np.asarray(project_moments(work_mu.tolist(), work_sigma.tolist()), dtype=float)
            raw_sigma = work_sigma
            scales = _scale_from_history(
                history_mu[-window:],
                history_sigma[-window:],
                history_actual[-window:],
            )
            shown_sigma = raw_sigma * scales
        history_mu.append(emitted_mu.copy())
        history_sigma.append(raw_sigma.copy())
        history_actual.append(actual.copy())
        global_x.append(g_input.copy())
        global_y.append(actual.copy())
        draw = draws[t]
        rows.append(
            {
                "date": draw["date"],
                "weekday": draw["weekday"] or None,
                "fellBackAll": fell_all,
                "numbers": draw["numbers"],
                "stars": draw["stars"],
                "axes": _axis_payload(
                    mu=emitted_mu,
                    sigma=shown_sigma,
                    baseline_mu=baseline_mu,
                    baseline_sigma=baseline_sigma,
                    fell_back=fell_back,
                    actual=actual,
                ),
            }
        )

    next_mu, next_sigma, next_back, next_base_mu, next_base_sigma = forecast_at(n)
    next_input = np.concatenate([next_mu, next_sigma, next_base_mu, next_base_sigma])
    next_all = all(next_back)
    if next_all:
        emitted_mu = next_base_mu.copy()
        shown_sigma = next_base_sigma.copy()
    else:
        if len(global_x) >= MIN_GLOBAL:
            g_mu, g_sigma = _fit_predict_global(
                np.vstack(global_x[-window:]),
                np.vstack(global_y[-window:]),
                next_input,
                epochs,
                seed + 1000 + window,
            )
            work_mu = np.where(np.isfinite(g_mu), g_mu, next_mu)
            work_sigma = np.where(np.isfinite(g_sigma), np.maximum(g_sigma, 0.0), next_sigma)
        else:
            work_mu = next_mu
            work_sigma = next_sigma
        emitted_mu = np.asarray(project_moments(work_mu.tolist(), work_sigma.tolist()), dtype=float)
        scales = _scale_from_history(
            history_mu[-window:],
            history_sigma[-window:],
            history_actual[-window:],
        )
        shown_sigma = work_sigma * scales
    return {
        "available": n,
        "rows": rows,
        "next": {
            "fellBackAll": next_all,
            "axes": _axis_payload(
                mu=emitted_mu,
                sigma=shown_sigma,
                baseline_mu=next_base_mu,
                baseline_sigma=next_base_sigma,
                fell_back=next_back,
                actual=None,
            ),
        },
    }


def _fit_scopes(
    scopes: dict[str, list[dict[str, Any]]],
    lookback: int,
    *,
    epochs: int,
    seed: int,
    parallel: bool,
) -> tuple[dict[str, Any], int]:
    """Les trois séries ne partagent rien. Les fils Python ne servent pas : NumPy tient le verrou."""
    runnable = [(name, series) for name, series in scopes.items() if len(series) >= max(2, int(lookback))]
    if not parallel or len(runnable) < 2 or (os.cpu_count() or 1) < 2:
        fitted = {
            name: run_scope(series, lookback, epochs=epochs, seed=seed) for name, series in scopes.items()
        }
        return fitted, 1
    from synchro.pronostic_net.workers import run_scope_job, scope_pool, scope_workers

    jobs = [
        (name, series, int(lookback), int(epochs), int(seed)) for name, series in scopes.items()
    ]
    try:
        fitted = dict(scope_pool().map(run_scope_job, jobs))
    except Exception:
        from synchro.pronostic_net.workers import close_scope_pool

        close_scope_pool()
        fitted = {
            name: run_scope(series, lookback, epochs=epochs, seed=seed) for name, series in scopes.items()
        }
        return fitted, 1
    return fitted, scope_workers()


def run_confrontation(
    draws: list[Any],
    lookback: int,
    *,
    epochs: int = 8,
    seed: int = 0,
    parallel: bool | None = None,
) -> dict[str, Any]:
    """Trois séries : mixte (mardi + vendredi), mardi seul, vendredi seul.

    Un tirage sans jour ne compte que dans le mixte.
    Chaque tête et le global ne s’ajustent que sur les `lookback` situations d’avant.
    Les trois séries tournent en parallèle dès que l’archive est assez longue.
    """
    started = time.perf_counter()
    cleaned = _normalize_draws(draws)
    scopes = {
        "mixte": cleaned,
        "mardi": [draw for draw in cleaned if draw["weekday"] == "mardi"],
        "vendredi": [draw for draw in cleaned if draw["weekday"] == "vendredi"],
    }
    use_parallel = (
        max(len(series) for series in scopes.values()) >= PARALLEL_MIN_DRAWS
        if parallel is None
        else parallel
    )
    fitted, workers = _fit_scopes(scopes, lookback, epochs=epochs, seed=seed, parallel=use_parallel)
    return {
        "lookback": int(lookback),
        "draws": len(cleaned),
        "trainCap": int(lookback),
        "elapsedMs": int(round((time.perf_counter() - started) * 1000)),
        "workers": workers,
        "scopes": fitted,
    }
