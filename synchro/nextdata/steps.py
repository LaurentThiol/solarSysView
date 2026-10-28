"""Pas du retour : les modèles d’un tirage, ajustés sur les seuls tirages d’avant.

Le pronostic, le retour de nextData et nextDataTraining lisent les mêmes pas, au
même réglage : mêmes arbres, mêmes quantiles, Darts et Chronos compris. Un pas
ne dépend que des tirages qui le précèdent. Il se calcule une fois, se range
dans `.nextdata/steps/`, puis se relit. Sa clé change avec ces tirages, le
réglage, le code qui fait le morceau (`models` et les lignes qu’il lit) et les
bibliothèques de ce morceau. Ce fichier-ci, le cache et le pool, n’y entre pas.

LightGBM et CatBoost s’ajustent dans des processus à part, un seul fil chacun,
comme dans l’API. `SYNCHRO_NEXTDATA_WORKERS` en fixe le nombre ; à 1, tout se
calcule dans le processus de l’API.
"""

from __future__ import annotations

import atexit
import hashlib
import inspect
import json
import multiprocessing
import os
import threading
from concurrent.futures import Future, ProcessPoolExecutor
from concurrent.futures.process import BrokenProcessPool
from functools import lru_cache
from importlib import metadata
from pathlib import Path
from typing import Any, Iterable

from synchro.config import ROOT
from synchro.nextdata.forecast import _installed, catboost_import_error
from synchro.nextdata.models import MODEL_PARTS, StepSettings, chronos_error, compute_part, darts_error
from synchro.nextdata.notices import quiet_optional_model_notices
from synchro.nextdata.panel import Frame

# Le pool démarre par ce module. Le filtre est déjà posé via forecast ; on le redit ici.
quiet_optional_model_notices()

MIN_HISTORY = 16

_PACKAGE = Path(__file__).resolve().parent
_SOURCES = (
    _PACKAGE / "models.py",
    _PACKAGE / "covariates.py",
    _PACKAGE / "panel.py",
    _PACKAGE / "pulse_features.py",
    _PACKAGE.parent / "short_cycle.py",
    _PACKAGE.parent / "analysis" / "common.py",
    _PACKAGE.parent / "analysis" / "variables.py",
    _PACKAGE.parent / "ref" / "cycles.py",
    _PACKAGE.parent / "ref" / "phases.py",
    _PACKAGE.parent / "ref" / "seasons.py",
)
_LIBRARIES: dict[str, tuple[str, ...]] = {
    "lightgbm": ("numpy", "lightgbm"),
    "catboost": ("numpy", "catboost"),
    "darts": ("numpy", "lightgbm", "scikit-learn", "u8darts", "darts"),
    "chronos": ("numpy", "torch", "chronos-forecasting"),
}


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
    if _installed("darts") and darts_error() is None:
        parts.append("darts")
    if with_chronos and _installed("chronos") and chronos_error() is None:
        parts.append("chronos")
    return tuple(parts)


def _borrowed() -> str:
    """Ce que les lignes lisent hors de ces fichiers : la fondamentale Pulse et l’urne d’étoiles par date.

    Le reste de pulse/model.py et de fdj.py sert d’autres pages et ne change aucun pas.
    """
    from synchro import fdj
    from synchro.pulse import model as pulse_model

    pulse = [pulse_model.PERIOD_MIN, pulse_model.PERIOD_MAX, pulse_model.SCORE_FLOOR, pulse_model.SCORE_RATIO]
    urn = [inspect.getsource(fdj.star_pool_for), fdj.CURRENT_FORMAT_START.isoformat(), fdj.STARS_11_START.isoformat()]
    return json.dumps([pulse, urn])


@lru_cache(maxsize=None)
def _fingerprint(part: str) -> str:
    """Code et bibliothèques d’un morceau. L’assemblage, le cache et l’écran n’y entrent pas."""
    digest = hashlib.sha256()
    for path in _SOURCES:
        digest.update(path.name.encode())
        digest.update(path.read_bytes() if path.exists() else b"")
    digest.update(_borrowed().encode())
    for name in _LIBRARIES.get(part, ()):
        try:
            version = metadata.version(name)
        except metadata.PackageNotFoundError:
            version = ""
        digest.update(f"{name}={version};".encode())
    return digest.hexdigest()


def prefix_digests(rows: list[dict[str, Any]]) -> list[str]:
    """Empreinte de rows[:t] pour chaque t de 0 à len(rows) : dates, boules et urne d’étoiles."""
    digest = hashlib.sha256()
    out = [digest.hexdigest()]
    for row in rows:
        digest.update(json.dumps([row["date"], row["numbers"], row["stars"], row.get("star_pool")]).encode())
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
        "code": _fingerprint(part),
        "part": part,
        "draws": digest,
        "horizon": [item["date"] for item in horizon],
        "focus": int(settings.focus),
        "families": sorted(settings.families),
    }
    if settings.excluded:
        payload["excluded"] = sorted(settings.excluded)
    if part in MODEL_PARTS or part == "darts":
        payload["estimators"] = int(settings.estimators)
    if part in MODEL_PARTS:
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


_TRANSIENT: dict[str, Any] = {}
_TRANSIENT_CAP = 4096
_TRANSIENT_LOCK = threading.Lock()


def is_transient(data: Any) -> bool:
    """Un morceau dont un mode a échoué pour une raison qui peut passer (mémoire, bibliothèque)."""
    return isinstance(data, dict) and any(isinstance(block, dict) and block.get("transient") for block in data.values())


def remember_transient(key: str, data: Any) -> None:
    """Garde l’échec en mémoire, jusqu’au redémarrage de l’API : le sondage de la page ne reboucle pas dessus."""
    with _TRANSIENT_LOCK:
        if len(_TRANSIENT) >= _TRANSIENT_CAP:
            _TRANSIENT.clear()
        _TRANSIENT[key] = data


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
            excluded=tuple(settings.get("excluded") or ()),
        ),
    )


_POOL: ProcessPoolExecutor | None = None
_POOL_LOCK = threading.Lock()
_POOL_RESTARTS = 2
_POOL_DEATHS = 0
# Le plus long d’abord : un CatBoost lancé en dernier tiendrait seul la tranche.
_PART_ORDER = {"catboost": 0, "lightgbm": 1, "darts": 2, "chronos": 3}


def _pool() -> ProcessPoolExecutor | None:
    global _POOL
    with _POOL_LOCK:
        if _POOL_DEATHS > _POOL_RESTARTS:
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


def _drop_pool(broken: ProcessPoolExecutor | None) -> None:
    """Un processus de calcul est mort : le pool repart, deux fois au plus ; ensuite, tout se calcule dans l’API.

    Tous les calculs en cours sur ce pool échouent ensemble : seul le premier compte.
    """
    global _POOL, _POOL_DEATHS
    with _POOL_LOCK:
        if broken is not None and _POOL is not broken:
            return
        if _POOL is not None:
            _POOL.shutdown(wait=False, cancel_futures=True)
        _POOL = None
        _POOL_DEATHS += 1


def compute_state() -> dict[str, Any]:
    """Où les pas se calculent : `workers` processus, ou l’API seule (`inline`), et les reprises du pool."""
    workers = worker_count()
    with _POOL_LOCK:
        deaths = _POOL_DEATHS
    inline = workers <= 1 or deaths > _POOL_RESTARTS
    return {"workers": 1 if inline else workers, "inline": inline, "restarts": deaths}


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
    jobs.sort(key=lambda job: _PART_ORDER.get(job[1], len(_PART_ORDER)))
    pool = _pool() if worker_count() > 1 and any(part in MODEL_PARTS for _t, part, _key in jobs) else None
    futures: list[tuple[Future, tuple[int, str, str]]] = []
    inline: list[tuple[int, str, str]] = []
    shared = {
        "focus": settings.focus,
        "families": list(settings.families),
        "estimators": settings.estimators,
        "quantiles": list(settings.quantiles),
        "excluded": list(settings.excluded),
    }
    for job in jobs:
        t, part, _key = job
        if pool is not None and part in MODEL_PARTS:
            futures.append((pool.submit(_part_job, frame.rows[:t], horizon_of(frame, t), part, shared), job))
        else:
            inline.append(job)

    def keep(job: tuple[int, str, str], data: dict[str, Any]) -> None:
        t, part, key = job
        # Un échec de Chronos ou de Darts tient à l’installation ou au réseau, un échec transitoire de LightGBM ou de
        # CatBoost à la mémoire : rangé sur disque, il ne serait jamais retenté. Un historique trop court, lui, se range.
        if part in ("chronos", "darts") and "error" in data:
            pass
        elif is_transient(data):
            remember_transient(key, data)
        else:
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
            _drop_pool(pool)
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
            if data is None:
                data = _TRANSIENT.get(key)
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
