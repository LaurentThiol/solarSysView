#!/usr/bin/env python3
"""Banc nextData : temps et ajustements de chaque morceau d’un pas, MAE du retour.

Sans `--draws`, l’archive est tirée au hasard, mardi et vendredi, sur trois
années civiles : le modèle nul d’une loterie honnête, où aucune lecture ne bat
durablement la moyenne. Les pas se rangent dans un dossier temporaire : le cache
de l’application n’est ni relu ni écrit.

    .venv/bin/python scripts/nextdata_bench.py --steps 3
    .venv/bin/python scripts/nextdata_bench.py --retour
    .venv/bin/python scripts/nextdata_bench.py --root ../arbre-avant --dump avant.json

`--root` mesure le paquet `synchro` d’un autre arbre (un worktree d’un ancien
commit, par exemple). `--dump` écrit les morceaux calculés, pour comparer deux
versions nombre à nombre.
"""

from __future__ import annotations

import argparse
import json
import os
import random
import sys
import tempfile
import time
from collections import Counter
from datetime import date, timedelta
from pathlib import Path
from typing import Any

DEFAULT_END = date(2026, 10, 9)


def synthetic_draws(end: date, seed: int) -> list[dict[str, Any]]:
    """Tirages au hasard, mardi et vendredi, du 1er janvier de l’année n−2 à `end`."""
    rng = random.Random(seed)
    day = date(end.year - 2, 1, 1)
    out: list[dict[str, Any]] = []
    while day <= end:
        if day.weekday() in (1, 4):
            out.append(
                {
                    "date": day.isoformat(),
                    "weekday": "mardi" if day.weekday() == 1 else "vendredi",
                    "numbers": sorted(rng.sample(range(1, 51), 5)),
                    "stars": sorted(rng.sample(range(1, 13), 2)),
                    "star_pool": 12,
                }
            )
        day += timedelta(days=1)
    return out


def read_draws(path: Path) -> list[dict[str, Any]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    items = payload.get("items") if isinstance(payload, dict) else payload
    if not isinstance(items, list) or not items:
        raise SystemExit(f"{path} : aucune liste de tirages.")
    return items


class FitCounter:
    """Compte les ajustements réellement lancés : lightgbm.train, le LightGBM de Darts, CatBoost."""

    def __init__(self) -> None:
        self.counts: Counter[str] = Counter()
        self._undo: list[tuple[Any, str, Any]] = []

    def _wrap(self, owner: Any, name: str, label: str) -> None:
        original = getattr(owner, name, None)
        if original is None:
            return

        def counted(*args: Any, **kwargs: Any) -> Any:
            self.counts[label] += 1
            return original(*args, **kwargs)

        setattr(owner, name, counted)
        self._undo.append((owner, name, original))

    def install(self) -> None:
        try:
            import lightgbm
            import lightgbm.sklearn

            self._wrap(lightgbm, "train", "lightgbm")
            self._wrap(lightgbm.sklearn, "train", "lightgbm_sklearn")
        except Exception:
            pass
        try:
            import catboost

            self._wrap(catboost.CatBoostRegressor, "fit", "catboost")
        except Exception:
            pass

    def take(self) -> dict[str, int]:
        found = dict(self.counts)
        self.counts.clear()
        return found


def _warm(parts: list[str]) -> None:
    """Importe les bibliothèques avant de chronométrer : le premier import de Darts prend des secondes."""
    if "darts" in parts:
        try:
            from darts.models import LightGBMModel  # noqa: F401
        except Exception:
            pass
    if "catboost" in parts:
        try:
            import catboost  # noqa: F401
        except Exception:
            pass
    import lightgbm  # noqa: F401


def _available_parts(steps: Any) -> list[str]:
    parts = list(steps.parts_needed(False))
    return [part for part in parts if part != "chronos"]


def measure_parts(
    draws: list[dict[str, Any]],
    *,
    focus: int,
    families: tuple[str, ...],
    estimators: int,
    count: int,
    parts: list[str] | None,
    dump: Path | None,
) -> dict[str, Any]:
    from synchro.nextdata import steps
    from synchro.nextdata.panel import build_frame

    started = time.perf_counter()
    frame = build_frame(draws, focus=focus)
    frame_seconds = time.perf_counter() - started
    wanted = parts or _available_parts(steps)
    _warm(wanted)
    counter = FitCounter()
    counter.install()
    settings = steps.StepSettings(focus=frame.focus, families=families, estimators=estimators)
    n = len(frame.rows)
    targets = [t for t in range(n - count, n) if t >= steps.MIN_HISTORY]
    seconds: dict[str, list[float]] = {part: [] for part in wanted}
    fits: dict[str, list[dict[str, int]]] = {part: [] for part in wanted}
    dumped: dict[str, Any] = {}
    for t in targets:
        prefix = frame.rows[:t]
        horizon = steps.horizon_of(frame, t)
        for part in wanted:
            counter.take()
            clock = time.perf_counter()
            data = steps.compute_part(prefix, horizon, part, settings)
            seconds[part].append(time.perf_counter() - clock)
            fits[part].append(counter.take())
            dumped.setdefault(str(t), {})[part] = data
    if dump is not None:
        dump.write_text(json.dumps(dumped, sort_keys=True), encoding="utf-8")
    per_part = {}
    for part in wanted:
        totals: Counter[str] = Counter()
        for item in fits[part]:
            totals.update(item)
        steps_done = max(1, len(seconds[part]))
        per_part[part] = {
            "seconds_per_step": round(sum(seconds[part]) / steps_done, 3),
            "fits_per_step": {key: round(value / steps_done, 1) for key, value in sorted(totals.items())},
        }
    return {
        "rows": n,
        "steps": len(targets),
        "families": list(families),
        "build_frame_seconds": round(frame_seconds, 3),
        "parts": per_part,
        "step_seconds": round(sum(item["seconds_per_step"] for item in per_part.values()), 3),
    }


def _reading_line(name: str, block: dict[str, Any]) -> dict[str, Any]:
    versus = (block.get("versus") or {}).get("mean") or {}
    interval = block.get("mae_sum_ci") or {}
    return {
        "reading": name,
        "mae_sum": (block.get("mae") or {}).get("sum"),
        "mae_lo": interval.get("lo"),
        "mae_hi": interval.get("hi"),
        "versus_mean": versus.get("value"),
        "versus_lo": versus.get("lo"),
        "versus_hi": versus.get("hi"),
        "verdict": versus.get("verdict"),
        "hits_numbers": block.get("hits_numbers"),
    }


def measure_retour(
    draws: list[dict[str, Any]],
    *,
    focus: int,
    families: tuple[str, ...],
    estimators: int,
) -> dict[str, Any]:
    from synchro.nextdata.forecast import run_forecast

    started = time.perf_counter()
    calls = 0
    while True:
        report = run_forecast(draws, focus=focus, covariates=list(families), estimators=estimators)
        calls += 1
        if not report.get("ok"):
            raise SystemExit(f"run_forecast : {report.get('error')}")
        if report["progress"]["complete"]:
            break
    metrics = report["backtest"]["metrics"]
    return {
        "wall_seconds": round(time.perf_counter() - started, 1),
        "calls": calls,
        "steps": report["progress"]["total"],
        "draws_scored": report["backtest"]["draw_count"],
        "readings": [_reading_line(name, block) for name, block in metrics.items() if not name.endswith("_persist")],
    }


def _print_parts(result: dict[str, Any]) -> None:
    print(f"{result['rows']} tirages, {result['steps']} pas mesurés, familles : {', '.join(result['families'])}")
    print(f"build_frame : {result['build_frame_seconds']:.3f} s")
    for part, block in result["parts"].items():
        fits = ", ".join(f"{key} {value}" for key, value in block["fits_per_step"].items()) or "—"
        print(f"  {part:9s} {block['seconds_per_step']:7.2f} s/pas   ajustements : {fits}")
    print(f"  un pas, sur un cœur : {result['step_seconds']:.2f} s")


def _fmt(value: Any, digits: int = 1) -> str:
    return "—" if value is None else f"{float(value):.{digits}f}"


def _print_retour(result: dict[str, Any]) -> None:
    print(
        f"Retour : {result['steps']} pas en {result['wall_seconds']} s ({result['calls']} appels), "
        f"{result['draws_scored']} tirages notés"
    )
    for line in result["readings"]:
        print(
            f"  {line['reading']:18s} MAE {_fmt(line['mae_sum'])} [{_fmt(line['mae_lo'])} ; {_fmt(line['mae_hi'])}]"
            f"   contre la moyenne {_fmt(line['versus_mean'])} [{_fmt(line['versus_lo'])} ; {_fmt(line['versus_hi'])}]"
            f" {line['verdict'] or ''}"
        )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Banc nextData : morceaux d’un pas et retour.")
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--draws", type=Path, default=None, help="JSON de /api/draws, ou une liste de tirages")
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--end", type=date.fromisoformat, default=DEFAULT_END)
    parser.add_argument("--focus", type=int, default=50)
    parser.add_argument("--estimators", type=int, default=32)
    parser.add_argument("--families", default="", help="familles séparées par des virgules ; toutes par défaut")
    parser.add_argument("--steps", type=int, default=3, help="pas mesurés par morceau, les plus récents")
    parser.add_argument("--parts", default="", help="lightgbm,catboost,darts ; ceux installés par défaut")
    parser.add_argument("--retour", action="store_true", help="calcule tout le retour, pool compris")
    parser.add_argument("--workers", type=int, default=None, help="SYNCHRO_NEXTDATA_WORKERS pour --retour")
    parser.add_argument("--dump", type=Path, default=None, help="écrit les morceaux mesurés")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)

    os.environ["SYNCHRO_NEXTDATA_CACHE"] = tempfile.mkdtemp(prefix="nextdata-bench-")
    if args.workers is not None:
        os.environ["SYNCHRO_NEXTDATA_WORKERS"] = str(args.workers)
    sys.path.insert(0, str(args.root.resolve()))

    from synchro.nextdata.covariates import FAMILIES, normalize_families

    draws = read_draws(args.draws) if args.draws else synthetic_draws(args.end, args.seed)
    families = tuple(normalize_families([item for item in args.families.split(",") if item] or FAMILIES))
    parts = [item for item in args.parts.split(",") if item] or None
    report: dict[str, Any] = {
        "parts": measure_parts(
            draws,
            focus=args.focus,
            families=families,
            estimators=args.estimators,
            count=args.steps,
            parts=parts,
            dump=args.dump,
        )
    }
    if args.retour:
        report["retour"] = measure_retour(draws, focus=args.focus, families=families, estimators=args.estimators)
    if args.json:
        print(json.dumps(report, indent=2, ensure_ascii=False))
    else:
        _print_parts(report["parts"])
        if "retour" in report:
            _print_retour(report["retour"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
