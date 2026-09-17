"""Entraînement walk-forward, rapport 20/50/100, sauvegarde, inférence."""

from __future__ import annotations

import shutil
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import numpy as np

from synchro.analysis.variables import VARIABLE_NAMES, series as extract_series
from synchro.brain_specialists.features import (
    series_matrix,
    validate_indicators,
    warmup_needed,
)
from synchro.brain_specialists.metrics import (
    hypergeom_parity_pmf,
    score_classes,
    score_regression,
    window_slice,
)
from synchro.brain_specialists.model import (
    TinyMLP,
    fit_mlp,
    predict_proba,
    predict_regression,
)
from synchro.brain_specialists.store import (
    SPECIALISTS_DIR,
    canonicalize_config,
    ensure_dir,
    list_slugs,
    load_weights,
    read_json,
    save_weights,
    slugify,
    specialist_dir,
    write_json,
)

SCORE_WINDOWS = (20, 50, 100)
DEFAULT_ABSTAIN = 0.45
CLASS_TARGETS = {"parity", "high_low", "consecutive"}
DISCLAIMER = (
    "Forecast d’une série nommée (évolution t+1), pas d’une grille 5+2. "
    "Les tirages restent indépendants : le skill vs le hasard dit si le "
    "spécialiste sert, pas quoi jouer."
)


def _draw_date(draw: dict[str, Any]) -> str:
    raw = draw.get("draw_date") or draw.get("date")
    if hasattr(raw, "isoformat"):
        return raw.isoformat()[:10]
    return str(raw)[:10]


def normalize_draws(draws: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out = []
    for draw in draws:
        numbers = [int(n) for n in draw["numbers"]]
        stars = [int(s) for s in draw["stars"]]
        out.append(
            {
                "draw_date": _draw_date(draw),
                "numbers": numbers,
                "stars": stars,
                "star_pool": int(draw.get("star_pool") or 12),
                "weekday": draw.get("weekday"),
            }
        )
    out.sort(key=lambda item: item["draw_date"])
    return out


def make_uniform_draws(n: int, seed: int = 0, start: str = "2017-01-03") -> list[dict[str, Any]]:
    rng = np.random.default_rng(int(seed))
    day = date.fromisoformat(start)
    rows: list[dict[str, Any]] = []
    for i in range(int(n)):
        numbers = rng.choice(np.arange(1, 51), size=5, replace=False)
        stars = rng.choice(np.arange(1, 13), size=2, replace=False)
        rows.append(
            {
                "draw_date": day.isoformat(),
                "numbers": sorted(int(x) for x in numbers),
                "stars": sorted(int(x) for x in stars),
                "star_pool": 12,
                "weekday": "mardi" if i % 2 == 0 else "vendredi",
            }
        )
        day += timedelta(days=3 if i % 2 == 0 else 4)
    return rows


def default_task(target: str) -> str:
    return "classes" if target in CLASS_TARGETS else "regression"


def _encode_y(values: np.ndarray, task: str, horizon: str) -> tuple[np.ndarray, int]:
    if horizon == "delta":
        delta = np.empty_like(values)
        delta[0] = np.nan
        delta[1:] = values[1:] - values[:-1]
        values = delta
    if task == "regression":
        return values.astype(float), 1
    if task == "binary":
        # Parité : majorité de pairs (≥ 3). Autres : au-dessus de la médiane des définis.
        finite = values[np.isfinite(values)]
        if finite.size and np.unique(np.round(finite)).size <= 6 and finite.max() <= 5:
            threshold = 3.0
        else:
            threshold = float(np.median(finite)) if finite.size else 0.0
        encoded = np.where(np.isfinite(values), (values >= threshold).astype(float), np.nan)
        return encoded, 2
    # classes : entiers 0..k
    rounded = np.round(values)
    finite = rounded[np.isfinite(rounded)]
    n_classes = int(finite.max()) + 1 if finite.size else 1
    n_classes = max(n_classes, 2)
    return rounded, n_classes


def build_dataset(
    draws: list[dict[str, Any]],
    *,
    target: str,
    indicators: list[str],
    task: str,
    horizon: str = "value",
    n: int | None = None,
) -> dict[str, Any]:
    if target not in VARIABLE_NAMES:
        raise ValueError(f"Cible inconnue: {target}")
    names = validate_indicators(indicators)
    rows = normalize_draws(draws)
    extracted = extract_series(rows, target, n=n)
    values = np.array([float(v) for v in extracted["values"]], dtype=float)
    dates = [str(p["date"]) for p in extracted["points"]]
    features = series_matrix(values.tolist(), names)
    y_full, n_classes = _encode_y(values, task, horizon)
    warmup = warmup_needed(names)
    xs: list[np.ndarray] = []
    ys: list[float] = []
    persist: list[float] = []
    used_dates: list[str] = []
    feature_index: list[int] = []
    for t in range(warmup, len(values) - 1):
        row = features[t]
        target_y = y_full[t + 1]
        if not np.isfinite(row).all() or not np.isfinite(target_y):
            continue
        xs.append(row)
        ys.append(float(target_y))
        persist.append(float(y_full[t]) if np.isfinite(y_full[t]) else float("nan"))
        used_dates.append(dates[t])
        feature_index.append(t)
    x = np.vstack(xs) if xs else np.zeros((0, len(names)))
    y = np.array(ys, dtype=float)
    persist_arr = np.array(persist, dtype=float)
    return {
        "x": x,
        "y": y,
        "persist": persist_arr,
        "dates": used_dates,
        "feature_index": feature_index,
        "features": features,
        "values": values,
        "y_full": y_full,
        "dates_full": dates,
        "indicators": names,
        "n_classes": n_classes,
        "warmup": warmup,
        "draw_count": len(rows),
        "from_date": dates[0] if dates else None,
        "to_date": dates[-1] if dates else None,
    }


def _holdout_cut(n: int) -> int:
    """Entraîne avant les 100 derniers échantillons (ou 30 % si trop court)."""
    if n < 40:
        return max(1, int(n * 0.7))
    return max(20, n - 100)


def _standardize(train: np.ndarray, test: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    mean = train.mean(axis=0)
    std = train.std(axis=0)
    std = np.where(std < 1e-8, 1.0, std)
    return (train - mean) / std, (test - mean) / std, mean, std


def _windows_report(
    y: np.ndarray,
    persist: np.ndarray,
    *,
    task: str,
    pred: np.ndarray | None,
    proba: np.ndarray | None,
    prior: np.ndarray | None,
    train_mean: float | None = None,
) -> dict[str, Any]:
    n = int(y.size)
    out: dict[str, Any] = {}
    baseline = float(train_mean) if train_mean is not None else float(np.mean(y)) if n else 0.0
    for last in SCORE_WINDOWS:
        sl = window_slice(n, last)
        yw = y[sl]
        pw = persist[sl]
        if yw.size == 0:
            out[str(last)] = {"n": 0, "skill": None, "verdict": "insuffisant"}
            continue
        if task == "regression":
            mean_pred = np.full(yw.shape, baseline)
            persist_pred = np.where(np.isfinite(pw), pw, mean_pred)
            out[str(last)] = score_regression(yw, pred[sl], mean_pred, persist_pred)
        else:
            assert proba is not None and prior is not None
            persist_cls = np.where(
                np.isfinite(pw),
                np.clip(np.round(pw), 0, proba.shape[1] - 1),
                prior.argmax(),
            )
            out[str(last)] = score_classes(yw, proba[sl], persist_cls, prior)
    return out


def _primary_skill(windows: dict[str, Any]) -> float:
    for key in ("50", "100", "20"):
        row = windows.get(key) or {}
        skill = row.get("skill")
        if skill is not None and row.get("n", 0) >= 8:
            return float(skill)
    return 0.0


def train_specialist(
    draws: list[dict[str, Any]],
    *,
    name: str,
    target: str,
    indicators: list[str],
    instructions: str,
    task: str | None = None,
    horizon: str = "value",
    n: int | None = None,
    hidden: int = 16,
    epochs: int = 80,
    seed: int = 0,
    force: bool = False,
    root: Path | None = None,
    abstain: float = DEFAULT_ABSTAIN,
) -> dict[str, Any]:
    label = (name or "").strip()
    if not label:
        raise ValueError("Nom du spécialiste obligatoire.")
    charter = (instructions or "").strip()
    if not charter:
        raise ValueError("Instructions complémentaires obligatoires.")
    if horizon not in {"value", "delta"}:
        raise ValueError("horizon doit être value ou delta.")
    kind = task or default_task(target)
    if kind not in {"regression", "classes", "binary"}:
        raise ValueError("task doit être regression, classes ou binary.")
    slug = slugify(label)
    data = build_dataset(draws, target=target, indicators=indicators, task=kind, horizon=horizon, n=n)
    x, y = data["x"], data["y"]
    if x.shape[0] < 24:
        raise ValueError(f"Pas assez d’échantillons causaux ({x.shape[0]}). Allonge l’archive.")
    cut = _holdout_cut(x.shape[0])
    x_train, x_test = x[:cut], x[cut:]
    y_train, y_test = y[:cut], y[cut:]
    persist_test = data["persist"][cut:]
    x_tr, x_te, mean, std = _standardize(x_train, x_test if x_test.size else x_train[:0].reshape(0, x.shape[1]))
    n_classes = int(data["n_classes"])
    if kind != "regression":
        y_train_fit = np.clip(np.round(y_train), 0, n_classes - 1)
        y_test_fit = np.clip(np.round(y_test), 0, n_classes - 1) if y_test.size else y_test
        counts = np.bincount(y_train_fit.astype(int), minlength=n_classes).astype(float)
        if target == "parity" and kind == "classes" and n_classes == 6:
            prior = np.array(hypergeom_parity_pmf(), dtype=float)
        else:
            prior = counts / max(counts.sum(), 1.0)
        net = fit_mlp(
            x_tr,
            y_train_fit,
            kind=kind,
            n_hidden=hidden,
            epochs=epochs,
            seed=seed,
            n_classes=n_classes,
        )
        proba_te = predict_proba(net, x_te) if x_te.shape[0] else np.zeros((0, n_classes))
        if x_te.shape[0] == 0:
            windows = _windows_report(
                y_train_fit,
                data["persist"][:cut],
                task=kind,
                pred=None,
                proba=predict_proba(net, x_tr),
                prior=prior,
            )
        else:
            windows = _windows_report(
                y_test_fit,
                persist_test,
                task=kind,
                pred=None,
                proba=proba_te,
                prior=prior,
            )
    else:
        net = fit_mlp(x_tr, y_train, kind="regression", n_hidden=hidden, epochs=epochs, seed=seed)
        train_mean = float(np.mean(y_train))
        if x_te.shape[0] == 0:
            pred_tr, _ = predict_regression(net, x_tr)
            windows = _windows_report(
                y_train,
                data["persist"][:cut],
                task="regression",
                pred=pred_tr,
                proba=None,
                prior=None,
                train_mean=train_mean,
            )
        else:
            pred_te, _ = predict_regression(net, x_te)
            windows = _windows_report(
                y_test,
                persist_test,
                task="regression",
                pred=pred_te,
                proba=None,
                prior=None,
                train_mean=train_mean,
            )
        prior = None

    skill = _primary_skill(windows)
    saved = False
    reason = None
    if skill <= 0 and not force:
        reason = (
            f"skill {skill:.3f} ≤ 0 sur la fenêtre de score : le spécialiste "
            "ne bat pas moyenne/persistance. Coche « sauver quand même » pour forcer."
        )
        payload = _public_record(
            slug=slug,
            name=label,
            target=target,
            task=kind,
            horizon=horizon,
            indicators=data["indicators"],
            instructions=charter,
            n=n,
            windows=windows,
            skill=skill,
            saved=False,
            reason=reason,
            data=data,
            hidden=hidden,
            epochs=epochs,
            seed=seed,
            abstain=abstain,
            last_forecast=None,
        )
        return payload

    # Poids de production : réentraîner sur tout l’échantillon causal.
    x_all, _, mean_all, std_all = _standardize(x, x)
    if kind == "regression":
        prod = fit_mlp(x_all, y, kind="regression", n_hidden=hidden, epochs=epochs, seed=seed)
        last_forecast = _infer_from_net(
            prod, data, mean_all, std_all, kind=kind, n_classes=1, abstain=abstain, prior=None
        )
    else:
        y_all = np.clip(np.round(y), 0, n_classes - 1)
        prod = fit_mlp(x_all, y_all, kind=kind, n_hidden=hidden, epochs=epochs, seed=seed, n_classes=n_classes)
        last_forecast = _infer_from_net(
            prod, data, mean_all, std_all, kind=kind, n_classes=n_classes, abstain=abstain, prior=prior
        )

    directory = ensure_dir(specialist_dir(slug, root=root or SPECIALISTS_DIR))
    config = {
        "slug": slug,
        "name": label,
        "handle": f"specialist.{slug}",
        "target": target,
        "task": kind,
        "horizon": horizon,
        "indicators": data["indicators"],
        "instructions": charter,
        "n": n,
        "hidden": hidden,
        "epochs": epochs,
        "seed": seed,
        "abstain": abstain,
        "n_classes": n_classes,
        "mean": mean_all.tolist(),
        "std": std_all.tolist(),
        "disclaimer": DISCLAIMER,
    }
    report = {
        "slug": slug,
        "windows": windows,
        "skill": round(skill, 4),
        "verdict": (windows.get("50") or windows.get("100") or windows.get("20") or {}).get("verdict"),
        "train_samples": int(cut),
        "test_samples": int(x_test.shape[0]),
        "draw_count": data["draw_count"],
        "from_date": data["from_date"],
        "to_date": data["to_date"],
        "forced": bool(force and skill <= 0),
        "last_forecast": last_forecast,
        "disclaimer": DISCLAIMER,
    }
    write_json(directory / "config.json", config)
    write_json(directory / "report.json", report)
    dumped = prod.dump()
    save_weights(
        directory / "weights.npz",
        {
            "W1": dumped["W1"],
            "b1": dumped["b1"],
            "W2": dumped["W2"],
            "b2": dumped["b2"],
            "mean": mean_all,
            "std": std_all,
            "n_in": dumped["n_in"],
            "n_hidden": dumped["n_hidden"],
            "n_out": dumped["n_out"],
        },
    )
    saved = True
    return _public_record(
        slug=slug,
        name=label,
        target=target,
        task=kind,
        horizon=horizon,
        indicators=data["indicators"],
        instructions=charter,
        n=n,
        windows=windows,
        skill=skill,
        saved=saved,
        reason=None,
        data=data,
        hidden=hidden,
        epochs=epochs,
        seed=seed,
        abstain=abstain,
        last_forecast=last_forecast,
        forced=bool(force and skill <= 0),
    )


def _public_record(**kwargs: Any) -> dict[str, Any]:
    data = kwargs.pop("data")
    windows = kwargs["windows"]
    primary = windows.get("50") or windows.get("100") or windows.get("20") or {}
    return {
        "ok": True,
        "slug": kwargs["slug"],
        "name": kwargs["name"],
        "handle": f"specialist.{kwargs['slug']}",
        "target": kwargs["target"],
        "task": kwargs["task"],
        "horizon": kwargs["horizon"],
        "indicators": kwargs["indicators"],
        "instructions": kwargs["instructions"],
        "n": kwargs["n"],
        "windows": windows,
        "skill": round(float(kwargs["skill"]), 4),
        "skill_20": (windows.get("20") or {}).get("skill"),
        "skill_50": (windows.get("50") or {}).get("skill"),
        "skill_100": (windows.get("100") or {}).get("skill"),
        "verdict": primary.get("verdict"),
        "saved": kwargs["saved"],
        "reason": kwargs.get("reason"),
        "forced": kwargs.get("forced", False),
        "draw_count": data["draw_count"],
        "from_date": data["from_date"],
        "to_date": data["to_date"],
        "hidden": kwargs["hidden"],
        "epochs": kwargs["epochs"],
        "seed": kwargs["seed"],
        "abstain": kwargs["abstain"],
        "last_forecast": kwargs.get("last_forecast"),
        "disclaimer": DISCLAIMER,
    }


def _infer_from_net(
    net: TinyMLP,
    data: dict[str, Any],
    mean: np.ndarray,
    std: np.ndarray,
    *,
    kind: str,
    n_classes: int,
    abstain: float,
    prior: np.ndarray | None,
) -> dict[str, Any]:
    features: np.ndarray = data["features"]
    idx = None
    for i in range(features.shape[0] - 1, -1, -1):
        if np.isfinite(features[i]).all():
            idx = i
            break
    if idx is None:
        return {"ok": False, "error": "aucune feature causale"}
    x = ((features[idx] - mean) / std).reshape(1, -1)
    as_of = data["dates_full"][idx]
    if kind == "regression":
        mu, sigma = predict_regression(net, x)
        conf = float(1.0 / (1.0 + float(sigma[0])))
        abstained = conf < abstain
        return {
            "ok": True,
            "as_of": as_of,
            "horizon": "t+1",
            "value": round(float(mu[0]), 4),
            "sigma": round(float(sigma[0]), 4),
            "confidence": round(conf, 4),
            "abstain": abstained,
            "class_id": None,
            "proba": None,
        }
    proba = predict_proba(net, x)[0]
    class_id = int(proba.argmax())
    conf = float(proba[class_id])
    return {
        "ok": True,
        "as_of": as_of,
        "horizon": "t+1",
        "value": float(class_id),
        "sigma": round(float(1.0 - conf), 4),
        "confidence": round(conf, 4),
        "abstain": conf < abstain,
        "class_id": class_id,
        "proba": [round(float(p), 4) for p in proba],
    }


def load_specialist(slug: str, *, root: Path | None = None) -> dict[str, Any]:
    directory = specialist_dir(slug, root=root or SPECIALISTS_DIR)
    config_path = directory / "config.json"
    if not config_path.exists():
        raise FileNotFoundError(slug)
    config = canonicalize_config(read_json(config_path))
    report = read_json(directory / "report.json") if (directory / "report.json").exists() else {}
    weights = load_weights(directory / "weights.npz")
    net = TinyMLP.load(
        {
            "W1": weights["W1"],
            "b1": weights["b1"],
            "W2": weights["W2"],
            "b2": weights["b2"],
            "n_in": int(weights["n_in"]),
            "n_hidden": int(weights["n_hidden"]),
            "n_out": int(weights["n_out"]),
        }
    )
    return {
        "slug": config["slug"],
        "config": config,
        "report": report,
        "net": net,
        "mean": np.asarray(weights["mean"], dtype=float),
        "std": np.asarray(weights["std"], dtype=float),
        "directory": str(directory),
    }


def infer_specialist(
    draws: list[dict[str, Any]],
    slug: str,
    *,
    root: Path | None = None,
) -> dict[str, Any]:
    packed = load_specialist(slug, root=root)
    config = packed["config"]
    data = build_dataset(
        draws,
        target=config["target"],
        indicators=config["indicators"],
        task=config["task"],
        horizon=config.get("horizon") or "value",
        n=config.get("n"),
    )
    forecast = _infer_from_net(
        packed["net"],
        data,
        packed["mean"],
        packed["std"],
        kind=config["task"],
        n_classes=int(config.get("n_classes") or packed["net"].n_out),
        abstain=float(config.get("abstain") or DEFAULT_ABSTAIN),
        prior=None,
    )
    report = packed["report"]
    return {
        "ok": True,
        "slug": config["slug"],
        "name": config["name"],
        "handle": config["handle"],
        "target": config["target"],
        "task": config["task"],
        "horizon": config.get("horizon") or "value",
        "indicators": config["indicators"],
        "instructions": config["instructions"],
        "windows": report.get("windows") or {},
        "skill": report.get("skill"),
        "skill_20": ((report.get("windows") or {}).get("20") or {}).get("skill"),
        "skill_50": ((report.get("windows") or {}).get("50") or {}).get("skill"),
        "skill_100": ((report.get("windows") or {}).get("100") or {}).get("skill"),
        "verdict": report.get("verdict"),
        "forecast": forecast,
        "disclaimer": DISCLAIMER,
        "as_of": forecast.get("as_of"),
        "to_date": data["to_date"],
    }


def list_specialists(*, root: Path | None = None) -> list[dict[str, Any]]:
    base = root or SPECIALISTS_DIR
    items = []
    for slug in list_slugs(base):
        try:
            packed = load_specialist(slug, root=base)
        except (OSError, KeyError, ValueError):
            continue
        config = packed["config"]
        report = packed["report"]
        items.append(
            {
                "slug": config["slug"],
                "name": config["name"],
                "handle": config["handle"],
                "target": config["target"],
                "task": config["task"],
                "horizon": config.get("horizon") or "value",
                "indicators": config["indicators"],
                "instructions": config["instructions"],
                "windows": report.get("windows") or {},
                "skill": report.get("skill"),
                "skill_20": ((report.get("windows") or {}).get("20") or {}).get("skill"),
                "skill_50": ((report.get("windows") or {}).get("50") or {}).get("skill"),
                "skill_100": ((report.get("windows") or {}).get("100") or {}).get("skill"),
                "verdict": report.get("verdict"),
                "last_forecast": report.get("last_forecast"),
                "from_date": report.get("from_date"),
                "to_date": report.get("to_date"),
                "disclaimer": DISCLAIMER,
            }
        )
    return items


def delete_specialist(slug: str, *, root: Path | None = None) -> bool:
    directory = specialist_dir(slug, root=root or SPECIALISTS_DIR)
    if not directory.exists():
        return False
    shutil.rmtree(directory)
    return True
