"""Pas du retour : les modèles d’un tirage, ajustés sur les seuls tirages d’avant.

Le pronostic, le retour de nextData et nextDataTraining lisent les mêmes pas, au
même réglage : mêmes arbres, mêmes quantiles, Darts et Chronos compris. Un pas
ne dépend que des tirages qui le précèdent. Il se calcule une fois, se range
dans `.nextdata/steps/`, puis se relit ; sa clé change avec ces tirages, le
réglage, le code des modèles et les versions des bibliothèques.

LightGBM et CatBoost s’ajustent dans des processus à part, un seul fil chacun,
comme dans l’API. `SYNCHRO_NEXTDATA_WORKERS` en fixe le nombre ; à 1, tout se
calcule dans le processus de l’API.
"""

from __future__ import annotations

import atexit
import hashlib
import json
import multiprocessing
import os
import threading
from concurrent.futures import Future, ProcessPoolExecutor
from concurrent.futures.process import BrokenProcessPool
from dataclasses import dataclass
from functools import lru_cache
from importlib import metadata
from pathlib import Path
from typing import Any, Iterable

from synchro.config import ROOT
from synchro.nextdata.forecast import (
    _installed,
    catboost_import_error,
    chronos_point,
    predict_moments,
    try_darts_medians,
)
from synchro.nextdata.panel import Frame

MODES = ("corpus", "fenetre")
QUANTILES = (0.1, 0.5, 0.9)
MIN_HISTORY = 16
MODEL_PARTS = ("lightgbm", "catboost")
CHRONOS_SERIES = ("sum", "star_sum", "n1")

_PACKAGE = Path(__file__).resolve().parent
_SOURCES = (
    _PACKAGE / "steps.py",
    _PACKAGE / "forecast.py",
    _PACKAGE / "covariates.py",
    _PACKAGE / "panel.py",
    _PACKAGE.parent / "short_cycle.py",
    _PACKAGE.parent / "analysis" / "common.py",
    _PACKAGE.parent / "analysis" / "variables.py",
    _PACKAGE.parent / "ref" / "cycles.py",
    _PACKAGE.parent / "ref" / "phases.py",
)
_LIBRARIES = ("numpy", "lightgbm", "catboost", "u8darts", "darts", "chronos-forecasting", "torch")


@dataclass(frozen=True)
class StepSettings:
    """Ce qui change un pas, en plus des tirages qui le précèdent."""

    focus: int
    families: tuple[str, ...]
    estimators: int
    quantiles: tuple[float, ...] = QUANTILES


def cache_dir() -> Path:
    raw = os.environ.get("SYNCHRO_NEXTDATA_CACHE")
    return Path(raw) if raw else ROOT / ".nextdata" / "steps"


def worker_count() -> int:
    raw = os.environ.get("SYNCHRO_NEXTDATA_WORKERS")
    if raw:
        try:
            return max(1, min(16, int(raw)))
        except ValueError:
            pass
    return max(1, min(4, (os.cpu_count() or 2) - 1))


def parts_needed(with_chronos: bool) -> tuple[str, ...]:
    parts = ["lightgbm"]
    if catboost_import_error() is None:
        parts.append("catboost")
    if _installed("darts"):
        parts.append("darts")
    if with_chronos and _installed("chronos"):
        parts.append("chronos")
    return tuple(parts)


@lru_cache(maxsize=1)
def _fingerprint() -> str:
    digest = hashlib.sha256()
    for path in _SOURCES:
        digest.update(path.name.encode())
        digest.update(path.read_bytes() if path.exists() else b"")
    for name in _LIBRARIES:
        try:
            version = metadata.version(name)
        except metadata.PackageNotFoundError:
            version = ""
        digest.update(f"{name}={version};".encode())
    return digest.hexdigest()


def prefix_digests(rows: list[dict[str, Any]]) -> list[str]:
    """Empreinte de rows[:t] pour chaque t de 0 à len(rows)."""
    digest = hashlib.sha256()
    out = [digest.hexdigest()]
    for row in rows:
        digest.update(json.dumps([row["date"], row["numbers"], row["stars"]]).encode())
        out.append(digest.hexdigest())
    return out


def horizon_of(frame: Frame, t: int) -> list[dict[str, Any]]:
    """Le tirage prévu au pas t et celui d’après : seules leurs horloges sont lues."""
    rows = frame.rows
    if t >= len(rows):
        return list(frame.horizon)
    follower = rows[t + 1] if t + 1 < len(rows) else frame.horizon[0]
    return [rows[t], follower]


def step_key(digest: str, horizon: list[dict[str, Any]], settings: StepSettings, part: str) -> str:
    payload: dict[str, Any] = {
        "code": _fingerprint(),
        "part": part,
        "draws": digest,
        "horizon": [item["date"] for item in horizon],
        "focus": int(settings.focus),
        "families": sorted(settings.families),
    }
    if part in MODEL_PARTS:
        payload["estimators"] = int(settings.estimators)
        payload["quantiles"] = [float(value) for value in settings.quantiles]
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()


def _path(key: str) -> Path:
    return cache_dir() / key[:2] / f"{key}.json"


def load_part(key: str) -> Any | None:
    try:
        return json.loads(_path(key).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def save_part(key: str, data: Any) -> None:
    path = _path(key)
    temp = path.with_name(f"{path.name}.{os.getpid()}.{threading.get_ident()}.tmp")
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        temp.write_text(json.dumps(data), encoding="utf-8")
        os.replace(temp, path)
    except OSError:
        temp.unlink(missing_ok=True)


def compute_part(
    prefix: list[dict[str, Any]],
    horizon: list[dict[str, Any]],
    part: str,
    settings: StepSettings,
) -> dict[str, Any]:
    """Un morceau d’un pas, pour les deux modes : LightGBM, CatBoost, Darts ou Chronos."""
    out: dict[str, Any] = {}
    for mode in MODES:
        if part in MODEL_PARTS:
            try:
                moments, importance, _engine = predict_moments(
                    prefix,
                    horizon,
                    mode=mode,
                    focus=settings.focus,
                    families=settings.families,
                    estimators=settings.estimators,
                    quantiles=settings.quantiles,
                    library=part,
                )
            except Exception as exc:
                out[mode] = {"error": str(exc) or type(exc).__name__}
            else:
                out[mode] = {"moments": moments, "importance": importance}
        elif part == "darts":
            out[mode] = try_darts_medians(
                prefix,
                horizon,
                mode=mode,
                focus=settings.focus,
                families=settings.families,
            )
        elif part == "chronos":
            window = prefix[-settings.focus :] if mode == "fenetre" else prefix
            out[mode] = {name: chronos_point([float(row[name]) for row in window]) for name in CHRONOS_SERIES}
    # Même structure qu’un morceau relu du cache.
    return json.loads(json.dumps(out))


def _part_job(
    prefix: list[dict[str, Any]],
    horizon: list[dict[str, Any]],
    part: str,
    settings: dict[str, Any],
) -> dict[str, Any]:
    return compute_part(
        prefix,
        horizon,
        part,
        StepSettings(
            focus=int(settings["focus"]),
            families=tuple(settings["families"]),
            estimators=int(settings["estimators"]),
            quantiles=tuple(settings["quantiles"]),
        ),
    )


_POOL: ProcessPoolExecutor | None = None
_POOL_OFF = False
_POOL_LOCK = threading.Lock()


def _pool() -> ProcessPoolExecutor | None:
    global _POOL
    with _POOL_LOCK:
        if _POOL_OFF:
            return None
        if _POOL is None:
            try:
                _POOL = ProcessPoolExecutor(
                    max_workers=worker_count(),
                    mp_context=multiprocessing.get_context("spawn"),
                )
            except (OSError, ValueError):
                return None
        return _POOL


def _drop_pool() -> None:
    """Un processus de calcul est mort : la suite se calcule dans l’API."""
    global _POOL, _POOL_OFF
    with _POOL_LOCK:
        if _POOL is not None:
            _POOL.shutdown(wait=False, cancel_futures=True)
        _POOL = None
        _POOL_OFF = True


@atexit.register
def _close_pool() -> None:
    if _POOL is not None:
        _POOL.shutdown(wait=False, cancel_futures=True)


def _compute(
    frame: Frame,
    batch: list[tuple[int, dict[str, str], dict[str, Any]]],
    settings: StepSettings,
) -> dict[int, dict[str, Any]]:
    done: dict[int, dict[str, Any]] = {}
    jobs: list[tuple[int, str, str]] = []
    for t, keys, found in batch:
        done[t] = dict(found)
        jobs.extend((t, part, key) for part, key in keys.items() if part not in found)
    pool = _pool() if worker_count() > 1 and any(part in MODEL_PARTS for _t, part, _key in jobs) else None
    futures: list[tuple[Future, tuple[int, str, str]]] = []
    inline: list[tuple[int, str, str]] = []
    shared = {
        "focus": settings.focus,
        "families": list(settings.families),
        "estimators": settings.estimators,
        "quantiles": list(settings.quantiles),
    }
    for job in jobs:
        t, part, _key = job
        if pool is not None and part in MODEL_PARTS:
            futures.append((pool.submit(_part_job, frame.rows[:t], horizon_of(frame, t), part, shared), job))
        else:
            inline.append(job)

    def keep(job: tuple[int, str, str], data: dict[str, Any]) -> None:
        t, part, key = job
        save_part(key, data)
        done[t][part] = data

    for job in inline:
        t, part, _key = job
        keep(job, compute_part(frame.rows[:t], horizon_of(frame, t), part, settings))
    for future, job in futures:
        t, part, _key = job
        try:
            data = future.result()
        except BrokenProcessPool:
            _drop_pool()
            data = compute_part(frame.rows[:t], horizon_of(frame, t), part, settings)
        except Exception:
            data = compute_part(frame.rows[:t], horizon_of(frame, t), part, settings)
        keep(job, data)
    return done


def _combined(keys: dict[str, str], parts: dict[str, Any]) -> str:
    """Résume un pas par ses clés et son contenu : l’assemblage en mémoire s’y fie."""
    return hashlib.sha256(json.dumps([keys, parts], sort_keys=True).encode()).hexdigest()


def ensure_steps(
    frame: Frame,
    order: Iterable[int],
    settings: StepSettings,
    parts: Iterable[str],
    *,
    limit: int,
) -> tuple[dict[int, dict[str, Any]], int]:
    """Pas prêts parmi `order`, et le nombre qui reste à calculer.

    Au plus `limit` pas manquants sont calculés, dans l’ordre donné. Un pas prêt
    porte ses morceaux (`parts`) et une clé qui les résume (`key`).
    """
    wanted = tuple(parts)
    digests = prefix_digests(frame.rows)
    ready: dict[int, dict[str, Any]] = {}
    missing: list[tuple[int, dict[str, str], dict[str, Any]]] = []
    for t in order:
        keys = {part: step_key(digests[t], horizon_of(frame, t), settings, part) for part in wanted}
        found = {}
        for part, key in keys.items():
            data = load_part(key)
            if data is not None:
                found[part] = data
        if len(found) == len(keys):
            ready[t] = {"key": _combined(keys, found), "parts": found}
        else:
            missing.append((t, keys, found))
    batch = missing[: max(0, int(limit))]
    computed = _compute(frame, batch, settings)
    for t, keys, _found in batch:
        ready[t] = {"key": _combined(keys, computed[t]), "parts": computed[t]}
    return ready, len(missing) - len(batch)
