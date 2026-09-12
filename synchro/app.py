from __future__ import annotations

import json
import os
import signal
import threading
import time
from contextlib import asynccontextmanager
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any, AsyncIterator
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from synchro import db
from synchro.analysis.bayes import bayes_report
from synchro.analysis.balls import ball_board, parity_report
from synchro.analysis.combinatorics import proba_tables
from synchro.analysis.common import as_date
from synchro.analysis.dependence import dependence_report
from synchro.analysis.diagnostics import diagnostics_report
from synchro.analysis.inference import inference_report
from synchro.analysis.lab import lab_report
from synchro.analysis.montecarlo import montecarlo_report
from synchro.analysis.ta import indicators
from synchro.analysis.tech import tech_pack
from synchro.analysis.variables import VARIABLE_NAMES, series
from synchro.analysis.windowing import resolve_window
from synchro.analysis.windows import heikin_ashi, ohlc_blocks, rolling_stats
from synchro.chartisme.auto import status as chartisme_status_payload
from synchro.chartisme.backtest import run as chartisme_backtest_run
from synchro.chartisme.catalog import PIVOT_ROLE_LABELS as CHARTISME_PIVOT_ROLE_LABELS
from synchro.chartisme.catalog import catalog as chartisme_catalog
from synchro.chartisme.export import bundle_index as chartisme_bundle_index
from synchro.chartisme.export import export_curves as chartisme_export_curves
from synchro.chartisme.export import manifest as chartisme_manifest
from synchro.chartisme.export import read_bundle as chartisme_read_bundle
from synchro.chartisme.export import write_bundle as chartisme_write_bundle
from synchro.chartisme.figures import detect_figures as chartisme_detect_figures
from synchro.chartisme.figures import summarize as chartisme_summarize
from synchro.chartisme.models import availability as chartisme_model_availability
from synchro.chartisme.models.infer import annotate as chartisme_annotate
from synchro.chartisme.models.train import read_report as chartisme_read_report
from synchro.chartisme.render import figure_render as chartisme_figure_render
from synchro.chartisme.retrieval import build_index as chartisme_build_index
from synchro.chartisme.retrieval import search as chartisme_search
from synchro.chartisme.retrieval import sketch_to_values as chartisme_sketch_to_values
from synchro.chartisme.rules import ACTION_TYPES as CHARTISME_ACTION_TYPES
from synchro.chartisme.rules import evaluate_all as chartisme_evaluate_all
from synchro.chartisme.rules import normalize_rule as chartisme_normalize_rule
from synchro.chartisme.rules import summarize_firings as chartisme_summarize_firings
from synchro.chartisme.scan import collapse_zones as chartisme_collapse_zones
from synchro.chartisme.scan import scan_curve as chartisme_scan_curve
from synchro.chartisme.scan import windows_of as chartisme_windows_of
from synchro.config import ROOT, WEB_DIR, get_settings
from synchro.morpho.anticipation import anticipate
from synchro.morpho.geometry import analyze_draw, detect
from synchro.morpho.neighbors import neighbors_of_grid
from synchro.morpho.render import glyph_svg, portrait_render
from synchro.morpho.rules import evaluate_rules, normalize_rule
from synchro.morpho.vlm import analyze as vlm_analyze
from synchro.morpho.vlm import contrastive_query, draft_rule
from synchro.morpho.vlm import ensure_loaded as vlm_ensure_loaded
from synchro.morpho.vlm import sequence_query
from synchro.morpho.vlm import status as vlm_status
from synchro.ranks import evaluate_grid, validate_grid
from synchro.stats import compute_stats
from synchro.sync import ensure_draws, freshness, sync_draws

_LOCAL_SHUTDOWN_HOSTS = {"127.0.0.1", "::1", "localhost", "testclient"}


class GridIn(BaseModel):
    label: str = "Grille"
    numbers: list[int] = Field(min_length=5, max_length=5)
    stars: list[int] = Field(min_length=2, max_length=2)


class CheckIn(BaseModel):
    numbers: list[int] = Field(min_length=5, max_length=5)
    stars: list[int] = Field(min_length=2, max_length=2)
    last_n: int = Field(default=1, ge=1, le=200)


class MorphoGridIn(BaseModel):
    numbers: list[int] = Field(min_length=5, max_length=5)
    stars: list[int] = Field(min_length=2, max_length=2)
    weekday: str | None = None
    date: str | None = None


class MorphoRuleIn(BaseModel):
    id: str | None = None
    name: str = "Règle"
    condition: dict[str, Any] = Field(default_factory=dict)
    actions: list[dict[str, Any]] = Field(default_factory=list)
    active: bool = True


class MorphoEvaluateIn(BaseModel):
    numbers: list[int] = Field(min_length=5, max_length=5)
    stars: list[int] = Field(min_length=2, max_length=2)
    date: str | None = None
    weekday: str | None = None
    caption: str | None = None
    queries: dict[str, str] = Field(default_factory=dict)
    grounding_score: float | None = None
    persist: bool = False


class MorphoVlmIn(BaseModel):
    numbers: list[int] | None = None
    stars: list[int] | None = None
    date: str | None = None
    era: str = "current"
    sequence: int = Field(default=0, ge=0, le=8)
    contrast_numbers: list[int] | None = None
    contrast_stars: list[int] | None = None
    persist: bool = False


class ChartismeWindowIn(BaseModel):
    values: list[float] = Field(min_length=8)
    dates: list[str] | None = None
    activity: list[float] | None = None
    min_confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    models: bool = False


class ChartismeSketchIn(BaseModel):
    values: list[float] | None = None
    # Croquis à la souris : suite de points écran, `y` croissant vers le bas.
    points: list[list[float]] | None = None
    era: str = "all"
    curve: str | None = None
    size: int = Field(default=60, ge=16, le=200)
    stride: int = Field(default=15, ge=1, le=120)
    top: int = Field(default=12, ge=1, le=50)


class ChartismeLabelIn(BaseModel):
    id: str | None = None
    curve_id: str
    variable: str | None = None
    n: int | None = None
    figure: str
    # Classe libre de l'atelier, hors table de référence.
    custom_label: str | None = None
    from_index: int = Field(ge=0)
    to_index: int = Field(ge=0)
    from_date: str | None = None
    to_date: str | None = None
    values: list[float] = Field(default_factory=list)
    activity: list[float] | None = None
    # Rôles placés à la main : [{"role": "head", "index": 42, "value": 3.1}, …]
    roles: list[dict[str, Any]] = Field(default_factory=list)
    author: str | None = None


class ChartismeEvaluateIn(BaseModel):
    era: str = "all"
    curve: str | None = None
    rules: list[dict[str, Any]] | None = None
    max_curves: int = Field(default=12, ge=1, le=131)
    min_confidence: float = Field(default=0.6, ge=0.0, le=1.0)
    persist: bool = False


def _json(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: _json(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_json(v) for v in value]
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    return value


def _run_dir() -> Path:
    env = os.environ.get("SYNCHRO_RUN_DIR")
    return Path(env) if env else ROOT / ".run"


def _read_pid(path: Path) -> int | None:
    try:
        pid = int(path.read_text(encoding="utf-8").strip())
    except (OSError, ValueError):
        return None
    return pid if pid > 1 else None


def _terminate_pid(pid: int) -> None:
    try:
        os.kill(pid, signal.SIGTERM)
    except (ProcessLookupError, PermissionError, OSError):
        pass


def stop_local_stack() -> None:
    """Marque l'arrêt volontaire, puis signale l'UI et l'API (PIDs du lanceur)."""
    directory = _run_dir()
    try:
        directory.mkdir(parents=True, exist_ok=True)
        (directory / "stopped").write_text(str(int(time.time())), encoding="utf-8")
    except OSError:
        pass
    seen: set[int] = set()
    for name in ("frontend.pid", "backend.pid"):
        pid = _read_pid(directory / name)
        if pid and pid not in seen:
            seen.add(pid)
            _terminate_pid(pid)
    me = os.getpid()
    if me not in seen:
        _terminate_pid(me)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    # Ne pas bloquer /api/alive si Neon dort ou n'est pas configuré.
    try:
        if db.database_configured():
            db.init_db()
    except Exception:
        pass
    yield


def create_app() -> FastAPI:
    app = FastAPI(title="Synchro", version="0.1.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/api/alive")
    def alive() -> dict[str, Any]:
        return {"ok": True, "service": "synchro"}

    @app.get("/api/health")
    def health() -> dict[str, Any]:
        neon = db.ping()
        payload: dict[str, Any] = {
            "ok": bool(neon.get("ok")),
            "alive": True,
            "service": "synchro",
            "neon": neon,
            "draws": None,
            "latest": None,
            "last_sync": None,
            "expected_draw_date": None,
            "stale": None,
        }
        if not neon.get("ok"):
            return payload
        try:
            db.init_db()
            latest = db.latest_draw()
            last_ok = db.last_sync(ok_only=True)
            fresh = freshness(latest=latest)
            payload["draws"] = db.count_draws()
            payload["latest"] = _json(db.serialize_draw(latest)) if latest else None
            payload["last_sync"] = _json(db.serialize_row(last_ok) if last_ok else None)
            payload["expected_draw_date"] = fresh["expected_draw_date"]
            payload["stale"] = fresh["stale"]
        except Exception as exc:
            payload["ok"] = False
            payload["neon"] = {**neon, "ok": False, "error": str(exc)}
        return payload

    @app.post("/api/shutdown")
    def shutdown(request: Request) -> dict[str, bool]:
        host = request.client.host if request.client else ""
        if host not in _LOCAL_SHUTDOWN_HOSTS:
            raise HTTPException(403, "Arrêt autorisé uniquement depuis localhost.")

        def _stop() -> None:
            time.sleep(0.2)
            stop_local_stack()

        threading.Thread(target=_stop, daemon=True).start()
        return {"ok": True}

    @app.post("/api/reload-env")
    def reload_env() -> dict[str, Any]:
        get_settings.cache_clear()
        db.reset_pool()
        neon = db.ping()
        return {"ok": True, "neon": neon}

    @app.get("/api/draws")
    def draws(
        limit: int = Query(50, ge=1, le=5000),
        offset: int = Query(0, ge=0),
        q: str | None = None,
        year: int | None = Query(None, ge=2004, le=2100),
        era: str | None = Query(None, pattern="^(current|all)$"),
    ) -> dict[str, Any]:
        if era:
            rows = db.all_draws(era=era)
            total = len(rows)
            sliced = list(reversed(rows))[offset : offset + limit]
            return {
                "items": _json([db.serialize_draw(r) for r in sliced]),
                "total": total,
                "year": year,
                "era": era,
            }
        rows = [
            db.serialize_draw(r)
            for r in db.list_draws(limit=limit, offset=offset, query=q, year=year)
        ]
        return {
            "items": _json(rows),
            "total": db.count_draws(year=year),
            "year": year,
        }

    @app.get("/api/draws/latest")
    def latest() -> dict[str, Any]:
        row = db.latest_draw()
        if not row:
            raise HTTPException(404, "Aucun tirage. Lancez une synchro FDJ.")
        return _json(db.serialize_draw(row))

    @app.get("/api/stats")
    def stats(era: str = Query("current", pattern="^(current|all)$")) -> dict[str, Any]:
        return compute_stats(db.all_draws(era=era))

    def _analysis_draws(
        era: str,
        from_date: str | None = None,
        to_date: str | None = None,
    ) -> list[dict[str, Any]]:
        if not db.database_configured():
            raise HTTPException(503, "Neon non configuré.")
        rows = db.all_draws(era=era)
        start = date.fromisoformat(from_date[:10]) if from_date else None
        end = date.fromisoformat(to_date[:10]) if to_date else None
        if start:
            rows = [d for d in rows if as_date(d["draw_date"]) >= start]
        if end:
            rows = [d for d in rows if as_date(d["draw_date"]) <= end]
        return rows

    @app.get("/api/analysis/proba")
    def analysis_proba() -> dict[str, Any]:
        return proba_tables()

    @app.get("/api/analysis/variables")
    def analysis_variables(
        name: str = Query("sum"),
        n: int | None = Query(None, ge=1, le=50),
        window: int = Query(20, ge=1, le=500),
        era: str = Query("current", pattern="^(current|all)$"),
        from_date: str | None = None,
        to_date: str | None = None,
    ) -> dict[str, Any]:
        if name not in VARIABLE_NAMES:
            raise HTTPException(400, f"Variable inconnue: {name}")
        draws = _analysis_draws(era, from_date, to_date)
        payload = series(draws, name, n=n)
        payload["rolling"] = rolling_stats(draws, name, window=window, n=n)
        payload["ta"] = indicators(
            [float(v) for v in payload["values"]],
            sma_period=window,
            ema_period=window,
            bb_period=window,
        )
        return payload

    @app.get("/api/analysis/ohlc")
    def analysis_ohlc(
        name: str = Query("sum"),
        block: str = Query("month", pattern="^(month|week|window)$"),
        window: int = Query(10, ge=1, le=200),
        n: int | None = Query(None, ge=1, le=50),
        heikin: bool = False,
        era: str = Query("current", pattern="^(current|all)$"),
        from_date: str | None = None,
        to_date: str | None = None,
    ) -> dict[str, Any]:
        if name not in VARIABLE_NAMES:
            raise HTTPException(400, f"Variable inconnue: {name}")
        draws = _analysis_draws(era, from_date, to_date)
        payload = ohlc_blocks(draws, name=name, block=block, window=window, n=n)
        if heikin:
            payload["heikin_ashi"] = heikin_ashi(payload["candles"])
        closes = [float(c["c"]) for c in payload["candles"]]
        payload["ta"] = indicators(
            closes,
            payload["candles"],
            sma_period=window,
            ema_period=window,
            bb_period=window,
        )
        return payload

    @app.get("/api/analysis/ta")
    def analysis_ta(
        name: str = Query("sum"),
        window: int = Query(20, ge=2, le=500),
        block: str = Query("month", pattern="^(month|week|window)$"),
        n: int | None = Query(None, ge=1, le=50),
        era: str = Query("current", pattern="^(current|all)$"),
        from_date: str | None = None,
        to_date: str | None = None,
        preset: str = Query("all"),
        last_n: int | None = Query(None, ge=1, le=2000),
        warmup: int = Query(52, ge=0, le=400),
    ) -> dict[str, Any]:
        if name not in VARIABLE_NAMES:
            raise HTTPException(400, f"Variable inconnue: {name}")
        archive = _analysis_draws(era, None, None)
        resolved = resolve_window(
            archive,
            preset=preset,
            from_date=from_date,
            to_date=to_date,
            last_n=last_n,
            warmup=warmup,
        )
        work = resolved["work"]
        with_warmup = resolved["with_warmup"]
        payload = series(work, name, n=n)
        full = series(with_warmup, name, n=n)
        candles = ohlc_blocks(work, name=name, block=block, window=window, n=n)["candles"]
        pack = indicators(
            [float(v) for v in payload["values"]],
            candles,
            sma_period=window,
            ema_period=window,
            bb_period=window,
        )
        pack["extended"] = tech_pack(
            [float(v) for v in full["values"]],
            [],
            [p["date"] for p in full["points"]],
            sma_period=window,
            warmup_count=resolved["warmup_count"],
        )
        pack["window"] = {
            "preset": resolved["preset"],
            "from_date": resolved["from_date"],
            "to_date": resolved["to_date"],
            "draw_count": resolved["draw_count"],
            "warmup_count": resolved["warmup_count"],
            "star_pool_break": resolved["star_pool_break"],
        }
        return pack

    @app.get("/api/analysis/inference")
    def analysis_inference(
        era: str = Query("current", pattern="^(current|all)$"),
        from_date: str | None = None,
        to_date: str | None = None,
    ) -> dict[str, Any]:
        return inference_report(_analysis_draws(era, from_date, to_date))

    @app.get("/api/analysis/montecarlo")
    def analysis_montecarlo(
        era: str = Query("current", pattern="^(current|all)$"),
        n: int = Query(1000, ge=1, le=5000),
        seed: int = Query(0),
        from_date: str | None = None,
        to_date: str | None = None,
    ) -> dict[str, Any]:
        return montecarlo_report(_analysis_draws(era, from_date, to_date), n_sim=n, seed=seed)

    @app.get("/api/analysis/bayes")
    def analysis_bayes(
        era: str = Query("current", pattern="^(current|all)$"),
        from_date: str | None = None,
        to_date: str | None = None,
    ) -> dict[str, Any]:
        return bayes_report(_analysis_draws(era, from_date, to_date))

    @app.get("/api/analysis/dependence")
    def analysis_dependence(
        era: str = Query("current", pattern="^(current|all)$"),
        from_date: str | None = None,
        to_date: str | None = None,
    ) -> dict[str, Any]:
        draws = _analysis_draws(era, from_date, to_date)
        payload = dependence_report(draws)
        payload["diagnostics"] = diagnostics_report(draws)
        return payload

    @app.get("/api/analysis/numbers")
    def analysis_numbers(
        era: str = Query("current", pattern="^(current|all)$"),
        from_date: str | None = None,
        to_date: str | None = None,
    ) -> dict[str, Any]:
        draws = _analysis_draws(era, from_date, to_date)
        return {
            "balls": ball_board(draws),
            "parity": parity_report(draws),
        }

    @app.get("/api/analysis/lab")
    def analysis_lab(
        era: str = Query("current", pattern="^(current|all)$"),
        name: str = Query("sum"),
        window: int = Query(20, ge=1, le=500),
        block: str = Query("month", pattern="^(month|week|window)$"),
        n: int = Query(7, ge=1, le=50),
        n_sim: int = Query(400, ge=1, le=5000),
        seed: int = Query(0),
        from_date: str | None = None,
        to_date: str | None = None,
        preset: str = Query("all"),
        last_n: int | None = Query(None, ge=1, le=2000),
        warmup: int = Query(52, ge=0, le=400),
    ) -> dict[str, Any]:
        if name not in VARIABLE_NAMES:
            raise HTTPException(400, f"Variable inconnue: {name}")
        draws = _analysis_draws(era, None, None)
        return lab_report(
            draws,
            variable=name,
            window=window,
            block=block,
            n=n,
            n_sim=n_sim,
            seed=seed,
            include_mc=True,
            preset=preset,
            last_n=last_n,
            warmup=warmup,
            from_date=from_date,
            to_date=to_date,
        )

    @app.post("/api/check")
    def check(payload: CheckIn) -> dict[str, Any]:
        validate_grid(payload.numbers, payload.stars)
        draw_rows = db.list_draws(limit=payload.last_n, offset=0)
        if not draw_rows:
            raise HTTPException(404, "Aucun tirage en base.")
        results = []
        for draw in draw_rows:
            result = evaluate_grid(
                payload.numbers,
                payload.stars,
                list(draw["numbers"]),
                list(draw["stars"]),
            )
            draw_date = draw["draw_date"]
            result["draw_date"] = draw_date.isoformat() if hasattr(draw_date, "isoformat") else str(draw_date)
            result["draw_numbers"] = list(draw["numbers"])
            result["draw_stars"] = list(draw["stars"])
            results.append(result)
        return {"results": results}

    @app.get("/api/grids")
    def grids() -> dict[str, Any]:
        return {"items": [_json(db.serialize_row(g)) for g in db.list_grids()]}

    @app.post("/api/grids")
    def create_grid(payload: GridIn) -> dict[str, Any]:
        validate_grid(payload.numbers, payload.stars)
        row = db.insert_grid(
            payload.label.strip() or "Grille",
            sorted(payload.numbers),
            sorted(payload.stars),
        )
        return _json(db.serialize_row(row))

    @app.delete("/api/grids/{grid_id}")
    def remove_grid(grid_id: int) -> dict[str, bool]:
        if not db.delete_grid(grid_id):
            raise HTTPException(404, "Grille introuvable")
        return {"ok": True}

    @app.post("/api/sync")
    def sync() -> dict[str, Any]:
        return run_sync()

    @app.post("/api/sync/ensure")
    def sync_ensure() -> dict[str, Any]:
        return run_ensure()

    def _morpho_state(payload: MorphoGridIn) -> dict[str, Any]:
        try:
            validate_grid(payload.numbers, payload.stars)
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        portrait = detect(payload.numbers, payload.stars)
        portrait["date"] = payload.date
        portrait["weekday"] = (payload.weekday or "").lower()
        return portrait

    @app.get("/api/morpho/status")
    def morpho_status() -> dict[str, Any]:
        return {"ok": True, "vlm": vlm_status()}

    @app.post("/api/morpho/analyze")
    def morpho_analyze(payload: MorphoGridIn) -> dict[str, Any]:
        state = _morpho_state(payload)
        return portrait_render(state)

    @app.get("/api/morpho/glyphs")
    def morpho_glyphs(
        era: str = Query("current", pattern="^(current|all)$"),
        limit: int = Query(24, ge=1, le=200),
        from_date: str | None = None,
        to_date: str | None = None,
    ) -> dict[str, Any]:
        draws = list(reversed(_analysis_draws(era, from_date, to_date)))[:limit]
        items = []
        for draw in draws:
            portrait = analyze_draw(draw)
            items.append(portrait_render(portrait))
        return {"items": items, "total": len(items)}

    @app.post("/api/morpho/neighbors")
    def morpho_neighbors(
        payload: MorphoGridIn,
        era: str = Query("current", pattern="^(current|all)$"),
        k: int = Query(8, ge=1, le=30),
    ) -> dict[str, Any]:
        state = _morpho_state(payload)
        draws = _analysis_draws(era)
        items = neighbors_of_grid(
            payload.numbers, payload.stars, draws, k=k, date=payload.date
        )
        return {"query": portrait_render(state), "items": [portrait_render(p) for p in items]}

    @app.get("/api/morpho/anticipate")
    def morpho_anticipate(
        era: str = Query("current", pattern="^(current|all)$"),
        n: int = Query(400, ge=50, le=2000),
        seed: int = Query(0),
        from_date: str | None = None,
        to_date: str | None = None,
    ) -> dict[str, Any]:
        return anticipate(_analysis_draws(era, from_date, to_date), n_sim=n, seed=seed)

    @app.get("/api/morpho/rules")
    def morpho_rules() -> dict[str, Any]:
        if not db.database_configured():
            raise HTTPException(503, "Neon non configuré.")
        return {"items": [_json(db.serialize_row(r)) for r in db.list_morpho_rules()]}

    @app.post("/api/morpho/rules")
    def morpho_save_rule(payload: MorphoRuleIn) -> dict[str, Any]:
        if not db.database_configured():
            raise HTTPException(503, "Neon non configuré.")
        rule = normalize_rule(payload.model_dump())
        return _json(db.serialize_row(db.upsert_morpho_rule(rule)))

    @app.delete("/api/morpho/rules/{rule_id}")
    def morpho_delete_rule(rule_id: str) -> dict[str, bool]:
        if not db.database_configured():
            raise HTTPException(503, "Neon non configuré.")
        if not db.delete_morpho_rule(rule_id):
            raise HTTPException(404, "Règle introuvable")
        return {"ok": True}

    @app.get("/api/morpho/firings")
    def morpho_firings(limit: int = Query(40, ge=1, le=200)) -> dict[str, Any]:
        if not db.database_configured():
            raise HTTPException(503, "Neon non configuré.")
        return {"items": [_json(db.serialize_row(r)) for r in db.list_morpho_firings(limit)]}

    @app.post("/api/morpho/rules/evaluate")
    def morpho_evaluate(payload: MorphoEvaluateIn) -> dict[str, Any]:
        try:
            validate_grid(payload.numbers, payload.stars)
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        state = detect(payload.numbers, payload.stars)
        state["date"] = payload.date
        state["weekday"] = (payload.weekday or "").lower()
        if payload.caption:
            state["caption"] = payload.caption
        if payload.queries:
            state["queries"] = payload.queries
        state["grounding_score"] = payload.grounding_score
        rules = []
        if db.database_configured():
            try:
                rules = [normalize_rule(db.serialize_row(r)) for r in db.list_morpho_rules()]
            except Exception:
                rules = []
        firings = evaluate_rules(rules, state)
        if payload.persist and db.database_configured():
            for firing in firings:
                try:
                    db.insert_morpho_firing(
                        firing["rule_id"],
                        firing.get("draw_date"),
                        firing["motif_snapshot"],
                    )
                except Exception:
                    pass
        return {"state": portrait_render(state), "firings": firings}

    @app.get("/api/morpho/svg")
    def morpho_svg(
        numbers: str = Query(...),
        stars: str = Query(...),
        labels: bool = True,
    ) -> dict[str, str]:
        nums = [int(x) for x in numbers.split(",") if x.strip()]
        sts = [int(x) for x in stars.split(",") if x.strip()]
        try:
            validate_grid(nums, sts)
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        return {"svg": glyph_svg(nums, sts, show_labels=labels)}

    @app.post("/api/morpho/vlm/load")
    def morpho_vlm_load() -> dict[str, Any]:
        try:
            return vlm_ensure_loaded()
        except Exception as exc:
            return {"ok": False, "error": str(exc), **vlm_status()}

    @app.get("/api/morpho/vlm/status")
    def morpho_vlm_status() -> dict[str, Any]:
        return vlm_status()

    @app.post("/api/morpho/vlm")
    def morpho_vlm(payload: MorphoVlmIn) -> dict[str, Any]:
        numbers = payload.numbers
        stars = payload.stars
        if (numbers is None or stars is None) and payload.date:
            draws = _analysis_draws(payload.era)
            match = next(
                (
                    d
                    for d in draws
                    if str(d.get("draw_date"))[:10] == payload.date[:10]
                ),
                None,
            )
            if not match:
                raise HTTPException(404, "Tirage introuvable")
            numbers = list(match["numbers"])
            stars = list(match["stars"])
        if numbers is None or stars is None:
            raise HTTPException(400, "numbers/stars ou date requis")
        try:
            validate_grid(numbers, stars)
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        state = vlm_analyze(numbers, stars)
        state["date"] = payload.date
        extra: dict[str, Any] = {}
        if payload.sequence >= 2:
            history = _analysis_draws(payload.era)
            recent = history[-payload.sequence :]
            extra["sequence"] = sequence_query(
                [([int(n) for n in d["numbers"]], [int(s) for s in d["stars"]]) for d in recent]
            )
        if payload.contrast_numbers and payload.contrast_stars:
            extra["contrast"] = contrastive_query(
                (numbers, stars),
                (payload.contrast_numbers, payload.contrast_stars),
            )
        extra["draft"] = draft_rule(state)
        if payload.persist and payload.date and db.database_configured() and state.get("vlm"):
            try:
                db.upsert_morpho_caption(
                    {
                        "draw_date": payload.date[:10],
                        "model_id": state.get("model_id") or "geometry",
                        "revision": state.get("revision"),
                        "prompt_id": state.get("prompt_id") or "morpho-vqa-v1",
                        "caption": state.get("caption"),
                        "queries": state.get("queries") or {},
                        "grounding_score": state.get("grounding_score"),
                        "image_hash": state.get("image_hash"),
                    }
                )
            except Exception:
                pass
        return {"ok": True, "state": portrait_render(state), **extra}

    # --- Chartisme ------------------------------------------------------------

    def _chartisme_bundle(era: str = "all", refresh: bool = False) -> dict[str, Any]:
        """Bundle de courbes, relu du disque si possible.

        Le réexport coûte un parcours complet de l'archive : on ne le refait
        que sur demande explicite ou quand rien n'a encore été écrit.
        """
        if not refresh:
            cached = chartisme_read_bundle()
            if cached:
                return cached
        bundle = chartisme_export_curves(_analysis_draws(era))
        try:
            chartisme_write_bundle(bundle)
        except OSError:
            pass
        return bundle

    @app.get("/api/chartisme/catalog")
    def chartisme_catalog_route() -> dict[str, Any]:
        return {
            "ok": True,
            "figures": chartisme_catalog(),
            "pivot_roles": dict(CHARTISME_PIVOT_ROLE_LABELS),
        }

    @app.get("/api/chartisme/status")
    def chartisme_status() -> dict[str, Any]:
        state = chartisme_status_payload()
        state["auto_export"] = get_settings().chartisme_auto_export
        if db.database_configured():
            try:
                state["pending_labels"] = db.count_chartisme_labels()
            except Exception:
                state["pending_labels"] = None
        return state

    @app.get("/api/chartisme/curves")
    def chartisme_curves(
        era: str = Query("all", pattern="^(current|all)$"),
        refresh: bool = False,
        curve: str | None = None,
    ) -> dict[str, Any]:
        bundle = _chartisme_bundle(era, refresh)
        curves = bundle.get("curves") or []
        if curve:
            curves = [c for c in curves if c.get("id") == curve]
            if not curves:
                raise HTTPException(404, "Courbe introuvable")
            return {"ok": True, "curve": curves[0]}
        return {
            "ok": True,
            "manifest": chartisme_manifest(bundle),
            # Sans les séries : le bundle complet pèse plusieurs mégaoctets et
            # l'onglet n'affiche qu'une courbe à la fois.
            "curves": [
                {k: v for k, v in c.items() if k not in ("values", "dates", "activity")}
                for c in curves
            ],
        }

    @app.get("/api/chartisme/figures")
    def chartisme_figures(
        curve: str = Query(...),
        era: str = Query("all", pattern="^(current|all)$"),
        scale: int | None = Query(None, ge=16, le=400),
        min_confidence: float = Query(0.5, ge=0.0, le=1.0),
        zones: bool = True,
        models: bool = False,
    ) -> dict[str, Any]:
        bundle = _chartisme_bundle(era)
        found = next(
            (c for c in (bundle.get("curves") or []) if c.get("id") == curve), None
        )
        if not found:
            raise HTTPException(404, "Courbe introuvable")
        hits = chartisme_scan_curve(
            found,
            scales=(scale,) if scale else None,
            min_confidence=min_confidence,
        )
        if zones:
            hits = chartisme_collapse_zones(hits)
        payload: dict[str, Any] = {
            "ok": True,
            "curve": found,
            "figures": hits,
            "summary": chartisme_summarize(hits),
        }
        if models:
            payload["models"] = chartisme_annotate(
                hits, found.get("values") or [], activity=found.get("activity")
            )
        return payload

    @app.get("/api/chartisme/svg")
    def chartisme_svg(
        curve: str = Query(...),
        index: int = Query(0, ge=0),
        era: str = Query("all", pattern="^(current|all)$"),
        min_confidence: float = Query(0.5, ge=0.0, le=1.0),
    ) -> dict[str, Any]:
        bundle = _chartisme_bundle(era)
        found = next(
            (c for c in (bundle.get("curves") or []) if c.get("id") == curve), None
        )
        if not found:
            raise HTTPException(404, "Courbe introuvable")
        hits = chartisme_collapse_zones(
            chartisme_scan_curve(found, min_confidence=min_confidence)
        )
        if not hits:
            raise HTTPException(404, "Aucune figure sur cette courbe")
        if index >= len(hits):
            raise HTTPException(404, "Figure introuvable")
        return {"ok": True, **chartisme_figure_render(found, hits[index])}

    @app.post("/api/chartisme/detect")
    def chartisme_detect(payload: ChartismeWindowIn) -> dict[str, Any]:
        values = [float(v) for v in payload.values]
        if len(values) < 8:
            raise HTTPException(400, "Fenêtre trop courte (8 valeurs minimum)")
        hits = chartisme_detect_figures(
            values,
            payload.dates,
            payload.activity,
            min_confidence=payload.min_confidence,
        )
        out: dict[str, Any] = {
            "ok": True,
            "figures": hits,
            "summary": chartisme_summarize(hits),
        }
        if payload.models:
            out["models"] = chartisme_annotate(hits, values, activity=payload.activity)
        return out

    @app.post("/api/chartisme/similar")
    def chartisme_similar(payload: ChartismeSketchIn) -> dict[str, Any]:
        values = list(payload.values or [])
        if payload.points and not values:
            values = chartisme_sketch_to_values(payload.points)
        if len(values) < 8:
            raise HTTPException(400, "Croquis trop court")
        bundle = _chartisme_bundle(payload.era)
        windows = chartisme_windows_of(
            bundle, size=payload.size, stride=payload.stride, curve=payload.curve
        )
        index = chartisme_build_index(windows)
        return {
            "ok": True,
            "query": values,
            "matches": chartisme_search(values, index, top=payload.top),
            "searched": len(index),
            "method": "dtw",
        }

    @app.get("/api/chartisme/labels")
    def chartisme_labels(limit: int = Query(200, ge=1, le=1000)) -> dict[str, Any]:
        if not db.database_configured():
            raise HTTPException(503, "Neon non configuré.")
        return {"items": [_json(db.serialize_row(r)) for r in db.list_chartisme_labels(limit)]}

    @app.post("/api/chartisme/labels")
    def chartisme_add_label(payload: ChartismeLabelIn) -> dict[str, Any]:
        if not db.database_configured():
            raise HTTPException(503, "Neon non configuré.")
        label = payload.model_dump()
        label["id"] = label.get("id") or str(uuid4())
        row = db.upsert_chartisme_label(label)
        return _json(db.serialize_row(row))

    @app.delete("/api/chartisme/labels/{label_id}")
    def chartisme_delete_label(label_id: str) -> dict[str, bool]:
        if not db.database_configured():
            raise HTTPException(503, "Neon non configuré.")
        if not db.delete_chartisme_label(label_id):
            raise HTTPException(404, "Étiquette introuvable")
        return {"ok": True}

    @app.get("/api/chartisme/rules")
    def chartisme_rules_list() -> dict[str, Any]:
        if not db.database_configured():
            raise HTTPException(503, "Neon non configuré.")
        return {
            "items": [_json(db.serialize_row(r)) for r in db.list_chartisme_rules()],
            "action_types": list(CHARTISME_ACTION_TYPES),
        }

    @app.post("/api/chartisme/rules")
    def chartisme_save_rule(payload: dict[str, Any]) -> dict[str, Any]:
        if not db.database_configured():
            raise HTTPException(503, "Neon non configuré.")
        rule = chartisme_normalize_rule(payload)
        return _json(db.serialize_row(db.upsert_chartisme_rule(rule)))

    @app.delete("/api/chartisme/rules/{rule_id}")
    def chartisme_delete_rule(rule_id: str) -> dict[str, bool]:
        if not db.database_configured():
            raise HTTPException(503, "Neon non configuré.")
        if not db.delete_chartisme_rule(rule_id):
            raise HTTPException(404, "Règle introuvable")
        return {"ok": True}

    @app.get("/api/chartisme/firings")
    def chartisme_firings(limit: int = Query(60, ge=1, le=400)) -> dict[str, Any]:
        if not db.database_configured():
            raise HTTPException(503, "Neon non configuré.")
        return {"items": [_json(db.serialize_row(r)) for r in db.list_chartisme_firings(limit)]}

    @app.post("/api/chartisme/rules/evaluate")
    def chartisme_evaluate(payload: ChartismeEvaluateIn) -> dict[str, Any]:
        bundle = _chartisme_bundle(payload.era)
        curves = bundle.get("curves") or []
        if payload.curve:
            curves = [c for c in curves if c.get("id") == payload.curve]
        hits: list[dict[str, Any]] = []
        for found in curves[: payload.max_curves]:
            hits.extend(
                chartisme_scan_curve(found, min_confidence=payload.min_confidence)
            )
        rules = [chartisme_normalize_rule(r) for r in (payload.rules or [])]
        if not rules and db.database_configured():
            try:
                rules = [
                    chartisme_normalize_rule(db.serialize_row(r))
                    for r in db.list_chartisme_rules()
                ]
            except Exception:
                rules = []
        firings = chartisme_evaluate_all(
            rules, hits, curves=chartisme_bundle_index(bundle)
        )
        if payload.persist and db.database_configured():
            for firing in firings:
                try:
                    db.insert_chartisme_firing(
                        firing["rule_id"],
                        firing.get("curve_id"),
                        firing.get("figure"),
                        firing.get("figure_date"),
                        firing.get("snapshot"),
                    )
                except Exception:
                    pass
        return {
            "ok": True,
            "firings": firings,
            "summary": chartisme_summarize_firings(firings),
            "scanned": len(hits),
        }

    @app.get("/api/chartisme/backtest")
    def chartisme_backtest(
        era: str = Query("all", pattern="^(current|all)$"),
        curve: str | None = None,
        max_curves: int = Query(12, ge=1, le=131),
        min_confidence: float = Query(0.6, ge=0.0, le=1.0),
        follow: int = Query(5, ge=1, le=20),
        numbers: bool = True,
    ) -> dict[str, Any]:
        bundle = _chartisme_bundle(era)
        curves = bundle.get("curves") or []
        if curve:
            curves = [c for c in curves if c.get("id") == curve]
        chosen = curves[:max_curves]
        hits: list[dict[str, Any]] = []
        for found in chosen:
            hits.extend(
                chartisme_scan_curve(found, min_confidence=min_confidence)
            )
        return {
            "ok": True,
            **chartisme_backtest_run(
                {str(c.get("id")): c for c in chosen},
                hits,
                draws=_analysis_draws(era) if numbers else None,
                follow=follow,
                base_rate_trials=120,
            ),
        }

    @app.get("/api/chartisme/training")
    def chartisme_training() -> dict[str, Any]:
        return {
            "ok": True,
            "report": chartisme_read_report(),
            "models": chartisme_model_availability(),
        }

    if WEB_DIR.exists():
        app.mount("/", StaticFiles(directory=str(WEB_DIR), html=True), name="web")

    return app


def run_sync(*, latest_only: bool = False) -> dict[str, Any]:
    try:
        return sync_draws(latest_only=latest_only)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(502, f"Synchro FDJ impossible: {exc}") from exc


def run_ensure() -> dict[str, Any]:
    try:
        result = ensure_draws()
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(502, f"Synchro FDJ impossible: {exc}") from exc
    if result.get("upserted"):
        _chartisme_auto_cycle()
    return result


def _chartisme_auto_cycle() -> None:
    """Accroche du module chartisme sur l'arrivée d'un tirage.

    Silencieuse et non fatale : le module se remet à jour tout seul quand
    l'option est active, mais une synchro de tirages n'échoue jamais à cause
    de lui.
    """
    if not get_settings().chartisme_auto_export:
        return
    try:
        from synchro.chartisme.auto import run_auto_cycle

        run_auto_cycle(
            [db.serialize_draw(row) for row in db.all_draws(era="all")],
            reason="ensure",
            rules=[db.serialize_row(r) for r in db.list_chartisme_rules()],
        )
    except Exception:  # noqa: BLE001 — rien ne remonte jusqu'à la synchro
        pass


def export_snapshot(path: Path | None = None) -> Path:
    db.init_db()
    target = path or (WEB_DIR / "snapshot.json")
    draws = [db.serialize_draw(r) for r in db.all_draws(era="all")]
    snapshot = {
        "exported_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "mode": "snapshot",
        "total": len(draws),
        "latest": draws[-1] if draws else None,
        "draws": list(reversed(draws)),
        "stats_current": compute_stats(db.all_draws(era="current")),
        "stats_all": compute_stats(db.all_draws(era="all")),
        "analysis_proba": proba_tables(),
        "analysis_current": lab_report(
            db.all_draws(era="current"),
            include_mc=False,
        ),
        "last_sync": _json(db.last_sync()),
    }
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(_json(snapshot), ensure_ascii=False), encoding="utf-8")
    return target
