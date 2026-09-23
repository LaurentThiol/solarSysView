"""Processus du comité. Les variables BLAS sont posées avant NumPy."""

from __future__ import annotations

import atexit
import os
import threading
from concurrent.futures import ProcessPoolExecutor
from typing import Any

os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")
os.environ.setdefault("NUMEXPR_NUM_THREADS", "1")

_pool: ProcessPoolExecutor | None = None
_lock = threading.Lock()


def scope_workers() -> int:
    return max(1, min(3, os.cpu_count() or 1))


def run_scope_job(spec: tuple[str, list[dict[str, Any]], int, int, int]) -> tuple[str, dict[str, Any]]:
    name, series, lookback, epochs, seed = spec
    from synchro.pronostic_net.committee import run_scope

    return name, run_scope(series, lookback, epochs=epochs, seed=seed)


def scope_pool() -> ProcessPoolExecutor:
    global _pool
    with _lock:
        if _pool is None:
            import multiprocessing

            ctx = multiprocessing.get_context("spawn")
            _pool = ProcessPoolExecutor(max_workers=scope_workers(), mp_context=ctx)
            atexit.register(close_scope_pool)
        return _pool


def close_scope_pool() -> None:
    global _pool
    with _lock:
        pool = _pool
        _pool = None
    if pool is not None:
        pool.shutdown(wait=False, cancel_futures=True)
