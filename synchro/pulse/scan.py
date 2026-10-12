"""Balayage des boules et des étoiles, presets en parallèle."""

from __future__ import annotations

import multiprocessing
import os
from concurrent.futures import ProcessPoolExecutor
from concurrent.futures.process import BrokenProcessPool
from typing import Any

import numpy as np

from synchro.analysis.common import as_date, iso, numbers_of, stars_of
from synchro.analysis.windowing import resolve_window
from synchro.pulse.model import (
    DISCLAIMER,
    FAMILIES,
    PULSE_PRESETS,
    analyze_hits,
    build_groups,
    wave_samples,
)
from synchro.weekday import normalize_weekday_filter

NUMBER_POOL = 50
STAR_POOL = 12


def status_payload() -> dict[str, Any]:
    return {
        "ok": True,
        "presets": list(PULSE_PRESETS),
        "families": list(FAMILIES),
        "period_min": 2,
        "period_max": 60,
        "disclaimer": DISCLAIMER,
    }


def worker_count() -> int:
    raw = os.environ.get("SYNCHRO_PULSE_WORKERS")
    if raw:
        try:
            return max(1, min(8, int(raw)))
        except ValueError:
            pass
    return max(1, min(4, (os.cpu_count() or 2) - 1))


def _dates_of(work: list[dict[str, Any]]) -> list[str]:
    return [iso(as_date(draw["draw_date"])) for draw in work]


def _hits(work: list[dict[str, Any]], kind: str, n: int) -> np.ndarray:
    if kind == "star":
        return np.asarray([1.0 if n in stars_of(draw) else 0.0 for draw in work], dtype=float)
    return np.asarray([1.0 if n in numbers_of(draw) else 0.0 for draw in work], dtype=float)


def fit_job(job: dict[str, Any]) -> dict[str, Any]:
    """Point d’entrée du pool : un numéro, un preset."""
    hits = np.asarray(job["hits"], dtype=float)
    return analyze_hits(
        hits,
        families=tuple(job["families"]),
        preset=str(job["preset"]),
        dates=list(job["dates"]),
        kind=str(job["kind"]),
        n=int(job["n"]),
        seed=int(job.get("seed") or 0),
    )


def _run_jobs(jobs: list[dict[str, Any]], workers: int | None) -> list[dict[str, Any]]:
    count = 1 if workers is None else int(workers)
    if workers is None:
        count = worker_count()
    if count <= 1 or len(jobs) < 2:
        return [fit_job(job) for job in jobs]
    try:
        context = multiprocessing.get_context("spawn")
        with ProcessPoolExecutor(max_workers=count, mp_context=context) as pool:
            return list(pool.map(fit_job, jobs, chunksize=4))
    except (OSError, ValueError, BrokenProcessPool):
        return [fit_job(job) for job in jobs]


def _headline(slices: list[dict[str, Any]]) -> dict[str, Any]:
    if not slices:
        return {
            "generator": "simple",
            "period": None,
            "phase": None,
            "period2": None,
            "phase2": None,
            "concordance": 0.0,
            "lobe_rate": 0.0,
            "r": 0.0,
            "p": 1.0,
        }
    return max(slices, key=lambda row: (float(row["concordance"]), int(row["draws"])))


def assemble(
    rows: list[dict[str, Any]],
    families: tuple[str, ...],
) -> dict[str, Any]:
    slots: dict[tuple[str, int], dict[str, Any]] = {}
    for kind, pool in (("ball", NUMBER_POOL), ("star", STAR_POOL)):
        for n in range(1, pool + 1):
            slots[(kind, n)] = {"kind": kind, "n": n, "slices": [], "anchors": []}
    for row in rows:
        slot = slots[(str(row["kind"]), int(row["n"]))]
        slot["slices"].extend(row["slices"])
        if row.get("anchor"):
            slot["anchors"].append(row["anchor"])
    groups: list[dict[str, Any]] = []
    if "pair" in families or "triplet" in families:
        by_preset: dict[str, list[dict[str, Any]]] = {}
        for slot in slots.values():
            for anchor in slot["anchors"]:
                by_preset.setdefault(str(anchor["preset"]), []).append(anchor)
        for anchors in by_preset.values():
            groups.extend(build_groups(anchors, families))
        groups.sort(
            key=lambda item: (float(item["concordance"]), int(item.get("hits") or 0)),
            reverse=True,
        )
        groups = groups[:24]
    linked: dict[tuple[str, int], list[str]] = {}
    for group in groups:
        for member in group["members"]:
            linked.setdefault((str(member["kind"]), int(member["n"])), []).append(group["id"])
    numbers = []
    for key in sorted(slots, key=lambda item: (item[0] != "ball", item[1])):
        slot = slots[key]
        head = _headline(slot["slices"])
        numbers.append(
            {
                "kind": slot["kind"],
                "n": slot["n"],
                "generator": head["generator"],
                "period": head["period"],
                "phase": head["phase"],
                "period2": head["period2"],
                "phase2": head["phase2"],
                "concordance": head["concordance"],
                "lobe_rate": head["lobe_rate"],
                "r": head["r"],
                "p": head["p"],
                "group_ids": linked.get(key, []),
                "slices": slot["slices"],
            }
        )
    return {"numbers": numbers, "groups": groups}


def scan_channels(
    channels: list[dict[str, Any]],
    *,
    families: tuple[str, ...] | list[str],
    preset: str = "last_100",
    dates: list[str] | None = None,
    workers: int | None = 1,
) -> dict[str, Any]:
    """Scan d’un jeu de séries déjà construites — utilisé par les tests."""
    chosen = _normalize_families(families)
    length = 0
    if channels:
        length = len(channels[0]["hits"])
    stamp = dates if dates is not None else [f"2000-01-{(index % 28) + 1:02d}" for index in range(length)]
    jobs = [
        {
            "hits": [float(value) for value in channel["hits"]],
            "families": chosen,
            "preset": preset,
            "dates": stamp,
            "kind": channel["kind"],
            "n": int(channel["n"]),
            "seed": 0,
        }
        for channel in channels
    ]
    rows = _run_jobs(jobs, workers)
    body = assemble(rows, tuple(chosen))
    body.update(
        {
            "ok": True,
            "disclaimer": DISCLAIMER,
            "families": list(chosen),
            "presets": [preset],
            "windows": [
                {
                    "preset": preset,
                    "from": stamp[0] if stamp else None,
                    "to": stamp[-1] if stamp else None,
                    "draw_count": length,
                }
            ],
        }
    )
    return body


def scan_draws(
    draws: list[dict[str, Any]],
    *,
    presets: list[str] | tuple[str, ...],
    families: list[str] | tuple[str, ...],
    weekday: str | None = None,
    workers: int | None = None,
) -> dict[str, Any]:
    chosen = _normalize_families(families)
    picked = _normalize_presets(presets)
    day = normalize_weekday_filter(weekday)
    windows = []
    jobs = []
    for preset in picked:
        resolved = resolve_window(draws, preset=preset, warmup=0, weekday=day)
        work = list(resolved["work"])
        windows.append(
            {
                "preset": preset,
                "from": resolved["from_date"],
                "to": resolved["to_date"],
                "draw_count": int(resolved["draw_count"]),
            }
        )
        if not work:
            continue
        dates = _dates_of(work)
        for kind, pool in (("ball", NUMBER_POOL), ("star", STAR_POOL)):
            for n in range(1, pool + 1):
                jobs.append(
                    {
                        "hits": _hits(work, kind, n).tolist(),
                        "families": chosen,
                        "preset": preset,
                        "dates": dates,
                        "kind": kind,
                        "n": n,
                        "seed": 0,
                    }
                )
    rows = _run_jobs(jobs, workers)
    body = assemble(rows, tuple(chosen))
    body.update(
        {
            "ok": True,
            "disclaimer": DISCLAIMER,
            "weekday": day,
            "families": list(chosen),
            "presets": list(picked),
            "windows": windows,
        }
    )
    return body


def detail_series(
    work: list[dict[str, Any]],
    *,
    kind: str,
    n: int,
    preset: str,
    families: list[str] | tuple[str, ...],
    slice_id: str,
) -> dict[str, Any]:
    chosen = _normalize_families(families)
    if kind not in {"ball", "star"}:
        raise ValueError("kind attendu : ball ou star.")
    pool = STAR_POOL if kind == "star" else NUMBER_POOL
    if n < 1 or n > pool:
        raise ValueError(f"n hors grille : {n}.")
    _normalize_presets([preset])
    dates = _dates_of(work)
    analyzed = analyze_hits(
        _hits(work, kind, n),
        families=chosen,
        preset=preset,
        dates=dates,
        kind=kind,
        n=n,
    )
    found = next((row for row in analyzed["slices"] if row["id"] == slice_id), None)
    if found is None:
        raise ValueError(f"Tranche inconnue : {slice_id}.")
    start = int(found["start"])
    end = int(found["end"])
    wave, phases = wave_samples(found, start, end)
    points = []
    hits = _hits(work, kind, n)
    for offset, moment in enumerate(dates[start:end]):
        points.append(
            {
                "date": moment,
                "hit": int(hits[start + offset] > 0.5),
                "wave": wave[offset],
                "phase": phases[offset],
            }
        )
    return {
        "ok": True,
        "disclaimer": DISCLAIMER,
        "kind": kind,
        "n": n,
        "slice": found,
        "points": points,
    }


def _normalize_families(families: list[str] | tuple[str, ...]) -> list[str]:
    picked = []
    for name in families:
        if name not in FAMILIES:
            raise ValueError(f"Générateur inconnu : {name}.")
        if name not in picked:
            picked.append(name)
    if not picked:
        raise ValueError("Choisir au moins un générateur.")
    return picked


def _normalize_presets(presets: list[str] | tuple[str, ...]) -> list[str]:
    picked = []
    allowed = set(PULSE_PRESETS)
    for name in presets:
        if name not in allowed:
            raise ValueError(f"Preset inconnu : {name}.")
        if name not in picked:
            picked.append(name)
    if not picked:
        raise ValueError("Choisir au moins un preset.")
    return picked
