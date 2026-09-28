"""Une lecture à la fois, avec une progression réelle et une annulation."""

from __future__ import annotations

import threading
import uuid
from typing import Any

from synchro.analysis.inference import bh_fdr
from synchro.decision_tree.reading import ReadingCancelled, read_flux
from synchro.decision_tree.store import list_report_paths, load_reading, summarize

_LOCK = threading.Lock()
_JOBS: dict[str, dict[str, Any]] = {}
_CANCEL: dict[str, threading.Event] = {}
_CURRENT: str | None = None


class BusyReading(RuntimeError):
    """Une lecture est déjà en cours."""


def _public(job_id: str) -> dict[str, Any]:
    job = _JOBS[job_id]
    payload = {
        "ok": True,
        "id": job_id,
        "status": job["status"],
        "stage": job["stage"],
        "k": job["k"],
        "n": job["n"],
        "error": job.get("error"),
    }
    if job["status"] == "done":
        payload["result"] = job.get("result")
    return payload


def start_job(draws: list[dict[str, Any]], **kwargs: Any) -> dict[str, Any]:
    global _CURRENT
    with _LOCK:
        if _CURRENT and _JOBS.get(_CURRENT, {}).get("status") == "running":
            raise BusyReading("Une lecture est déjà en cours.")
        job_id = uuid.uuid4().hex[:12]
        event = threading.Event()
        _CANCEL[job_id] = event
        _JOBS[job_id] = {
            "id": job_id,
            "status": "running",
            "stage": "tableau",
            "k": 0,
            "n": 0,
            "error": None,
            "result": None,
        }
        _CURRENT = job_id

    def run() -> None:
        global _CURRENT

        def progress(stage: str, k: int, n: int) -> None:
            if event.is_set():
                raise ReadingCancelled()
            with _LOCK:
                job = _JOBS[job_id]
                job["stage"] = stage
                job["k"] = k
                job["n"] = n

        try:
            result = read_flux(draws, on_progress=progress, **kwargs)
            with _LOCK:
                _JOBS[job_id]["status"] = "done"
                _JOBS[job_id]["stage"] = "fait"
                _JOBS[job_id]["result"] = result
        except ReadingCancelled:
            with _LOCK:
                _JOBS[job_id]["status"] = "cancelled"
                _JOBS[job_id]["stage"] = "annulé"
        except Exception as exc:
            with _LOCK:
                _JOBS[job_id]["status"] = "error"
                _JOBS[job_id]["error"] = str(exc)
        finally:
            with _LOCK:
                if _CURRENT == job_id:
                    _CURRENT = None

    threading.Thread(target=run, name=f"decision-tree-{job_id}", daemon=True).start()
    return _public(job_id)


def job_status(job_id: str) -> dict[str, Any] | None:
    with _LOCK:
        if job_id not in _JOBS:
            return None
        return _public(job_id)


def cancel_job(job_id: str) -> bool:
    event = _CANCEL.get(job_id)
    if event is None:
        return False
    event.set()
    return True


def bh_adjusted(pvalues: list[float]) -> list[float]:
    m = len(pvalues)
    if m == 0:
        return []
    order = sorted(range(m), key=lambda i: pvalues[i])
    adjusted = [1.0] * m
    running = 1.0
    for rank in range(m, 0, -1):
        idx = order[rank - 1]
        running = min(running, float(pvalues[idx]) * m / rank)
        adjusted[idx] = min(1.0, running)
    return [round(value, 4) for value in adjusted]


def list_readings(*, root: Any = None) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for path in list_report_paths(root):
        try:
            report = load_reading(path.parent.name, root=root, with_svg=False)
        except (OSError, ValueError):
            continue
        items.append(summarize(report))
    by_era: dict[str, list[int]] = {}
    for index, item in enumerate(items):
        by_era.setdefault(str(item.get("era") or "current"), []).append(index)
    for indexes in by_era.values():
        pvalues = [float(items[i].get("p") or 1.0) for i in indexes]
        adjusted = bh_adjusted(pvalues)
        rejected = bh_fdr(pvalues) if pvalues else []
        for offset, index in enumerate(indexes):
            items[index]["p_adjusted"] = adjusted[offset]
            items[index]["q_reject"] = bool(rejected[offset]) if offset < len(rejected) else False
    return items
