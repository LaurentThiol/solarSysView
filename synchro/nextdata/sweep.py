"""Méga : les effets principaux du réglage affiché, notés sur les mêmes décalages.

Le réglage des boutons est la ligne de départ. Autour, un seul facteur change :
un autre focus, une autre profondeur d’années, ou une covariable retirée. Le jour
et le nombre d’arbres restent ceux du pronostic. Les pas sont ceux du cache de
nextDataTraining. Plusieurs morceaux tournent ensemble, tant que la charge de
la machine reste sous le plafond.
"""

from __future__ import annotations

import atexit
import math
import multiprocessing
import os
import threading
import time
from concurrent.futures import FIRST_COMPLETED, ProcessPoolExecutor, wait
from concurrent.futures.process import BrokenProcessPool
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Any, Callable, Iterable

from synchro.nextdata.covariates import normalize_families
from synchro.nextdata.panel import FOCUS_LENGTHS, YEAR_KEYS
from synchro.nextdata.uncertainty import paired_gap

DECISION_READING = "corpus"
WAVE_BUDGET = 25.0
MAX_ROWS = 16
MEMORY_FLOOR = 0.20
GROW_BELOW = 0.60
LOAD_LIMIT = 0.8
YEAR_DEPTHS: tuple[tuple[str, ...], ...] = (
    ("n",),
    ("n", "n-1"),
    ("n", "n-1", "n-2"),
)
FAMILY_LABELS = {
    "calendrier": "Calendrier",
    "lune": "Lune",
    "forme": "Forme",
    "decennies": "Décennies",
    "delta": "Delta",
    "repetitions": "Répétitions",
    "couples": "Couples",
    "triples": "Triples",
    "pulse": "Pulse",
}
NOTE = (
    "Les lignes partagent les dates du réglage affiché. Une variante n’est retenue "
    "que si son erreur de somme, lecture Corpus, reste sous celle de ce réglage "
    "sur tout l’intervalle, après correction de Holm."
)
# Une ligne ne calcule que ses dix décalages : la fenêtre de Chronos (dix pas d’avant) n’est jamais pleine.
CHRONOS_NOTE = (
    " Chronos s’y mélange moitié-moitié : ses poids se règlent sur les dix tirages "
    "d’avant, que le parcours ne calcule pas. La MAE du réglage affiché peut donc "
    "s’écarter de celle d’Entraîner."
)


@dataclass(frozen=True)
class Variant:
    """Une ligne du parcours. `focus` est celui des boutons, avant le clamp du corpus."""

    id: str
    role: str
    label: str
    focus: int
    years: tuple[str, ...]
    families: tuple[str, ...]
    with_chronos: bool
    dropped: str | None = None
    anchor: bool = False


@dataclass(frozen=True)
class _Job:
    key: str
    part: str
    lag: int
    t: int
    built_index: int
    settings: dict[str, Any]


def canonical_years(years: Iterable[str] | None) -> tuple[str, ...]:
    """Années cochées, n toujours présente, dans l’ordre n, n−1, n−2."""
    picked = set() if years is None else {str(key) for key in years} & set(YEAR_KEYS)
    chosen = (picked or set(YEAR_KEYS)) | {"n"}
    return tuple(key for key in YEAR_KEYS if key in chosen)


def _year_label(years: tuple[str, ...]) -> str:
    return ", ".join(year.replace("-", "−") for year in years)


def _other_focuses(focus: int) -> tuple[int, ...]:
    """Les autres longueurs de focus. L’ordre est celui des boutons."""
    current = int(focus)
    return tuple(length for length in FOCUS_LENGTHS if length != current)


def main_effects(
    *,
    focus: int,
    years: Iterable[str] | None,
    covariates: Iterable[str] | None,
    with_chronos: bool,
) -> list[Variant]:
    """Le réglage affiché, puis un facteur à la fois. Au plus MAX_ROWS lignes."""
    anchor_years = canonical_years(years)
    families = tuple(normalize_families(covariates))
    chronos = bool(with_chronos)
    rows = [
        Variant(
            id="anchor",
            role="anchor",
            label="Réglage affiché",
            focus=int(focus),
            years=anchor_years,
            families=families,
            with_chronos=chronos,
            anchor=True,
        )
    ]
    for other in _other_focuses(int(focus)):
        rows.append(
            Variant(
                id=f"focus-{other}",
                role="focus",
                label=f"Focus {other}",
                focus=other,
                years=anchor_years,
                families=families,
                with_chronos=chronos,
            )
        )
    for depth in YEAR_DEPTHS:
        if depth == anchor_years:
            continue
        rows.append(
            Variant(
                id="years-" + "+".join(depth),
                role="years",
                label=f"Années {_year_label(depth)}",
                focus=int(focus),
                years=depth,
                families=families,
                with_chronos=chronos,
            )
        )
    if len(families) >= 2:
        for name in families:
            kept = tuple(item for item in families if item != name)
            rows.append(
                Variant(
                    id=f"drop-{name}",
                    role="covariate",
                    label=f"Sans {FAMILY_LABELS.get(name, name)}",
                    focus=int(focus),
                    years=anchor_years,
                    families=kept,
                    with_chronos=chronos,
                    dropped=name,
                )
            )
    return rows[:MAX_ROWS]


def process_cap(cpu_count: int, limit: float = LOAD_LIMIT) -> int:
    """Plafond de processus : une part des cœurs, jamais zéro."""
    count = max(1, int(cpu_count))
    return max(1, math.floor(float(limit) * count))


def next_allowance(
    inflight: int,
    allowed: int,
    cpu: float | None,
    memory_free: float | None,
    *,
    cap: int,
    limit: float = LOAD_LIMIT,
) -> int:
    """Créneaux après une mesure. Au-dessus du plafond, on n’en ouvre plus.

    Sous 60 % de CPU et avec de la mémoire libre, un créneau de plus, sans
    dépasser `cap`. Entre les deux, le nombre en cours reste. Sans mesure, il
    reste aussi : la première lecture de /proc/stat n’a pas encore d’écart.
    """
    cap = max(1, int(cap))
    inflight = max(0, int(inflight))
    held = max(1, int(allowed) if allowed else 1)
    hot = (cpu is not None and cpu > float(limit)) or (
        memory_free is not None and memory_free < MEMORY_FLOOR
    )
    if hot:
        return max(1, inflight) if inflight else 1
    cool = cpu is not None and cpu < GROW_BELOW and (memory_free is None or memory_free >= MEMORY_FLOOR)
    if cool:
        return min(cap, max(held, inflight) + 1)
    return min(cap, held)


def parse_cpu_times(text: str) -> tuple[int, int] | None:
    """Total et idle (idle + iowait) de la première ligne `cpu` de /proc/stat."""
    for line in text.splitlines():
        if not line.startswith("cpu "):
            continue
        nums: list[int] = []
        for part in line.split()[1:]:
            try:
                nums.append(int(part))
            except ValueError:
                return None
        if len(nums) < 4:
            return None
        idle = nums[3] + (nums[4] if len(nums) > 4 else 0)
        return sum(nums), idle
    return None


def cpu_ratio(before: tuple[int, int], after: tuple[int, int]) -> float | None:
    """Part du temps CPU non idle entre deux lectures. None si l’horloge n’a pas avancé."""
    total = after[0] - before[0]
    idle = after[1] - before[1]
    if total <= 0:
        return None
    return max(0.0, min(1.0, (total - idle) / total))


def parse_memory_free(text: str) -> float | None:
    """MemAvailable / MemTotal. None si l’un des deux manque."""
    total = available = None
    for line in text.splitlines():
        if line.startswith("MemTotal:"):
            total = _kb(line)
        elif line.startswith("MemAvailable:"):
            available = _kb(line)
    if not total or available is None:
        return None
    return max(0.0, min(1.0, available / total))


def _kb(line: str) -> int | None:
    parts = line.split()
    if len(parts) < 2:
        return None
    try:
        return int(parts[1])
    except ValueError:
        return None


def read_cpu_times(path: str | Path = "/proc/stat") -> tuple[int, int] | None:
    try:
        return parse_cpu_times(Path(path).read_text(encoding="utf-8"))
    except OSError:
        return None


def read_memory_free(path: str | Path = "/proc/meminfo") -> float | None:
    try:
        return parse_memory_free(Path(path).read_text(encoding="utf-8"))
    except OSError:
        return None


def load_ratio() -> float | None:
    """Charge moyenne d’une minute rapportée aux cœurs : la mesure de macOS, qui n’a pas /proc/stat."""
    try:
        one = float(os.getloadavg()[0])
    except (AttributeError, OSError):
        return None
    return max(0.0, min(1.0, one / max(1, os.cpu_count() or 1)))


def blind_machine() -> bool:
    """Ni /proc/stat ni charge moyenne : seul le plafond borne le pool."""
    return read_cpu_times() is None and load_ratio() is None


def holm_adjust(p_values: list[tuple[str, float]], *, alpha: float = 0.05) -> dict[str, dict[str, Any]]:
    """Correction de Holm. Un p qui ne passe pas ferme les suivants, du plus petit au plus grand."""
    ordered = sorted(((str(key), float(p)) for key, p in p_values), key=lambda item: (item[1], item[0]))
    count = len(ordered)
    out: dict[str, dict[str, Any]] = {}
    closed = False
    running = 0.0
    for index, (key, p_value) in enumerate(ordered):
        factor = count - index
        adjusted = min(1.0, factor * p_value)
        running = adjusted if index == 0 else min(1.0, max(running, adjusted))
        reject = (not closed) and factor * p_value <= alpha
        if not reject:
            closed = True
        out[key] = {"p": round(p_value, 4), "p_holm": round(running, 4), "reject": reject}
    return out


def decide_leader(candidates: list[dict[str, Any]], *, reading: str = DECISION_READING) -> dict[str, Any]:
    """Retient les variantes dont l’écart au réglage affiché reste négatif après Holm.

    `candidates` porte `id`, `label`, `verdict`, `p` et `value` (moyenne de
    |erreur| − |erreur du réglage affiché|). Le plus négatif des retenus gagne.
    """
    usable = [
        item
        for item in candidates
        if item.get("p") is not None and item.get("verdict") in {"lower", "higher", "undecided"}
    ]
    holm = holm_adjust([(str(item["id"]), float(item["p"])) for item in usable])
    retained: list[dict[str, Any]] = []
    for item in usable:
        info = holm[str(item["id"])]
        kept = bool(info["reject"] and item.get("verdict") == "lower")
        info["retained"] = kept
        if kept:
            retained.append(item)
    for info in holm.values():
        info.setdefault("retained", False)
    retained.sort(key=lambda item: (float(item["value"]), str(item["id"])))
    leader = None
    if retained:
        winner = retained[0]
        leader = {
            "id": winner["id"],
            "label": winner["label"],
            "reading": reading,
            "value": winner["value"],
        }
    return {"leader": leader, "held": leader is None, "holm": holm}


def shift_dates(frame: Any, lags: Iterable[int]) -> list[str]:
    """Dates notées, dans l’ordre des lags, du plus récent vers les plus anciens."""
    from synchro.nextdata.steps import MIN_HISTORY

    rows = frame.rows
    dates = []
    for lag in lags:
        t = len(rows) - int(lag)
        if t >= MIN_HISTORY:
            dates.append(str(rows[t]["date"]))
    return dates


def run_sweep(
    draws: list[dict[str, Any]],
    *,
    focus: int = 50,
    years: Iterable[str] | None = None,
    weekday: str | None = None,
    covariates: Iterable[str] | None = None,
    estimators: int = 32,
    with_chronos: bool = False,
    persist: dict[str, int] | None = None,
    load_limit: float = LOAD_LIMIT,
    budget: float = WAVE_BUDGET,
    lags: Iterable[int] | None = None,
) -> dict[str, Any]:
    """Une tranche du parcours. Les morceaux manquants partent, puis l’état revient.

    `budget` borne la tranche, en secondes. Les pas déjà au cache ne sont pas
    réajustés. `lags` vaut 1…10 pour la page ; les tests peuvent n’en demander qu’un.
    """
    from synchro.nextdata.forecast import _unready

    refused = _unready()
    if refused:
        return refused

    limit = _clamp_limit(load_limit)
    wanted = tuple(int(lag) for lag in (lags if lags is not None else range(1, 11)))
    variants = main_effects(focus=int(focus), years=years, covariates=covariates, with_chronos=with_chronos)
    frame_for = _frames(draws, weekday)
    try:
        anchor_frame = frame_for(variants[0])
    except ValueError as exc:
        return {"ok": False, "error": str(exc)}
    anchor_dates = shift_dates(anchor_frame, wanted)
    if not anchor_dates:
        return {"ok": False, "error": "Pas assez de tirages pour un décalage."}

    built = [_prepare(frame_for, variant, anchor_dates, wanted, int(estimators)) for variant in variants]
    found: dict[str, Any] = {}
    cpu_before = read_cpu_times()
    memory = read_memory_free()
    cap = process_cap(os.cpu_count() or 1, limit)
    finished, allowed, parallel = _compute_missing(
        built, found, budget=max(0.0, float(budget)), cap=cap, limit=limit
    )
    cpu_after = read_cpu_times()
    if cpu_before is None or cpu_after is None:
        cpu = load_ratio()
    else:
        cpu = cpu_ratio(cpu_before, cpu_after)
    rows = [_public_row(item, anchor_dates, persist, found) for item in built]
    ready, total = _census(built, found)
    complete = total > 0 and ready >= total
    decision = _attach_verdicts(rows) if complete else {"leader": None, "held": True, "holm": {}}
    for row in rows:
        row.pop("_series", None)
    if complete:
        _close_sweep_pool()
    leader = decision["leader"]
    if leader is not None:
        leader = {"id": leader["id"], "label": leader["label"], "reading": leader["reading"]}
    return {
        "ok": True,
        "weekday": anchor_frame.weekday,
        "estimators": int(estimators),
        "reading": DECISION_READING,
        "anchor_id": variants[0].id,
        "dates": anchor_dates,
        "rows": rows,
        "leader": leader,
        "held": leader is None,
        "load": {
            "cpu": None if cpu is None else round(float(cpu), 4),
            "memory_free": None if memory is None else round(float(memory), 4),
            "allowed": allowed,
            "cap": cap,
            "parallel": parallel,
        },
        "progress": {"ready": ready, "total": total, "complete": complete},
        "wave": finished,
        "note": NOTE + (CHRONOS_NOTE if with_chronos else ""),
    }


def _clamp_limit(value: float) -> float:
    try:
        limit = float(value)
    except (TypeError, ValueError):
        return LOAD_LIMIT
    if math.isnan(limit):
        return LOAD_LIMIT
    return min(0.95, max(0.5, limit))


def _frames(draws: list[dict[str, Any]], weekday: str | None) -> Callable[[Variant], Any]:
    """Un cadre par jeu d’années, partagé par les lignes : le focus ne change que la queue lue."""
    from synchro.nextdata.panel import build_frame

    built: dict[tuple[str, ...], Any] = {}

    def frame_for(variant: Variant) -> Any:
        base = built.get(variant.years)
        if base is None:
            base = built[variant.years] = build_frame(draws, years=variant.years, focus=variant.focus, weekday=weekday)
        used = max(1, min(int(variant.focus), len(base.rows)))
        return replace(base, focus=used, focus_start=len(base.rows) - used)

    return frame_for


def _prepare(
    frame_for: Callable[[Variant], Any],
    variant: Variant,
    anchor_dates: list[str],
    lags: tuple[int, ...],
    estimators: int,
) -> dict[str, Any]:
    from synchro.nextdata.steps import MIN_HISTORY, StepSettings, horizon_of, parts_needed, prefix_digests, step_key

    item: dict[str, Any] = {"variant": variant, "status": "pending", "detail": None, "frame": None, "keys": []}
    try:
        frame = frame_for(variant)
    except ValueError as exc:
        item["status"] = "short"
        item["detail"] = str(exc)
        return item
    if shift_dates(frame, lags) != list(anchor_dates):
        item["status"] = "misaligned"
        item["detail"] = "Ces années ne portent pas les mêmes tirages que le réglage affiché."
        item["frame"] = frame
        return item
    settings = StepSettings(focus=frame.focus, families=variant.families, estimators=int(estimators))
    parts = parts_needed(variant.with_chronos)
    digests = prefix_digests(frame.rows)
    keys: list[tuple[int, int, str, str]] = []
    for lag in lags:
        t = len(frame.rows) - int(lag)
        if t < MIN_HISTORY:
            continue
        horizon = horizon_of(frame, t)
        for part in parts:
            keys.append((int(lag), t, part, step_key(digests[t], horizon, settings, part)))
    item.update(
        {
            "frame": frame,
            "settings": settings,
            "parts": parts,
            "keys": keys,
            "years_present": list(frame.years_present),
        }
    )
    return item


def _compute_missing(
    built: list[dict[str, Any]],
    found: dict[str, Any],
    *,
    budget: float,
    cap: int,
    limit: float,
) -> tuple[int, int, bool]:
    from synchro.nextdata.steps import worker_count

    pending = _pending_jobs(built, found)
    if not pending or budget <= 0:
        return 0, 1, False
    parallel = worker_count() > 1 and cap > 1
    if not parallel:
        return _run_inline(built, pending, budget, found), 1, False
    finished, allowed = _run_pool(built, pending, budget=budget, cap=cap, limit=limit, found=found)
    return finished, allowed, True


def _pending_jobs(built: list[dict[str, Any]], found: dict[str, Any]) -> list[_Job]:
    """Morceaux à calculer, décalage par décalage. Ceux du cache rejoignent `found`, lus une fois."""
    from synchro.nextdata.steps import load_part

    seen: set[str] = set()
    jobs: list[_Job] = []
    ordered = sorted(
        (
            (lag, 1 if part == "chronos" else 0, index, part, t, key)
            for index, item in enumerate(built)
            if item.get("keys")
            for lag, t, part, key in item["keys"]
        ),
        key=lambda row: (row[0], row[1], row[2], row[3]),
    )
    for lag, _chronos, index, part, t, key in ordered:
        if key in seen:
            continue
        seen.add(key)
        data = load_part(key)
        if data is not None:
            found[key] = data
            continue
        settings = built[index]["settings"]
        jobs.append(
            _Job(
                key=key,
                part=part,
                lag=lag,
                t=t,
                built_index=index,
                settings={
                    "focus": settings.focus,
                    "families": list(settings.families),
                    "estimators": settings.estimators,
                    "quantiles": list(settings.quantiles),
                },
            )
        )
    return jobs


def _run_inline(built: list[dict[str, Any]], jobs: list[_Job], budget: float, found: dict[str, Any]) -> int:
    deadline = time.monotonic() + budget
    done = 0
    for job in jobs:
        if time.monotonic() >= deadline:
            break
        _finish(job, _compute(built, job), found)
        done += 1
    return done


_SWEEP_POOL: ProcessPoolExecutor | None = None
_SWEEP_SIZE = 0
_SWEEP_LOCK = threading.Lock()


def _sweep_pool(cap: int) -> ProcessPoolExecutor | None:
    """Le pool de Méga, gardé d’une tranche à l’autre : ses processus n’importent les modèles qu’une fois."""
    global _SWEEP_POOL, _SWEEP_SIZE
    with _SWEEP_LOCK:
        if _SWEEP_POOL is not None and _SWEEP_SIZE != cap:
            _SWEEP_POOL.shutdown(wait=False, cancel_futures=True)
            _SWEEP_POOL = None
        if _SWEEP_POOL is None:
            try:
                _SWEEP_POOL = ProcessPoolExecutor(
                    max_workers=cap,
                    mp_context=multiprocessing.get_context("spawn"),
                )
            except (OSError, ValueError):
                return None
            _SWEEP_SIZE = cap
        return _SWEEP_POOL


@atexit.register
def _close_sweep_pool(broken: ProcessPoolExecutor | None = None) -> None:
    """Ferme le pool de Méga, parcours fini ou processus mort. `broken` ne ferme que ce pool-là."""
    global _SWEEP_POOL
    with _SWEEP_LOCK:
        if broken is not None and _SWEEP_POOL is not broken:
            return
        if _SWEEP_POOL is not None:
            _SWEEP_POOL.shutdown(wait=False, cancel_futures=True)
        _SWEEP_POOL = None


def _run_pool(
    built: list[dict[str, Any]],
    jobs: list[_Job],
    *,
    budget: float,
    cap: int,
    limit: float,
    found: dict[str, Any],
) -> tuple[int, int]:
    """Les arbres dans le pool, sous le plafond de charge ; Chronos dans l’API, un pas à la fois, en même temps.

    Chronos reste dans le processus de l’API : son modèle y est déjà chargé, et
    son échec y est noté, si bien que la tranche suivante ne le redemande plus.
    """
    from synchro.nextdata.steps import _part_job

    deadline = time.monotonic() + budget
    pending = [job for job in jobs if job.part != "chronos"]
    chronos = [job for job in jobs if job.part == "chronos"]
    pool = _sweep_pool(cap)
    if pool is None:
        return _run_inline(built, jobs, budget, found), 1
    allowed = 1
    finished = 0
    cpu_mark = read_cpu_times()
    blind = blind_machine()
    broken = False
    inflight: dict[Any, _Job] = {}
    while pending or inflight or chronos:
        cpu_mark, cpu = _delta(cpu_mark)
        memory = read_memory_free()
        if blind:
            allowed = cap
        else:
            allowed = next_allowance(len(inflight), allowed, cpu, memory, cap=cap, limit=limit)
        now = time.monotonic()
        while pending and len(inflight) < allowed and now < deadline:
            if cpu is not None and cpu > limit and inflight:
                break
            if memory is not None and memory < MEMORY_FLOOR and inflight:
                break
            job = pending.pop(0)
            prefix, horizon = _inputs(built, job)
            try:
                inflight[pool.submit(_part_job, prefix, horizon, job.part, job.settings)] = job
            except RuntimeError:
                # Un autre parcours a fini et fermé le pool partagé : la tranche continue dans l’API.
                pending.insert(0, job)
                broken = True
                break
        if broken:
            pending[:0] = list(inflight.values())
            inflight.clear()
            break
        if chronos and time.monotonic() < deadline:
            job = chronos.pop(0)
            _finish(job, _compute(built, job), found)
            finished += 1
        elif not inflight:
            break
        if not inflight:
            continue
        done, _waiting = wait(set(inflight), timeout=0.4, return_when=FIRST_COMPLETED)
        for future in done:
            job = inflight.pop(future)
            try:
                data = future.result()
            except BrokenProcessPool:
                broken = True
                pending[:0] = [job, *inflight.values()]
                inflight.clear()
                break
            except Exception:
                data = None
            if isinstance(data, dict):
                _finish(job, data, found)
            finished += 1
        if broken:
            break
    if broken:
        _close_sweep_pool(pool)
        finished += _run_inline(built, pending + chronos, max(0.0, deadline - time.monotonic()), found)
        return finished, 1
    return finished, allowed


def _delta(mark: tuple[int, int] | None) -> tuple[tuple[int, int] | None, float | None]:
    """Charge depuis la dernière lecture de /proc/stat ; sans /proc/stat, la charge moyenne d’une minute."""
    now = read_cpu_times()
    if now is None:
        return None, load_ratio()
    if mark is None:
        return now, None
    return now, cpu_ratio(mark, now)


def _inputs(built: list[dict[str, Any]], job: _Job) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    from synchro.nextdata.steps import horizon_of

    frame = built[job.built_index]["frame"]
    return list(frame.rows[: job.t]), horizon_of(frame, job.t)


def _compute(built: list[dict[str, Any]], job: _Job) -> dict[str, Any]:
    from synchro.nextdata.models import StepSettings, compute_part

    prefix, horizon = _inputs(built, job)
    settings = StepSettings(
        focus=int(job.settings["focus"]),
        families=tuple(job.settings["families"]),
        estimators=int(job.settings["estimators"]),
        quantiles=tuple(job.settings["quantiles"]),
    )
    return compute_part(prefix, horizon, job.part, settings)


def _finish(job: _Job, data: dict[str, Any], found: dict[str, Any]) -> None:
    from synchro.nextdata.models import note_darts_error
    from synchro.nextdata.steps import save_part

    if job.part in ("chronos", "darts") and "error" in data:
        # Darts tourne dans le pool : son échec doit aussi être noté dans l’API, qui ne le redemandera plus.
        if job.part == "darts":
            note_darts_error(str(data["error"]))
        return
    save_part(job.key, data)
    found[job.key] = data


def _census(built: list[dict[str, Any]], found: dict[str, Any]) -> tuple[int, int]:
    seen: set[str] = set()
    ready = total = 0
    for item in built:
        for _lag, _t, _part, key in item.get("keys") or []:
            if key in seen:
                continue
            seen.add(key)
            total += 1
            if key in found:
                ready += 1
    return ready, total


def _public_row(
    item: dict[str, Any],
    anchor_dates: list[str],
    persist: dict[str, int] | None,
    found: dict[str, Any],
) -> dict[str, Any]:
    variant: Variant = item["variant"]
    published: dict[str, Any] = {
        "id": variant.id,
        "role": variant.role,
        "label": variant.label,
        "anchor": variant.anchor,
        "focus": variant.focus,
        "years": list(variant.years),
        "years_present": list(item.get("years_present") or []),
        "covariates": list(variant.families),
        "dropped": variant.dropped,
        "with_chronos": variant.with_chronos,
        "status": item["status"],
        "detail": item["detail"],
        "shifts_ready": 0,
        "shifts_total": len({lag for lag, _t, _part, _key in item.get("keys") or []}),
        "summary": {},
        "versus_anchor": None,
        "holm": None,
        "_series": {},
    }
    if item.get("frame") is None or not item.get("keys"):
        return published
    report = _report(item, persist, found)
    shifts = report["shifts"]
    published["shifts_ready"] = len(shifts)
    published["summary"] = report["summary"]
    published["_series"] = _series(shifts, anchor_dates)
    if not shifts:
        published["status"] = "pending"
    elif len(shifts) == published["shifts_total"]:
        published["status"] = "ready"
    else:
        published["status"] = "partial"
    return published


def _series(shifts: list[dict[str, Any]], dates: list[str]) -> dict[str, list[float | None]]:
    by_date: dict[str, dict[str, float | None]] = {}
    readings: set[str] = set()
    for shift in shifts:
        found: dict[str, float | None] = {}
        for name, side in (shift.get("readings") or {}).items():
            if name.endswith("_persist"):
                continue
            found[name] = ((side or {}).get("errors") or {}).get("sum")
            readings.add(name)
        by_date[shift["date"]] = found
    return {
        name: [by_date.get(date, {}).get(name) if date in by_date else None for date in dates]
        for name in readings
    }


def _report(item: dict[str, Any], persist: dict[str, int] | None, found: dict[str, Any]) -> dict[str, Any]:
    from synchro.nextdata import backtest
    from synchro.nextdata.steps import _combined

    frame = item["frame"]
    by_t: dict[int, dict[str, str]] = {}
    loaded: dict[int, dict[str, Any]] = {}
    lags: list[int] = []
    for lag, t, part, key in item["keys"]:
        if lag not in lags:
            lags.append(lag)
        by_t.setdefault(t, {})[part] = key
        if key in found:
            loaded.setdefault(t, {})[part] = found[key]
    ready: dict[int, dict[str, Any]] = {}
    parts = item["parts"]
    for t, keys in by_t.items():
        block = loaded.get(t) or {}
        if len(block) != len(parts):
            continue
        ready[t] = {"key": _combined(keys, block), "parts": block}
    steps = backtest.assemble(
        frame,
        ready,
        with_chronos=item["variant"].with_chronos,
        pulse="pulse" in item["variant"].families,
    )
    return backtest.shift_report(
        frame,
        steps,
        lags=lags,
        chronos_requested=item["variant"].with_chronos,
        persist=persist,
    )


def _attach_verdicts(rows: list[dict[str, Any]]) -> dict[str, Any]:
    anchor = next((row for row in rows if row["anchor"]), None)
    if anchor is None:
        return {"leader": None, "held": True, "holm": {}}
    candidates = []
    for row in rows:
        if row["anchor"] or row["status"] not in {"ready", "partial"}:
            continue
        gap = _paired(anchor, row, DECISION_READING)
        if gap is None:
            continue
        row["versus_anchor"] = {DECISION_READING: gap}
        if gap.get("p") is None or gap.get("verdict") is None:
            continue
        candidates.append(
            {
                "id": row["id"],
                "label": row["label"],
                "verdict": gap["verdict"],
                "p": gap["p"],
                "value": gap["value"],
            }
        )
    decision = decide_leader(candidates)
    for row in rows:
        info = decision["holm"].get(row["id"])
        if info is None:
            continue
        row["holm"] = info
        gap = (row.get("versus_anchor") or {}).get(DECISION_READING)
        if gap and gap.get("verdict") in {"lower", "higher"} and not info["reject"]:
            gap["raw_verdict"] = gap["verdict"]
            gap["verdict"] = "undecided"
    return decision


def _paired(anchor: dict[str, Any], row: dict[str, Any], reading: str) -> dict[str, Any] | None:
    """|erreur de la ligne| − |erreur du réglage affiché|, sur les dates notées des deux."""
    left = (row.get("_series") or {}).get(reading)
    right = (anchor.get("_series") or {}).get(reading)
    if not left or not right:
        return None
    return paired_gap(left, right)
