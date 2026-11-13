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
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from psycopg_pool import PoolTimeout
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
from synchro.analysis.fingerprints import analogs_report
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
from synchro.chartisme.scan import DEFAULT_SCALES as CHARTISME_DEFAULT_SCALES
from synchro.chartisme.scan import MIN_WINDOW as CHARTISME_MIN_WINDOW
from synchro.chartisme.scan import collapse_zones as chartisme_collapse_zones
from synchro.chartisme.scan import live_in_window as chartisme_live_in_window
from synchro.chartisme.scan import scan_curve as chartisme_scan_curve
from synchro.chartisme.scan import slice_curve as chartisme_slice_curve
from synchro.chartisme.scan import windows_of as chartisme_windows_of
from synchro.chartisme.sense import name_sense as chartisme_name_sense
from synchro.chartisme.sense import sense_segments as chartisme_sense_segments
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
from synchro.plays import (
    MAX_COPIES,
    decorate_play,
    normalize_copies,
    normalize_play_spec,
    normalize_source,
    parse_play_date,
    summarize_plays,
    validate_play_grid,
)
from synchro.ranks import evaluate_grid, validate_grid
from synchro.stats import compute_stats
from synchro.sync import ensure_draws, freshness, next_play_date, sync_draws

_LOCAL_SHUTDOWN_HOSTS = {"127.0.0.1", "::1", "localhost", "testclient"}


class GridIn(BaseModel):
    label: str = "Grille"
    numbers: list[int] = Field(min_length=5, max_length=5)
    stars: list[int] = Field(min_length=2, max_length=2)


class GridLabelIn(BaseModel):
    label: str = Field(max_length=200)


class PlayItemIn(BaseModel):
    label: str = "Grille"
    numbers: list[int] = Field(min_length=5, max_length=5)
    stars: list[int] = Field(min_length=2, max_length=2)
    copies: int = Field(default=1, ge=1, le=MAX_COPIES)
    note: str | None = None
    source: str = "manuel"
    grid_id: int | None = None
    spec: dict[str, Any] | None = None


class PlayIn(BaseModel):
    play_date: str
    label: str = "Grille"
    numbers: list[int] | None = Field(default=None, min_length=5, max_length=5)
    stars: list[int] | None = Field(default=None, min_length=2, max_length=2)
    copies: int = Field(default=1, ge=1, le=MAX_COPIES)
    note: str | None = None
    source: str = "manuel"
    grid_id: int | None = None
    spec: dict[str, Any] | None = None
    items: list[PlayItemIn] | None = None


class PlayPatch(BaseModel):
    label: str | None = None
    numbers: list[int] | None = Field(default=None, min_length=5, max_length=5)
    stars: list[int] | None = Field(default=None, min_length=2, max_length=2)
    play_date: str | None = None
    source: str | None = None
    note: str | None = None
    copies: int | None = Field(default=None, ge=1, le=MAX_COPIES)


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
    # Écart-type habituel de la courbe entière. Sans lui le sens s'abstient :
    # le registre n'a pas d'unité.
    reference_sigma: float | None = None
    # Écart-type des pentes à trois tirages sur toute la courbe. Sans lui les
    # tronçons se découpent quand même, et la comparaison des coefficients s'abstient.
    reference_slope_sigma: float | None = None


class ChartismeSketchIn(BaseModel):
    values: list[float] | None = None
    # Croquis à la souris : suite de points écran, `y` croissant vers le bas.
    points: list[list[float]] | None = None
    era: str = "all"
    curve: str | None = None
    size: int = Field(default=60, ge=16, le=200)
    stride: int = Field(default=15, ge=1, le=120)
    top: int = Field(default=12, ge=1, le=50)
    # Mardi ou vendredi : chercher dans ce jour, pas dans l’export mixte.
    weekday: str | None = None


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


class BrainReadingIn(BaseModel):
    catalog_id: str
    handle: str
    lab: str
    params: dict[str, Any] = Field(default_factory=dict)
    window: dict[str, Any] = Field(default_factory=dict)
    draw_to: str | None = None
    payload: dict[str, Any] = Field(default_factory=dict)
    source: str = "user"
    thread_id: str | None = None
    comment: str | None = None
    embed: bool = True
    cloud_embed: bool = False


class BrainNoteIn(BaseModel):
    body: str
    author: str = "user"


class LlmUsageIn(BaseModel):
    surface: str = "ia"
    provider: str = "local"
    model: str | None = None
    ok: bool = False
    error: str | None = None
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    estimated: bool = False
    latency_ms: int | None = None


class LexiconCardIn(BaseModel):
    id: str
    status: str | None = None
    equation: str | None = None
    keywords: list[str] | None = None
    gloss: str | None = None
    scope: str | None = None
    source: str | None = None


class LexiconModeIn(BaseModel):
    automatic: bool = False


class LexiconReadIn(BaseModel):
    weekday: str | None = None
    era: str = "current"


class LexiconHelpIn(BaseModel):
    reading_id: str | None = None
    escalate: bool = False
    cloud_note: str | None = None


class BrainRetrieveIn(BaseModel):
    text: str
    k: int = Field(default=8, ge=1, le=20)
    cloud: bool = False
    model: str | None = None


class BrainAnalogsIn(BaseModel):
    date: str | None = None
    numbers: list[int] | None = None
    stars: list[int] | None = None
    axes: list[str] | None = None
    k: int = Field(default=8, ge=1, le=20)
    era: str = "current"
    from_date: str | None = None
    to_date: str | None = None


class BrainSpecialistIn(BaseModel):
    name: str
    target: str
    indicators: list[str] = Field(min_length=1)
    instructions: str
    task: str | None = None
    horizon: str = "value"
    n: int | None = Field(default=None, ge=1, le=50)
    hidden: int = Field(default=16, ge=4, le=64)
    epochs: int = Field(default=80, ge=10, le=400)
    seed: int = 0
    force: bool = False
    era: str = "current"
    abstain: float = Field(default=0.45, ge=0.0, le=1.0)
    origin: str | None = None


class RunArcadeChampionIn(BaseModel):
    generation: int = Field(ge=1)
    runner: str = Field(min_length=1, max_length=40)
    cents: int
    examCents: int | None = None
    # Fenêtre de l'examen qui a donné examCents. Facultatifs : un ancien champion ne les envoie pas.
    # Sans ces champs, le modèle les jetterait avant l'écriture du payload dans Neon.
    examFrom: str | None = None
    examTo: str | None = None
    examTurns: int | None = Field(default=None, ge=0)
    calls: int = Field(default=0, ge=0)
    raceFrom: str | None = None
    raceTo: str | None = None
    # Départ du runner et ses tours de course : champs libres du payload, sans colonne Neon.
    # Sans ces champs, le modèle les jetterait avant l'écriture du payload dans Neon.
    depart: str | None = None
    raceTurns: int | None = Field(default=None, ge=0)
    # Pronostic hors échantillon : champ libre du payload, sans colonne Neon.
    # Sans ce champ, le modèle le jetterait avant l'écriture du payload dans Neon.
    forecast: dict[str, Any] | None = None
    skills: list[dict[str, Any]] = Field(min_length=1, max_length=40)
    journal: list[dict[str, Any]] = Field(default_factory=list, max_length=200)
    savedAt: str | None = None


class DecisionTreeIn(BaseModel):
    question: str = "shape"
    label: str | None = None
    series: str | None = None
    era: str = "current"
    curves: list[str] | None = None
    indicators: list[str] | None = None
    label_cut: str = "learned"
    windows: str = "learned"
    max_depth: int = Field(default=4, ge=2, le=4)
    criterion: str | None = None
    permutations: int | None = Field(default=None, ge=0, le=199)
    seed: int = 0


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


def _parse_scales(text: str | None) -> tuple[int, ...] | None:
    """Échelles passées en clair, « 25,50,100 ». `None` laisse les valeurs par défaut.

    Une échelle hors bornes est écartée sans faire échouer la requête : la borne
    basse est la plus courte figure détectable, la haute la longueur qu'aucun
    cycle observé ne dépasse.
    """
    if not text:
        return None
    sizes = sorted(
        {
            size
            for chunk in text.split(",")
            if (raw := chunk.strip()).isdigit()
            and CHARTISME_MIN_WINDOW <= (size := int(raw)) <= 400
        }
    )
    return tuple(sizes) or None


def _parse_thresholds(text: str | None, scales: tuple[int, ...] | None) -> dict[int, float]:
    """Seuils appariés aux échelles, « 0.79,0.74,0.71 ».

    L'appariement est positionnel : `_parse_scales` trie et dédoublonne, et
    l'onglet envoie ses seuils dans le même ordre croissant. Une liste de
    longueur inattendue est ignorée en entier plutôt qu'appariée de travers —
    décaler les seuils d'un cran rendrait un balayage plausible et faux.
    """
    if not text or not scales:
        return {}
    parts = [chunk.strip() for chunk in text.split(",")]
    if len(parts) != len(scales):
        return {}
    out: dict[int, float] = {}
    for scale, raw in zip(scales, parts):
        try:
            value = float(raw)
        except ValueError:
            continue
        if 0.0 <= value <= 1.0:
            out[scale] = value
    return out


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


def _init_db_background() -> None:
    """Neon peut dormir plusieurs secondes. Ça ne doit pas retenir /api/alive."""
    try:
        if db.database_configured():
            db.init_db()
    except Exception:
        pass


class JournalPrIn(BaseModel):
    number: int
    title: str
    merged_on: str
    url: str = ""


class JournalIn(BaseModel):
    area: str
    title: str
    body: str
    happened_on: str | None = None
    pr_number: int | None = None
    pr_url: str | None = None
    prs: list[JournalPrIn] | None = None


class JournalPatch(BaseModel):
    area: str | None = None
    title: str | None = None
    body: str | None = None
    hidden: bool | None = None


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    threading.Thread(target=_init_db_background, name="synchro-init-db", daemon=True).start()
    yield


def _warm_decision_tree() -> None:
    """Charge le paquet une fois, dans un seul fil, avant les requêtes.

    La page ouvre le journal et le tableau ensemble. Deux imports simultanés
    du paquet se bloquent sur `questions`.
    """
    try:
        from synchro.decision_tree import list_readings  # noqa: F401
        from synchro.decision_tree.questions import question_picture  # noqa: F401
    except ImportError:
        return


def create_app() -> FastAPI:
    _warm_decision_tree()
    app = FastAPI(title="Synchro", version="0.1.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def weekday_query_middleware(request: Request, call_next):
        from synchro.weekday import bind_request_weekday, reset_request_weekday

        raw = request.query_params.get("weekday") or request.query_params.get("jour")
        token = bind_request_weekday(raw)
        try:
            return await call_next(request)
        finally:
            reset_request_weekday(token)

    @app.exception_handler(PoolTimeout)
    async def neon_pool_timeout(_request: Request, exc: PoolTimeout) -> JSONResponse:
        return JSONResponse(
            status_code=503,
            content={
                "detail": "Neon: aucune connexion disponible. Réessayez.",
                "error": str(exc),
            },
        )

    @app.get("/api/alive")
    def alive() -> dict[str, Any]:
        return {"ok": True, "service": "synchro"}

    @app.get("/api/health")
    def health() -> dict[str, Any]:
        details = db.health_details()
        neon = details["neon"]
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
            latest = details["latest"]
            last_ok = details["last_sync"]
            fresh = freshness(latest=latest or {})
            payload["draws"] = details["draws"]
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
        weekday: str | None = None,
    ) -> dict[str, Any]:
        from synchro.weekday import filter_draws_by_weekday, normalize_weekday_filter

        day = normalize_weekday_filter(weekday)
        if era:
            rows = filter_draws_by_weekday(db.all_draws(era=era), day)
            total = len(rows)
            sliced = list(reversed(rows))[offset : offset + limit]
            return {
                "items": _json([db.serialize_draw(r) for r in sliced]),
                "total": total,
                "year": year,
                "era": era,
                "weekday": day,
            }
        rows = [
            db.serialize_draw(r)
            for r in db.list_draws(
                limit=limit, offset=offset, query=q, year=year, weekday=day
            )
        ]
        return {
            "items": _json(rows),
            "total": db.count_draws(year=year, weekday=day),
            "year": year,
            "weekday": day,
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
        weekday: str | None = None,
    ) -> list[dict[str, Any]]:
        from synchro.weekday import filter_draws_by_weekday, request_weekday

        if not db.database_configured():
            raise HTTPException(503, "Neon non configuré.")
        rows = db.all_draws(era=era)
        rows = filter_draws_by_weekday(rows, weekday or request_weekday())
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

    @app.post("/api/analysis/fractal")
    async def analysis_fractal(request: Request) -> dict[str, Any]:
        import numpy as np

        from synchro.fractal.boxcount import fractal_report
        from synchro.harmo.util import json_safe

        try:
            payload = await request.json()
        except Exception as exc:
            raise HTTPException(400, "Corps JSON illisible.") from exc
        if not isinstance(payload, dict):
            raise HTTPException(400, "Corps JSON illisible.")
        raw = payload.get("height")
        if not isinstance(raw, list) or not raw or not all(isinstance(row, list) and row for row in raw):
            raise HTTPException(400, "height est une grille rectangulaire.")
        width = len(raw[0])
        if any(len(row) != width for row in raw):
            raise HTTPException(400, "height est une grille rectangulaire.")
        if len(raw) > 20000 or width > 200 or len(raw) * width > 2_000_000:
            raise HTTPException(400, "Grille trop grande.")
        try:
            grid = np.asarray(raw, dtype=float)
        except (TypeError, ValueError) as exc:
            raise HTTPException(400, "height est une grille numérique.") from exc
        if grid.ndim != 2 or not np.isfinite(grid).all():
            raise HTTPException(400, "height est une grille numérique.")
        try:
            body = fractal_report(grid)
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        return json_safe(body)

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
        block: str = Query("month", pattern="^(month|week|window|short)$"),
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
        block: str = Query("month", pattern="^(month|week|window|short)$"),
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
        block: str = Query("month", pattern="^(month|week|window|short)$"),
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

    def _harmo_ready() -> None:
        from synchro.harmo import scipy_available

        if not scipy_available():
            raise HTTPException(
                503,
                "scipy absent — pip install -r requirements.txt (numpy, scipy).",
            )

    def _harmo_archive(era: str) -> tuple[list[dict[str, Any]], str]:
        from synchro.weekday import filter_draws_by_weekday, request_weekday

        if db.database_configured():
            try:
                return _analysis_draws(era, None, None), "neon"
            except HTTPException:
                raise
            except Exception as exc:
                raise HTTPException(
                    503, f"Archive Neon injoignable: {exc}"
                ) from exc
        from synchro.harmo.archive import bundled_draws

        rows = filter_draws_by_weekday(bundled_draws(era), request_weekday())
        if not rows:
            raise HTTPException(
                503,
                "Neon non configuré et archive JSON embarquée introuvable.",
            )
        return rows, "json"

    def _harmo_payload(payload: dict[str, Any]) -> dict[str, Any]:
        from synchro.harmo.util import json_safe

        return json_safe(payload)

    def _harmo_compute(build: Any) -> dict[str, Any]:
        try:
            return _harmo_payload(build())
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(500, str(exc)) from exc

    def _harmo_signal(
        variable: str,
        n: int | None,
        era: str,
        from_date: str | None,
        to_date: str | None,
        preset: str,
        last_n: int | None,
        warmup: int,
    ) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        from synchro.harmo.report import build_context

        _harmo_ready()
        if variable not in VARIABLE_NAMES:
            raise HTTPException(400, f"Variable inconnue: {variable}")
        archive, source = _harmo_archive(era)
        try:
            resolved = resolve_window(
                archive,
                preset=preset,
                from_date=from_date,
                to_date=to_date,
                last_n=last_n,
                warmup=warmup,
            )
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        work = resolved["work"]
        if not work:
            raise HTTPException(404, "Aucun tirage dans la fenêtre.")
        try:
            signal = build_context(work, variable=variable, n=n, resolved=resolved)
        except (ValueError, TypeError, KeyError) as exc:
            raise HTTPException(400, str(exc)) from exc
        signal["archive_source"] = source
        if source == "json":
            notes = list(signal.get("notes") or [])
            notes.append(
                {
                    "id": "json_archive",
                    "level": "info",
                    "text": (
                        "Archive JSON embarquée (2026). Neon n’est pas configuré : "
                        "l’étude est limitée à ces tirages."
                    ),
                }
            )
            signal["notes"] = notes
        return work, signal

    @app.get("/api/harmo/status")
    def harmo_status() -> dict[str, Any]:
        from synchro.harmo import extras_status

        return extras_status()

    @app.get("/api/harmo/spectrum")
    def harmo_spectrum(
        variable: str = Query("sum"),
        n: int | None = Query(None, ge=1, le=50),
        era: str = Query("current", pattern="^(current|all)$"),
        from_date: str | None = None,
        to_date: str | None = None,
        preset: str = Query("last_100"),
        last_n: int | None = Query(None, ge=1, le=2000),
        warmup: int = Query(52, ge=0, le=400),
        window: str = Query("blackmanharris", pattern="^(blackmanharris|flattop|hann)$"),
        timebase: str = Query("index", pattern="^(index|calendar)$"),
    ) -> dict[str, Any]:
        from synchro.harmo.report import spectrum_report

        _work, signal = _harmo_signal(
            variable, n, era, from_date, to_date, preset, last_n, warmup
        )
        payload = _harmo_compute(lambda: spectrum_report(signal, window=window))
        payload["timebase"] = timebase
        return payload

    @app.get("/api/harmo/welch")
    def harmo_welch(
        variable: str = Query("sum"),
        n: int | None = Query(None, ge=1, le=50),
        era: str = Query("current", pattern="^(current|all)$"),
        from_date: str | None = None,
        to_date: str | None = None,
        preset: str = Query("last_100"),
        last_n: int | None = Query(None, ge=1, le=2000),
        warmup: int = Query(52, ge=0, le=400),
        nperseg: int | None = Query(None, ge=16, le=512),
    ) -> dict[str, Any]:
        from synchro.harmo.report import welch_report

        _work, signal = _harmo_signal(
            variable, n, era, from_date, to_date, preset, last_n, warmup
        )
        return _harmo_compute(lambda: welch_report(signal, nperseg=nperseg))

    @app.get("/api/harmo/stft")
    def harmo_stft(
        variable: str = Query("sum"),
        n: int | None = Query(None, ge=1, le=50),
        era: str = Query("current", pattern="^(current|all)$"),
        from_date: str | None = None,
        to_date: str | None = None,
        preset: str = Query("last_100"),
        last_n: int | None = Query(None, ge=1, le=2000),
        warmup: int = Query(52, ge=0, le=400),
        nperseg: int | None = Query(None, ge=16, le=512),
        sst: bool = True,
    ) -> dict[str, Any]:
        from synchro.harmo.report import stft_report

        _work, signal = _harmo_signal(
            variable, n, era, from_date, to_date, preset, last_n, warmup
        )
        return _harmo_compute(
            lambda: stft_report(signal, nperseg=nperseg, want_sst=sst)
        )

    @app.get("/api/harmo/envelope")
    def harmo_envelope(
        variable: str = Query("sum"),
        n: int | None = Query(None, ge=1, le=50),
        era: str = Query("current", pattern="^(current|all)$"),
        from_date: str | None = None,
        to_date: str | None = None,
        preset: str = Query("last_100"),
        last_n: int | None = Query(None, ge=1, le=2000),
        warmup: int = Query(52, ge=0, le=400),
    ) -> dict[str, Any]:
        from synchro.harmo.report import envelope_report

        _work, signal = _harmo_signal(
            variable, n, era, from_date, to_date, preset, last_n, warmup
        )
        return _harmo_compute(lambda: envelope_report(signal))

    @app.get("/api/harmo/orders")
    def harmo_orders(
        variable: str = Query("sum"),
        n: int | None = Query(None, ge=1, le=50),
        era: str = Query("current", pattern="^(current|all)$"),
        from_date: str | None = None,
        to_date: str | None = None,
        preset: str = Query("last_100"),
        last_n: int | None = Query(None, ge=1, le=2000),
        warmup: int = Query(52, ge=0, le=400),
        nperseg: int | None = Query(None, ge=16, le=512),
    ) -> dict[str, Any]:
        from synchro.harmo.report import orders_report

        _work, signal = _harmo_signal(
            variable, n, era, from_date, to_date, preset, last_n, warmup
        )
        return _harmo_compute(lambda: orders_report(signal, nperseg=nperseg))

    @app.get("/api/harmo/unmix")
    def harmo_unmix(
        variable: str = Query("sum"),
        n: int | None = Query(None, ge=1, le=50),
        era: str = Query("current", pattern="^(current|all)$"),
        from_date: str | None = None,
        to_date: str | None = None,
        preset: str = Query("last_100"),
        last_n: int | None = Query(None, ge=1, le=2000),
        warmup: int = Query(52, ge=0, le=400),
        nperseg: int | None = Query(None, ge=16, le=512),
        window: str = Query("blackmanharris", pattern="^(blackmanharris|flattop|hann)$"),
    ) -> dict[str, Any]:
        from synchro.harmo.report import unmix_report

        _work, signal = _harmo_signal(
            variable, n, era, from_date, to_date, preset, last_n, warmup
        )
        return _harmo_compute(
            lambda: unmix_report(signal, nperseg=nperseg, window=window)
        )

    @app.get("/api/harmo/null")
    def harmo_null(
        variable: str = Query("sum"),
        n: int | None = Query(None, ge=1, le=50),
        era: str = Query("current", pattern="^(current|all)$"),
        from_date: str | None = None,
        to_date: str | None = None,
        preset: str = Query("last_100"),
        last_n: int | None = Query(None, ge=1, le=2000),
        warmup: int = Query(52, ge=0, le=400),
        window: str = Query("blackmanharris", pattern="^(blackmanharris|flattop|hann)$"),
        n_sim: int = Query(40, ge=8, le=200),
        seed: int = Query(0),
    ) -> dict[str, Any]:
        from synchro.harmo.report import null_report

        work, signal = _harmo_signal(
            variable, n, era, from_date, to_date, preset, last_n, warmup
        )
        return _harmo_compute(
            lambda: null_report(work, signal, window=window, n_sim=n_sim, seed=seed)
        )

    def _pulse_draws(weekday: str | None) -> tuple[list[dict[str, Any]], str]:
        from synchro.harmo.archive import bundled_draws
        from synchro.weekday import filter_draws_by_weekday, normalize_weekday_filter

        day = normalize_weekday_filter(weekday)
        if db.database_configured():
            try:
                return _analysis_draws("all", None, None, day), "neon"
            except HTTPException:
                raise
            except Exception as exc:
                raise HTTPException(503, f"Archive Neon injoignable: {exc}") from exc
        rows = filter_draws_by_weekday(bundled_draws("all"), day)
        if not rows:
            raise HTTPException(
                503,
                "Neon non configuré et archive JSON embarquée introuvable.",
            )
        return rows, "json"

    @app.get("/api/pulse/status")
    def pulse_status() -> dict[str, Any]:
        from synchro.harmo.util import json_safe
        from synchro.pulse import status_payload

        return json_safe(status_payload())

    @app.post("/api/pulse/scan")
    async def pulse_scan(request: Request) -> dict[str, Any]:
        from synchro.harmo.util import json_safe
        from synchro.pulse import scan_draws

        try:
            payload = await request.json()
        except Exception as exc:
            raise HTTPException(400, "Corps JSON illisible.") from exc
        if not isinstance(payload, dict):
            raise HTTPException(400, "Corps JSON illisible.")
        presets = payload.get("presets")
        families = payload.get("families")
        if not isinstance(presets, list) or not isinstance(families, list):
            raise HTTPException(400, "presets et families sont des listes.")
        weekday = payload.get("weekday")
        day = str(weekday) if weekday else None
        draws, source = _pulse_draws(day)
        try:
            body = scan_draws(
                draws,
                presets=[str(item) for item in presets],
                families=[str(item) for item in families],
                weekday=day,
            )
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        body["archive_source"] = source
        return json_safe(body)

    @app.get("/api/pulse/detail")
    def pulse_detail(
        kind: str = Query("ball", pattern="^(ball|star)$"),
        n: int = Query(1, ge=1, le=50),
        preset: str = Query("last_100"),
        slice_id: str = Query(..., alias="slice"),
        families: str = Query("simple,double"),
        weekday: str | None = None,
    ) -> dict[str, Any]:
        from synchro.harmo.util import json_safe
        from synchro.pulse import detail_series

        draws, source = _pulse_draws(weekday)
        try:
            resolved = resolve_window(draws, preset=preset, warmup=0, weekday=weekday)
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        work = list(resolved["work"])
        if not work:
            raise HTTPException(404, "Aucun tirage dans la fenêtre.")
        names = [item.strip() for item in families.split(",") if item.strip()]
        try:
            body = detail_series(
                work,
                kind=kind,
                n=n,
                preset=preset,
                families=names,
                slice_id=slice_id,
            )
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        body["archive_source"] = source
        return json_safe(body)

    def _cycles_draws(
        era: str,
        from_date: str | None,
        to_date: str | None,
        preset: str,
        last_n: int | None,
        warmup: int,
    ) -> tuple[list[dict[str, Any]], dict[str, Any], str]:
        archive, source = _harmo_archive(era)
        try:
            resolved = resolve_window(
                archive,
                preset=preset,
                from_date=from_date,
                to_date=to_date,
                last_n=last_n,
                warmup=warmup,
            )
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        context = list(resolved["with_warmup"])
        if not context:
            raise HTTPException(404, "Aucun tirage dans la fenêtre.")
        return context, resolved, source

    @app.get("/api/cycles/status")
    def cycles_status() -> dict[str, Any]:
        from synchro.cycles import status

        return status()

    @app.get("/api/cycles/registry")
    def cycles_registry(
        variable: str = Query("sum"),
        n: int | None = Query(None, ge=1, le=50),
        era: str = Query("current", pattern="^(current|all)$"),
        from_date: str | None = None,
        to_date: str | None = None,
        preset: str = Query("last_100"),
        last_n: int | None = Query(None, ge=1, le=2000),
        warmup: int = Query(52, ge=0, le=400),
    ) -> dict[str, Any]:
        from synchro.cycles.panel import build_panel, registry_payload
        from synchro.harmo.util import json_safe

        if variable not in VARIABLE_NAMES:
            raise HTTPException(400, f"Variable inconnue: {variable}")
        draws, resolved, source = _cycles_draws(
            era, from_date, to_date, preset, last_n, warmup
        )
        try:
            panel = build_panel(draws, variable=variable, n=n, warmup=int(resolved["warmup_count"]))
        except (ValueError, TypeError, KeyError) as exc:
            raise HTTPException(400, str(exc)) from exc
        payload = registry_payload(panel)
        payload["archive_source"] = source
        payload["from_date"] = resolved["from_date"]
        payload["to_date"] = resolved["to_date"]
        return json_safe(payload)

    @app.get("/api/cycles/panel")
    def cycles_panel(
        variable: str = Query("sum"),
        n: int | None = Query(None, ge=1, le=50),
        era: str = Query("current", pattern="^(current|all)$"),
        from_date: str | None = None,
        to_date: str | None = None,
        preset: str = Query("last_100"),
        last_n: int | None = Query(None, ge=1, le=2000),
        warmup: int = Query(52, ge=0, le=400),
    ) -> dict[str, Any]:
        from synchro.cycles.panel import build_panel, panel_payload
        from synchro.harmo.util import json_safe

        if variable not in VARIABLE_NAMES:
            raise HTTPException(400, f"Variable inconnue: {variable}")
        draws, resolved, source = _cycles_draws(
            era, from_date, to_date, preset, last_n, warmup
        )
        try:
            panel = build_panel(draws, variable=variable, n=n, warmup=int(resolved["warmup_count"]))
        except (ValueError, TypeError, KeyError) as exc:
            raise HTTPException(400, str(exc)) from exc
        payload = panel_payload(panel)
        payload["archive_source"] = source
        return json_safe(payload)

    @app.post("/api/cycles/fit")
    def cycles_fit(
        variable: str = Query("sum"),
        n: int | None = Query(None, ge=1, le=50),
        era: str = Query("current", pattern="^(current|all)$"),
        from_date: str | None = None,
        to_date: str | None = None,
        preset: str = Query("last_100"),
        last_n: int | None = Query(None, ge=1, le=2000),
        warmup: int = Query(52, ge=0, le=400),
        encoder: int = Query(32, ge=8, le=120),
        horizon: int = Query(4, ge=1, le=12),
        hidden: int = Query(32, ge=8, le=64),
        epochs: int = Query(12, ge=1, le=40),
        seed: int = Query(0),
    ) -> dict[str, Any]:
        from synchro.cycles.interpret import fit_cycles
        from synchro.harmo.util import json_safe

        if variable not in VARIABLE_NAMES:
            raise HTTPException(400, f"Variable inconnue: {variable}")
        draws, resolved, source = _cycles_draws(
            era, from_date, to_date, preset, last_n, warmup
        )
        try:
            payload = fit_cycles(
                draws,
                variable=variable,
                n=n,
                warmup=int(resolved["warmup_count"]),
                encoder=encoder,
                horizon=horizon,
                hidden=hidden,
                epochs=epochs,
                seed=seed,
            )
        except (ValueError, TypeError, KeyError) as exc:
            raise HTTPException(400, str(exc)) from exc
        payload["archive_source"] = source
        return json_safe(payload)

    @app.get("/api/ref/catalog")
    def ref_catalog() -> dict[str, Any]:
        from synchro.ref.cycles import catalog

        return catalog()

    @app.get("/api/ref/lunar")
    def ref_lunar(date_value: str | None = Query(None, alias="date")) -> dict[str, Any]:
        from synchro.ref.cycles import lunar_report

        try:
            return lunar_report(date_value)
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc

    @app.get("/api/ref/solar")
    def ref_solar(date_value: str | None = Query(None, alias="date")) -> dict[str, Any]:
        from synchro.ref.cycles import solar_report

        try:
            return solar_report(date_value)
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc

    @app.get("/api/ref/solar/goes")
    def ref_solar_goes(
        start: str = Query(..., min_length=10, max_length=10),
        end: str = Query(..., min_length=10, max_length=10),
        kind: str = Query("xrs", pattern="^(xrs|flares)$"),
        limit: int = Query(12, ge=1, le=40),
    ) -> dict[str, Any]:
        from synchro.ref.solar_net import goes_search

        try:
            return goes_search(start, end, kind=kind, limit=limit)
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        except RuntimeError as exc:
            raise HTTPException(503, str(exc)) from exc
        except Exception as exc:
            raise HTTPException(502, f"Fido injoignable : {exc}") from exc

    def _ref_archive(era: str) -> list[dict[str, Any]]:
        rows, _source = _harmo_archive(era)
        return rows

    @app.get("/api/ref/phases")
    def ref_phases() -> dict[str, Any]:
        from synchro.ref.phases import phase_catalog

        return phase_catalog()

    @app.get("/api/ref/trace")
    def ref_trace(
        cycle: str = Query("lunaire"),
        window: int = Query(50),
        era: str = Query("current", pattern="^(current|all)$"),
    ) -> dict[str, Any]:
        from synchro.ref.plane import trace

        try:
            return trace(_ref_archive(era), cycle, window)
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc

    @app.get("/api/ref/plane")
    def ref_plane(
        x: str = Query("lunaire"),
        y: str = Query("carrington"),
        window: int = Query(50),
        era: str = Query("current", pattern="^(current|all)$"),
    ) -> dict[str, Any]:
        from synchro.ref.plane import plane

        try:
            return plane(_ref_archive(era), x, y, window)
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc

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
        try:
            validate_grid(payload.numbers, payload.stars)
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        row = db.insert_grid(
            payload.label,
            sorted(payload.numbers),
            sorted(payload.stars),
        )
        return _json(db.serialize_row(row))

    @app.patch("/api/grids/{grid_id}")
    def rename_grid(grid_id: int, payload: GridLabelIn) -> dict[str, Any]:
        row = db.update_grid_label(grid_id, payload.label)
        if not row:
            raise HTTPException(404, "Grille introuvable")
        return _json(db.serialize_row(row))

    @app.delete("/api/grids/{grid_id}")
    def remove_grid(grid_id: int) -> dict[str, bool]:
        if not db.delete_grid(grid_id):
            raise HTTPException(404, "Grille introuvable")
        return {"ok": True}

    def _decorate_plays(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        dates = []
        for row in rows:
            try:
                dates.append(parse_play_date(row.get("play_date")))
            except ValueError:
                continue
        draws = db.draws_by_dates(dates)
        out = []
        for row in rows:
            payload = db.serialize_row(row)
            day = None
            try:
                day = parse_play_date(row.get("play_date"))
            except ValueError:
                pass
            draw = draws.get(day) if day else None
            out.append(decorate_play(payload, draw))
        return out

    def _play_items_from_payload(payload: PlayIn) -> list[PlayItemIn]:
        if payload.items:
            return payload.items
        if payload.numbers is None or payload.stars is None:
            raise HTTPException(400, "Il faut 5 numéros et 2 étoiles.")
        return [
            PlayItemIn(
                label=payload.label,
                numbers=payload.numbers,
                stars=payload.stars,
                copies=payload.copies,
                note=payload.note,
                source=payload.source,
                grid_id=payload.grid_id,
                spec=payload.spec,
            )
        ]

    def _rows_from_items(play_date: date, items: list[PlayItemIn]) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        for item in items:
            try:
                numbers, stars = validate_play_grid(item.numbers, item.stars)
            except ValueError as exc:
                raise HTTPException(400, str(exc)) from exc
            rows.append(
                {
                    "label": item.label.strip() or "Grille",
                    "numbers": numbers,
                    "stars": stars,
                    "play_date": play_date,
                    "source": normalize_source(item.source),
                    "note": (item.note or "").strip() or None,
                    "copies": normalize_copies(item.copies),
                    "grid_id": item.grid_id,
                    "spec": normalize_play_spec(item.spec),
                }
            )
        return rows

    @app.get("/api/plays")
    def plays() -> dict[str, Any]:
        try:
            rows = db.list_plays()
            items = _decorate_plays(rows)
        except Exception as exc:
            raise HTTPException(503, str(exc)) from exc
        return {
            "items": [_json(item) for item in items],
            "stats": summarize_plays(items),
            "next_play_date": next_play_date().isoformat(),
        }

    @app.post("/api/plays")
    def create_plays(payload: PlayIn) -> dict[str, Any]:
        try:
            play_date = parse_play_date(payload.play_date)
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        rows = _rows_from_items(play_date, _play_items_from_payload(payload))
        try:
            stored = db.insert_plays(rows)
            items = _decorate_plays(stored)
        except Exception as exc:
            raise HTTPException(503, str(exc)) from exc
        return {
            "ok": True,
            "items": [_json(item) for item in items],
            "item": _json(items[0]) if items else None,
            "next_play_date": next_play_date().isoformat(),
        }

    @app.patch("/api/plays/{play_id}")
    def patch_play(play_id: int, payload: PlayPatch) -> dict[str, Any]:
        fields: dict[str, Any] = {}
        if payload.label is not None:
            fields["label"] = payload.label.strip() or "Grille"
        if payload.note is not None:
            fields["note"] = payload.note.strip() or None
        if payload.source is not None:
            fields["source"] = normalize_source(payload.source)
        if payload.copies is not None:
            fields["copies"] = normalize_copies(payload.copies)
        if payload.play_date is not None:
            try:
                fields["play_date"] = parse_play_date(payload.play_date)
            except ValueError as exc:
                raise HTTPException(400, str(exc)) from exc
        if payload.numbers is not None or payload.stars is not None:
            current = db.get_play(play_id)
            if not current:
                raise HTTPException(404, "Grille jouée introuvable")
            numbers = payload.numbers if payload.numbers is not None else list(current["numbers"])
            stars = payload.stars if payload.stars is not None else list(current["stars"])
            try:
                numbers, stars = validate_play_grid(numbers, stars)
            except ValueError as exc:
                raise HTTPException(400, str(exc)) from exc
            fields["numbers"] = numbers
            fields["stars"] = stars
        try:
            row = db.update_play(play_id, fields)
        except Exception as exc:
            raise HTTPException(503, str(exc)) from exc
        if not row:
            raise HTTPException(404, "Grille jouée introuvable")
        item = _decorate_plays([row])[0]
        return _json(item)

    @app.delete("/api/plays/{play_id}")
    def remove_play(play_id: int) -> dict[str, bool]:
        if not db.delete_play(play_id):
            raise HTTPException(404, "Grille jouée introuvable")
        return {"ok": True}

    @app.get("/api/brain/lexicon/cards")
    def lexicon_cards() -> dict[str, Any]:
        from synchro.lexicon.store import LexiconStore

        cards = LexiconStore().load_cards()
        return {"ok": True, "cards": cards}

    @app.post("/api/brain/lexicon/cards")
    def lexicon_save_card(payload: LexiconCardIn) -> dict[str, Any]:
        from synchro.lexicon.store import LexiconStore

        card = LexiconStore().update_card(payload.id, payload.model_dump(exclude={"id"}))
        if card is None:
            raise HTTPException(404, "Fiche introuvable")
        return {"ok": True, "card": card}

    @app.get("/api/brain/lexicon/mode")
    def lexicon_mode() -> dict[str, Any]:
        from synchro.lexicon.store import LexiconStore

        return {"ok": True, **LexiconStore().load_mode()}

    @app.post("/api/brain/lexicon/mode")
    def lexicon_set_mode(payload: LexiconModeIn) -> dict[str, Any]:
        from synchro.lexicon.store import LexiconStore

        return {"ok": True, **LexiconStore().save_mode(payload.automatic)}

    @app.get("/api/brain/lexicon/readings")
    def lexicon_readings() -> dict[str, Any]:
        from synchro.lexicon.store import LexiconStore

        rows = LexiconStore().load_readings()
        return {"ok": True, "readings": rows[-8:]}

    @app.post("/api/brain/lexicon/read")
    def lexicon_read(payload: LexiconReadIn) -> dict[str, Any]:
        from synchro.lexicon.service import load_draws_for_read, prepare_reading, specialist_rows

        try:
            draws = load_draws_for_read(era=payload.era)
        except Exception as exc:
            raise HTTPException(503, f"Archive illisible: {exc}") from exc
        reading = prepare_reading(
            draws,
            weekday=payload.weekday,
            specialists=specialist_rows(),
        )
        return {"ok": True, "reading": reading}

    @app.post("/api/brain/lexicon/help")
    def lexicon_help(payload: LexiconHelpIn) -> dict[str, Any]:
        from synchro.lexicon.service import answer_help
        from synchro.lexicon.store import LexiconStore

        store = LexiconStore()
        rows = store.load_readings()
        reading = None
        if payload.reading_id:
            reading = next((row for row in rows if row.get("id") == payload.reading_id), None)
        elif rows:
            reading = rows[-1]
        if reading is None:
            raise HTTPException(404, "Aucune demande à relire")
        result = answer_help(
            reading,
            escalate=payload.escalate,
            cloud_note=payload.cloud_note,
            store=store,
        )
        if result.get("note"):
            reading = {**reading, "cloud_note": result["note"]}
            store.save_reading(reading)
        return result

    @app.get("/api/brain/status")
    def brain_status() -> dict[str, Any]:
        from synchro import brain as brain_mod

        return {"ok": True, "ollama": brain_mod.ping_ollama()}

    @app.get("/api/llm/usage")
    def llm_usage() -> dict[str, Any]:
        from synchro.llm_usage import dashboard

        return dashboard()

    @app.post("/api/llm/usage")
    def create_llm_usage(payload: LlmUsageIn) -> dict[str, Any]:
        from synchro.llm_usage import record_usage

        return record_usage(payload.model_dump())

    @app.post("/api/llm/ping")
    def llm_ping() -> dict[str, Any]:
        from synchro.llm_usage import ping_generate

        return ping_generate()

    @app.get("/api/brain/readings")
    def brain_readings(
        handle: str | None = None,
        lab: str | None = None,
        limit: int = Query(80, ge=1, le=200),
    ) -> dict[str, Any]:
        try:
            items = db.list_brain_readings(handle=handle, lab=lab, limit=limit)
        except Exception as exc:
            raise HTTPException(503, str(exc)) from exc
        return {"items": [_json(db.serialize_row(item, drop=())) for item in items]}

    @app.post("/api/brain/readings")
    def create_brain_reading(payload: BrainReadingIn) -> dict[str, Any]:
        from synchro import brain as brain_mod

        body = payload.model_dump()
        if payload.cloud_embed:
            raise HTTPException(400, "Pas d'embedding cloud automatique. Décoche cloud.")
        if payload.embed:
            packed = brain_mod.pack_embed_text(payload.payload, [payload.comment or ""])
            embedded = brain_mod.embed_text(packed)
            if embedded.get("ok"):
                body["embedding"] = embedded["embedding"]
                body["embedding_model"] = embedded["model"]
        try:
            row = db.insert_brain_reading(body)
        except Exception as exc:
            raise HTTPException(503, str(exc)) from exc
        return _json(db.serialize_row(row, drop=()))

    @app.post("/api/brain/readings/{reading_id}/notes")
    def create_brain_note(reading_id: int, payload: BrainNoteIn) -> dict[str, Any]:
        body = payload.body.strip()
        if not body:
            raise HTTPException(400, "Note vide")
        author = payload.author if payload.author in {"user", "brain"} else "user"
        try:
            row = db.insert_brain_note(reading_id, author, body)
        except KeyError as exc:
            raise HTTPException(404, "Lecture introuvable") from exc
        except Exception as exc:
            raise HTTPException(503, str(exc)) from exc
        return _json(db.serialize_row(row, drop=()))

    @app.post("/api/brain/retrieve")
    def brain_retrieve(payload: BrainRetrieveIn) -> dict[str, Any]:
        from synchro import brain as brain_mod

        if payload.cloud:
            raise HTTPException(400, "Retrieve cloud refusé : passe par l'embed local.")
        model = payload.model or brain_mod.DEFAULT_EMBED_MODEL
        embedded = brain_mod.embed_text(payload.text, model=model)
        if not embedded.get("ok"):
            return {"ok": False, "items": [], "error": embedded.get("error") or "embed local indisponible"}
        try:
            rows = db.readings_with_embeddings(model=embedded.get("model"))
        except Exception as exc:
            raise HTTPException(503, str(exc)) from exc
        items = brain_mod.retrieve(embedded["embedding"], rows, k=payload.k)
        return {"ok": True, "model": embedded["model"], "items": [_json(db.serialize_row(item, drop=())) for item in items]}

    @app.post("/api/brain/analogs")
    def brain_analogs(payload: BrainAnalogsIn) -> dict[str, Any]:
        draws, source = _specialist_draws(payload.era)
        start = date.fromisoformat(payload.from_date[:10]) if payload.from_date else None
        end = date.fromisoformat(payload.to_date[:10]) if payload.to_date else None
        if start or end:
            filtered: list[dict[str, Any]] = []
            for draw in draws:
                raw = draw.get("draw_date") or draw.get("date")
                if raw is None:
                    continue
                day = as_date(raw)
                if start and day < start:
                    continue
                if end and day > end:
                    continue
                filtered.append(draw)
            draws = filtered
        report = analogs_report(
            draws,
            query_date=payload.date,
            numbers=payload.numbers,
            stars=payload.stars,
            axes=payload.axes,
            k=payload.k,
        )
        report["source"] = source
        return _json(report)

    def _specialist_draws(era: str = "current") -> tuple[list[dict[str, Any]], str]:
        from synchro.weekday import filter_draws_by_weekday, request_weekday

        source = "json"
        rows: list[dict[str, Any]] = []
        if db.database_configured():
            try:
                rows = db.all_draws(era=era if era in {"current", "all"} else "current")
                if rows:
                    source = "neon"
            except Exception:
                rows = []
        if not rows:
            snapshot = ROOT / "src" / "data" / "euromillions-2026.json"
            if snapshot.exists():
                import json as _jsonlib

                rows = _jsonlib.loads(snapshot.read_text(encoding="utf-8"))
                source = "json"
        if not rows:
            raise HTTPException(503, "Aucun tirage : Neon indisponible et snapshot JSON absent.")
        return filter_draws_by_weekday(rows, request_weekday()), source

    def _sync_specialist_row(record: dict[str, Any]) -> None:
        if not record.get("saved"):
            return
        if not db.database_configured():
            return
        try:
            db.upsert_brain_specialist(
                {
                    "slug": record["slug"],
                    "name": record["name"],
                    "handle": record["handle"],
                    "target": record["target"],
                    "task": record["task"],
                    "horizon": record["horizon"],
                    "indicators": record["indicators"],
                    "instructions": record["instructions"],
                    "config": {
                        "hidden": record.get("hidden"),
                        "epochs": record.get("epochs"),
                        "seed": record.get("seed"),
                        "abstain": record.get("abstain"),
                        "n": record.get("n"),
                    },
                    "report": {
                        "windows": record.get("windows"),
                        "skill": record.get("skill"),
                        "verdict": record.get("verdict"),
                    },
                    "last_forecast": record.get("last_forecast"),
                }
            )
        except Exception:
            return

    @app.get("/api/brain/run-arcade/champions")
    def run_arcade_champions(
        page: int = Query(1, ge=1),
        limit: int | None = Query(None, ge=1, le=50),
    ) -> dict[str, Any]:
        """Pages de vingt, cinquante au plus, les plus récents d'abord.

        `limit` reste pour un appel qui demande un nombre précis (l'import en relit cinquante).
        Sans `limit`, `page` découpe : 1 → les vingt premiers, 2 → les vingt suivants, 3 → les dix qui restent.
        """
        from synchro.run_arcade import champion_from_row

        if not db.database_configured():
            raise HTTPException(503, "Neon non configuré")
        if limit is None:
            offset = (page - 1) * db.RUN_ARCADE_CHAMPION_PAGE
            room = db.RUN_ARCADE_CHAMPION_CEILING - offset
            size = min(db.RUN_ARCADE_CHAMPION_PAGE, room) if room > 0 else 0
        else:
            offset = 0
            size = limit
        try:
            rows = db.list_run_arcade_champions(size, offset) if size else []
        except Exception as exc:
            raise HTTPException(503, str(exc)) from exc
        return {"ok": True, "items": [_json(champion_from_row(row)) for row in rows]}

    @app.get("/api/brain/run-arcade/champion")
    def run_arcade_champion() -> dict[str, Any]:
        from synchro.run_arcade import champion_from_row

        if not db.database_configured():
            raise HTTPException(503, "Neon non configuré")
        try:
            row = db.latest_run_arcade_champion()
        except Exception as exc:
            raise HTTPException(503, str(exc)) from exc
        return {"ok": True, "champion": _json(champion_from_row(row)) if row else None}

    @app.post("/api/brain/run-arcade/champion")
    def create_run_arcade_champion(payload: RunArcadeChampionIn) -> dict[str, Any]:
        from synchro.run_arcade import normalize_champion

        if not db.database_configured():
            raise HTTPException(503, "Neon non configuré")
        try:
            record = normalize_champion(payload.model_dump())
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        try:
            row = db.insert_run_arcade_champion(record)
        except Exception as exc:
            raise HTTPException(503, str(exc)) from exc
        written: dict[str, Any] = {"ok": True, "source": "neon", "id": row["id"], "versions": row["versions"]}
        if row.get("duplicate"):
            written["duplicate"] = True
        return written

    @app.get("/api/brain/specialists/features")
    def brain_specialist_features() -> dict[str, Any]:
        from synchro.brain_specialists.features import FEATURES, FEATURE_IDS

        return {
            "ok": True,
            "items": [
                {"id": name, **FEATURES[name]}
                for name in FEATURE_IDS
            ],
        }

    @app.get("/api/brain/specialists")
    def brain_specialists() -> dict[str, Any]:
        from synchro.brain_specialists import list_specialists

        return {"ok": True, "items": list_specialists()}

    @app.post("/api/brain/specialists")
    def create_brain_specialist(payload: BrainSpecialistIn) -> dict[str, Any]:
        from synchro.brain_specialists import train_specialist

        draws, source = _specialist_draws(payload.era)
        try:
            record = train_specialist(
                draws,
                name=payload.name,
                target=payload.target,
                indicators=payload.indicators,
                instructions=payload.instructions,
                task=payload.task,
                horizon=payload.horizon,
                n=payload.n,
                hidden=payload.hidden,
                epochs=payload.epochs,
                seed=payload.seed,
                force=payload.force,
                abstain=payload.abstain,
                origin=payload.origin,
            )
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        record["source"] = source
        _sync_specialist_row(record)
        return _json(record)

    @app.get("/api/brain/specialists/{slug}")
    def brain_specialist(slug: str) -> dict[str, Any]:
        from synchro.brain_specialists import load_specialist

        try:
            packed = load_specialist(slug)
        except FileNotFoundError as exc:
            raise HTTPException(404, "Spécialiste introuvable") from exc
        config = packed["config"]
        report = packed["report"]
        return _json(
            {
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
                "verdict": report.get("verdict"),
                "last_forecast": report.get("last_forecast"),
                "disclaimer": config.get("disclaimer"),
            }
        )

    @app.post("/api/brain/specialists/{slug}/infer")
    def infer_brain_specialist(slug: str, era: str = Query("current", pattern="^(current|all)$")) -> dict[str, Any]:
        from synchro.brain_specialists import infer_specialist

        draws, source = _specialist_draws(era)
        try:
            payload = infer_specialist(draws, slug)
        except FileNotFoundError as exc:
            raise HTTPException(404, "Spécialiste introuvable") from exc
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        payload["source"] = source
        return _json(payload)

    @app.delete("/api/brain/specialists/{slug}")
    def remove_brain_specialist(slug: str) -> dict[str, Any]:
        from synchro.brain_specialists import delete_specialist

        deleted = delete_specialist(slug)
        if db.database_configured():
            try:
                db.delete_brain_specialist(slug)
            except Exception:
                pass
        if not deleted:
            raise HTTPException(404, "Spécialiste introuvable")
        return {"ok": True, "slug": slug}

    def _decision_draws(era: str) -> tuple[list[dict[str, Any]], str, str | None]:
        from synchro.brain_specialists.train import normalize_draws
        from synchro.weekday import request_weekday

        draws, source = _specialist_draws(era)
        # Le snapshot JSON porte `date`, Neon porte `draw_date`. Le tableau
        # exige `draw_date`.
        return normalize_draws(draws), source, request_weekday()

    def _decision_tree_unavailable(exc: ImportError) -> HTTPException:
        return HTTPException(
            503,
            "scikit-learn absent. Relance ./launch (installation automatique) "
            "ou ./launch install-decision-tree.",
        )

    @app.get("/api/brain/decision-tree/status")
    def decision_tree_status() -> dict[str, Any]:
        import shutil

        sklearn_ok = True
        dtreeviz_ok = True
        try:
            import sklearn  # noqa: F401
        except ImportError:
            sklearn_ok = False
        try:
            import dtreeviz  # noqa: F401
        except ImportError:
            dtreeviz_ok = False
        return {
            "ok": True,
            "sklearn": sklearn_ok,
            "dtreeviz": dtreeviz_ok,
            "dot": shutil.which("dot") is not None,
        }

    @app.get("/api/brain/decision-tree/catalog")
    def decision_tree_catalog() -> dict[str, Any]:
        from synchro.decision_tree.questions import catalog

        return {"ok": True, **catalog()}

    @app.post("/api/brain/decision-tree/tableau")
    def decision_tree_table(payload: DecisionTreeIn) -> dict[str, Any]:
        """Image du tableau que la question fabrique, avant toute coupure."""
        from synchro.decision_tree.questions import question_picture

        if payload.question not in {"shape", "series", "balls", "chartisme"}:
            raise HTTPException(400, "Question inconnue.")
        draws, source, weekday = _decision_draws(payload.era)
        if payload.label_cut not in {"learned", "fixed"}:
            raise HTTPException(400, "Coupe inconnue.")
        if payload.windows not in {"learned", "fixed"}:
            raise HTTPException(400, "Fenêtres inconnues.")
        if payload.indicators:
            from synchro.decision_tree.measures import validate_measures

            try:
                validate_measures(payload.indicators)
            except ValueError as exc:
                raise HTTPException(400, str(exc)) from exc
        try:
            view = dict(
                question_picture(
                    draws,
                    payload.question,
                    label=payload.label,
                    series=payload.series,
                    include_stars=payload.era != "all",
                    curves=payload.curves,
                    measures=payload.indicators,
                    label_cut=payload.label_cut,
                    windows=payload.windows,
                )
            )
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        view["ok"] = True
        view["source"] = source
        view["era"] = payload.era if payload.era in {"current", "all"} else "current"
        view["weekday"] = weekday
        view["draw_count"] = len(draws)
        return _json(view)

    @app.get("/api/brain/decision-tree")
    def decision_tree_list() -> dict[str, Any]:
        try:
            from synchro.decision_tree import list_readings
        except ImportError as exc:
            raise _decision_tree_unavailable(exc) from exc

        return {"ok": True, "items": list_readings()}

    @app.post("/api/brain/decision-tree")
    def decision_tree_start(payload: DecisionTreeIn) -> dict[str, Any]:
        from synchro.decision_tree import start_job
        from synchro.decision_tree.jobs import BusyReading

        if payload.question not in {"shape", "series", "balls", "chartisme"}:
            raise HTTPException(400, "Question inconnue.")
        if payload.label_cut not in {"learned", "fixed"}:
            raise HTTPException(400, "Coupe inconnue.")
        if payload.windows not in {"learned", "fixed"}:
            raise HTTPException(400, "Fenêtres inconnues.")
        if payload.indicators:
            from synchro.decision_tree.measures import validate_measures

            try:
                validate_measures(payload.indicators)
            except ValueError as exc:
                raise HTTPException(400, str(exc)) from exc
        draws, source, weekday = _decision_draws(payload.era)
        try:
            job = start_job(
                draws,
                question=payload.question,
                label=payload.label,
                series=payload.series,
                include_stars=payload.era != "all",
                curves=payload.curves,
                indicators=payload.indicators,
                label_cut=payload.label_cut,
                windows=payload.windows,
                max_depth=payload.max_depth,
                criterion=payload.criterion,
                permutations=payload.permutations,
                seed=payload.seed,
                era=payload.era if payload.era in {"current", "all"} else "current",
                weekday=weekday,
            )
        except ImportError as exc:
            raise _decision_tree_unavailable(exc) from exc
        except BusyReading as exc:
            raise HTTPException(409, str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        job["source"] = source
        return _json(job)

    @app.get("/api/brain/decision-tree/jobs/{job_id}")
    def decision_tree_job(job_id: str) -> dict[str, Any]:
        from synchro.decision_tree import job_status

        job = job_status(job_id)
        if job is None:
            raise HTTPException(404, "Lecture introuvable")
        return _json(job)

    @app.delete("/api/brain/decision-tree/jobs/{job_id}")
    def decision_tree_cancel(job_id: str) -> dict[str, Any]:
        from synchro.decision_tree import cancel_job, job_status

        if job_status(job_id) is None:
            raise HTTPException(404, "Lecture introuvable")
        cancel_job(job_id)
        return {"ok": True, "id": job_id, "status": "cancelled"}

    def _decision_tree_picture(slug: str, name: str) -> dict[str, Any]:
        try:
            from synchro.decision_tree import load_reading
        except ImportError as exc:
            raise _decision_tree_unavailable(exc) from exc
        try:
            report = load_reading(slug)
        except FileNotFoundError as exc:
            raise HTTPException(404, "Lecture introuvable") from exc
        return {
            "ok": True,
            "slug": slug,
            "engine": report.get("drawing"),
            "svg": report.get(name),
            "text": report.get("tree_text"),
        }

    @app.get("/api/brain/decision-tree/{slug}/tree.svg")
    def decision_tree_tree_svg(slug: str) -> dict[str, Any]:
        return _json(_decision_tree_picture(slug, "tree_svg"))

    @app.get("/api/brain/decision-tree/{slug}/case.svg")
    def decision_tree_case_svg(slug: str) -> dict[str, Any]:
        return _json(_decision_tree_picture(slug, "case_svg"))

    @app.get("/api/brain/decision-tree/{slug}")
    def decision_tree_get(slug: str) -> dict[str, Any]:
        from synchro.brain_specialists import list_specialists

        try:
            from synchro.decision_tree import load_reading
        except ImportError as exc:
            raise _decision_tree_unavailable(exc) from exc
        try:
            report = load_reading(slug)
        except FileNotFoundError as exc:
            raise HTTPException(404, "Lecture introuvable") from exc
        try:
            produced = [
                item for item in list_specialists() if item.get("origin") == report.get("slug")
            ]
        except Exception:
            produced = []
        report["specialists"] = [
            {"slug": item["slug"], "name": item["name"], "handle": item["handle"]}
            for item in produced
        ]
        return _json(report)

    @app.post("/api/brain/decision-tree/{slug}/predict")
    def decision_tree_predict(slug: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        try:
            from synchro.decision_tree import load_reading, predict_latest
        except ImportError as exc:
            raise _decision_tree_unavailable(exc) from exc

        try:
            report = load_reading(slug, with_svg=False)
        except FileNotFoundError as exc:
            raise HTTPException(404, "Lecture introuvable") from exc
        row = None
        if isinstance(payload, dict) and isinstance(payload.get("x"), list):
            row = payload["x"]
        try:
            return _json(predict_latest(report, row))
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc

    @app.post("/api/brain/decision-tree/{slug}/draft")
    def decision_tree_draft(slug: str) -> dict[str, Any]:
        try:
            from synchro.decision_tree import load_reading
        except ImportError as exc:
            raise _decision_tree_unavailable(exc) from exc

        try:
            report = load_reading(slug, with_svg=False)
        except FileNotFoundError as exc:
            raise HTTPException(404, "Lecture introuvable") from exc
        return _json(
            {
                "ok": True,
                "drafts": report.get("drafts") or [],
                "chartisme_rules": report.get("chartisme_rules") or [],
                "ball_scores": report.get("ball_scores") or [],
            }
        )

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
            "sense": chartisme_name_sense(values, payload.reference_sigma),
            "segments": chartisme_sense_segments(
                values, payload.reference_sigma, payload.reference_slope_sigma
            ),
        }
        if payload.models:
            out["models"] = chartisme_annotate(hits, values, activity=payload.activity)
        return out

    @app.post("/api/chartisme/similar")
    def chartisme_similar(payload: ChartismeSketchIn) -> dict[str, Any]:
        from synchro.weekday import filter_draws_by_weekday, normalize_weekday_filter, request_weekday

        values = list(payload.values or [])
        if payload.points and not values:
            values = chartisme_sketch_to_values(payload.points)
        if len(values) < 8:
            raise HTTPException(400, "Croquis trop court")
        # Le cache disque est l’archive mixte. Un jour isolé réexporte les
        # courbes sur ce jour seul : une coupe par dates mêlerait l’autre jour.
        day = request_weekday() or normalize_weekday_filter(payload.weekday)
        if day:
            bundle = chartisme_export_curves(
                filter_draws_by_weekday(_analysis_draws(payload.era), day)
            )
        else:
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
            "weekday": day,
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
        # Longueur des fenêtres de bruit du taux de base : celle de l'échelle que
        # l'onglet balaie, sans quoi la comparaison porte sur autre chose.
        base_length: int = Query(60, ge=16, le=400),
        # Fenêtre d'étude. Le premier tirage archivé n'a aucune raison d'ouvrir
        # un cycle : mesurer sur toute l'archive suppose que vingt ans se lisent
        # d'un bloc. Bornée, la mesure perd de la puissance — le rapport dit
        # laquelle plutôt que de l'acheter en élargissant la fenêtre.
        start: str | None = None,
        end: str | None = None,
        context: int = Query(0, ge=0, le=400),
        # Les échelles réellement affichées : sans elles le rétro-test mesurerait
        # d'autres figures que celles qu'on a sous les yeux.
        scales: str | None = None,
        # Le seuil de chaque échelle, dans l'ordre de `scales`. L'onglet lu en
        # rareté visée n'a plus un seuil mais un par échelle, cherché sur la
        # courbe affichée ; `min_confidence` reste le seuil des échelles que
        # cette liste ne couvre pas.
        thresholds: str | None = None,
        numbers: bool = True,
    ) -> dict[str, Any]:
        from synchro.weekday import request_weekday

        # Le cache disque est l’archive mixte. Un jour isolé doit réexporter
        # les courbes sur ce jour seul : une coupe par dates mêlerait l’autre jour.
        if request_weekday():
            bundle = chartisme_export_curves(_analysis_draws(era))
        else:
            bundle = _chartisme_bundle(era)
        curves = bundle.get("curves") or []
        if curve:
            curves = [c for c in curves if c.get("id") == curve]
        wanted = _parse_scales(scales)
        by_scale = _parse_thresholds(thresholds, wanted)
        # Le taux de base se mesure à la longueur de la plus longue échelle : il
        # se mesure donc aussi à son seuil, sinon le rapport comparerait une
        # fréquence de bruit à une sélection qu'elle n'a pas subie.
        base_bar = by_scale.get(base_length, min_confidence)
        chosen = [
            chartisme_slice_curve(found, start=start, end=end, context=context)
            for found in curves[:max_curves]
        ]
        hits: list[dict[str, Any]] = []
        for found in chosen:
            inside = int(found.get("context_count") or 0)
            hits.extend(
                hit
                for hit in chartisme_scan_curve(
                    found,
                    scales=wanted,
                    min_confidence=min_confidence,
                    min_confidence_by_scale=by_scale,
                )
                if chartisme_live_in_window(hit, inside)
            )
        studied = [c for c in chosen if c.get("draw_count")]
        # Le taux de base remanie de vrais tirages : il en faut, même quand le
        # signal sur les numéros n'est pas demandé. Bornés à droite par la
        # fenêtre — sur une fenêtre qui s'arrête en 2020, le bruit de 2026 ne dit
        # rien de ce qu'on a sous les yeux.
        pool = _analysis_draws(era)
        if end:
            pool = [d for d in pool if str(d["draw_date"]) <= end]
        return {
            "ok": True,
            "window": {
                "from": min((str(c["from_date"]) for c in studied), default=None),
                "to": max((str(c["to_date"]) for c in studied), default=None),
                "draw_count": max((int(c["draw_count"]) for c in studied), default=0),
                "context": max((int(c["context_count"]) for c in studied), default=0),
                "scales": list(wanted) if wanted else list(CHARTISME_DEFAULT_SCALES),
                "bounded": bool(start or end),
            },
            **chartisme_backtest_run(
                {str(c.get("id")): c for c in chosen},
                hits,
                draws=pool,
                follow=follow,
                base_rate_trials=120,
                base_length=base_length,
                min_confidence=base_bar,
                numbers=numbers,
            ),
        }

    @app.get("/api/chartisme/training")
    def chartisme_training() -> dict[str, Any]:
        return {
            "ok": True,
            "report": chartisme_read_report(),
            "models": chartisme_model_availability(),
        }

    @app.post("/api/pronostic/committee")
    async def pronostic_committee(request: Request) -> dict[str, Any]:
        try:
            payload = await request.json()
        except Exception as exc:
            raise HTTPException(400, "Le comité n’a pas reçu une requête lisible.") from exc
        from synchro.pronostic_net import parse_committee_request, run_confrontation

        try:
            lookback, draws = parse_committee_request(payload)
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        from starlette.concurrency import run_in_threadpool

        report = await run_in_threadpool(run_confrontation, draws, lookback)
        return {"ok": True, **report}

    def _nextdata_estimators() -> int:
        """Un seul nombre d’arbres : le pronostic, le retour et les décalages lisent les mêmes pas."""
        raw = os.environ.get("SYNCHRO_NEXTDATA_ESTIMATORS")
        if not raw:
            return 32
        try:
            return max(2, min(80, int(raw)))
        except ValueError:
            return 32

    def _nextdata_chronos(payload: dict[str, Any]) -> bool:
        raw = payload.get("with_chronos", False)
        if not isinstance(raw, bool):
            raise HTTPException(400, "Chronos s’active avec un booléen.")
        return raw

    def _nextdata_timesfm(payload: dict[str, Any]) -> bool:
        raw = payload.get("with_timesfm", False)
        if not isinstance(raw, bool):
            raise HTTPException(400, "TimesFM s’active avec un booléen.")
        return raw

    def _nextdata_block(payload: dict[str, Any]) -> str | None:
        from synchro.nextdata.covariates import known_block

        try:
            found = known_block(payload.get("block"))
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        return None if found is None else found.id

    def _nextdata_focus(payload: dict[str, Any]) -> int:
        from synchro.nextdata.panel import FOCUS_LENGTHS

        focus = payload.get("focus", 50)
        if focus not in FOCUS_LENGTHS:
            raise HTTPException(400, "Le focus est 20, 50 ou 100.")
        return int(focus)

    @app.get("/api/nextdata/status")
    def nextdata_status() -> dict[str, Any]:
        from synchro.nextdata import dependency_status

        return {"ok": True, **dependency_status()}

    @app.post("/api/nextdata/forecast")
    async def nextdata_forecast(request: Request) -> dict[str, Any]:
        try:
            payload = await request.json()
        except Exception as exc:
            raise HTTPException(400, "nextData n’a pas reçu une requête lisible.") from exc
        if not isinstance(payload, dict):
            raise HTTPException(400, "Le corps nextData doit être un objet.")
        focus = _nextdata_focus(payload)
        primary = payload.get("primary") or "corpus"
        if primary not in ("corpus", "fenetre"):
            raise HTTPException(400, "Le mode est corpus ou fenetre.")
        years = payload.get("years")
        if years is not None and not isinstance(years, list):
            raise HTTPException(400, "Les années se cochent dans une liste.")
        covariates = payload.get("covariates")
        if covariates is not None and not isinstance(covariates, list):
            raise HTTPException(400, "Les covariables se cochent dans une liste.")
        weekday = payload.get("weekday")
        from synchro.nextdata.persist import parse_persist

        try:
            persist = parse_persist(payload.get("persist"))
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        with_chronos = _nextdata_chronos(payload)
        with_timesfm = _nextdata_timesfm(payload)
        draws = payload.get("draws")
        if not isinstance(draws, list) or not draws:
            try:
                draws = [db.serialize_draw(row) for row in db.all_draws(era="current")]
            except Exception as exc:
                raise HTTPException(503, f"Tirages indisponibles : {exc}") from exc
        from starlette.concurrency import run_in_threadpool
        from synchro.nextdata import run_forecast

        report = await run_in_threadpool(
            lambda: run_forecast(
                draws,
                focus=int(focus),
                years=years,
                primary=str(primary),
                weekday=weekday if isinstance(weekday, str) else None,
                covariates=covariates,
                with_chronos=with_chronos,
                with_timesfm=with_timesfm,
                estimators=_nextdata_estimators(),
                persist=persist,
                block=_nextdata_block(payload),
            )
        )
        return report

    @app.post("/api/nextdata/training")
    async def nextdata_training(request: Request) -> dict[str, Any]:
        try:
            payload = await request.json()
        except Exception as exc:
            raise HTTPException(400, "nextDataTraining n’a pas reçu une requête lisible.") from exc
        if not isinstance(payload, dict):
            raise HTTPException(400, "Le corps nextDataTraining doit être un objet.")
        focus = _nextdata_focus(payload)
        years = payload.get("years")
        if years is not None and not isinstance(years, list):
            raise HTTPException(400, "Les années se cochent dans une liste.")
        covariates = payload.get("covariates")
        if covariates is not None and not isinstance(covariates, list):
            raise HTTPException(400, "Les covariables se cochent dans une liste.")
        weekday = payload.get("weekday")
        raw_shift = payload.get("shift")
        shift: int | None = None
        if raw_shift is not None:
            try:
                shift = int(raw_shift)
            except (TypeError, ValueError):
                raise HTTPException(400, "Le décalage va de 1 à 10.") from None
            if shift < 1 or shift > 10:
                raise HTTPException(400, "Le décalage va de 1 à 10.")
        from synchro.nextdata.persist import parse_persist

        try:
            persist = parse_persist(payload.get("persist"))
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        with_chronos = _nextdata_chronos(payload)
        with_timesfm = _nextdata_timesfm(payload)
        draws = payload.get("draws")
        if not isinstance(draws, list) or not draws:
            try:
                draws = [db.serialize_draw(row) for row in db.all_draws(era="current")]
            except Exception as exc:
                raise HTTPException(503, f"Tirages indisponibles : {exc}") from exc
        from starlette.concurrency import run_in_threadpool
        from synchro.nextdata import run_training

        report = await run_in_threadpool(
            lambda: run_training(
                draws,
                focus=int(focus),
                years=years,
                weekday=weekday if isinstance(weekday, str) else None,
                covariates=covariates,
                estimators=_nextdata_estimators(),
                shift=shift,
                with_chronos=with_chronos,
                with_timesfm=with_timesfm,
                persist=persist,
                block=_nextdata_block(payload),
            )
        )
        return report

    @app.post("/api/nextdata/sweep")
    async def nextdata_sweep(request: Request) -> dict[str, Any]:
        try:
            payload = await request.json()
        except Exception as exc:
            raise HTTPException(400, "nextDataTraining n’a pas reçu une requête lisible.") from exc
        if not isinstance(payload, dict):
            raise HTTPException(400, "Le corps nextDataTraining doit être un objet.")
        focus = _nextdata_focus(payload)
        years = payload.get("years")
        if years is not None and not isinstance(years, list):
            raise HTTPException(400, "Les années se cochent dans une liste.")
        covariates = payload.get("covariates")
        if covariates is not None and not isinstance(covariates, list):
            raise HTTPException(400, "Les covariables se cochent dans une liste.")
        weekday = payload.get("weekday")
        from synchro.nextdata.persist import parse_persist

        try:
            persist = parse_persist(payload.get("persist"))
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        with_chronos = _nextdata_chronos(payload)
        draws = payload.get("draws")
        if not isinstance(draws, list) or not draws:
            try:
                draws = [db.serialize_draw(row) for row in db.all_draws(era="current")]
            except Exception as exc:
                raise HTTPException(503, f"Tirages indisponibles : {exc}") from exc
        from starlette.concurrency import run_in_threadpool
        from synchro.nextdata.sweep import run_sweep

        report = await run_in_threadpool(
            lambda: run_sweep(
                draws,
                focus=int(focus),
                years=years,
                weekday=weekday if isinstance(weekday, str) else None,
                covariates=covariates,
                estimators=_nextdata_estimators(),
                with_chronos=with_chronos,
                persist=persist,
                block=_nextdata_block(payload),
            )
        )
        return report

    @app.post("/api/journal/update")
    def journal_update() -> dict[str, Any]:
        from synchro.journal_sync import apply_journal_update

        try:
            return _json(apply_journal_update())
        except Exception as exc:
            raise HTTPException(503, str(exc)) from exc

    @app.get("/api/journal")
    def journal_list() -> dict[str, Any]:
        try:
            rows = db.list_dev_journal()
        except Exception as exc:
            raise HTTPException(503, str(exc)) from exc
        return {"items": [_json(db.serialize_row(row, drop=())) for row in rows], "readonly": False}

    @app.post("/api/journal")
    def journal_create(payload: JournalIn) -> dict[str, Any]:
        from synchro.journal import JournalError, entry_for_create

        try:
            entry = entry_for_create(payload.model_dump())
            stored = db.insert_dev_journal(entry)
        except JournalError as exc:
            raise HTTPException(400, str(exc)) from exc
        except Exception as exc:
            raise HTTPException(503, str(exc)) from exc
        return {"ok": True, "item": _json(db.serialize_row(stored, drop=()))}

    @app.patch("/api/journal/{entry_id}")
    def journal_patch(entry_id: int, payload: JournalPatch) -> dict[str, Any]:
        fields: dict[str, Any] = {}
        if payload.area is not None:
            area = payload.area.strip()
            if not area:
                raise HTTPException(400, "La zone est vide.")
            fields["area"] = area
        if payload.title is not None:
            title = payload.title.strip()
            if not title:
                raise HTTPException(400, "Le titre est vide.")
            fields["title"] = title
        if payload.body is not None:
            body = payload.body.strip()
            if not body:
                raise HTTPException(400, "Le texte est vide.")
            fields["body"] = body
        if payload.hidden is not None:
            fields["hidden"] = payload.hidden
        try:
            stored = db.update_dev_journal(entry_id, fields)
        except Exception as exc:
            raise HTTPException(503, str(exc)) from exc
        if stored is None:
            raise HTTPException(404, "Fiche introuvable")
        return {"ok": True, "item": _json(db.serialize_row(stored, drop=()))}

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
        _lexicon_auto_cycle()
    return result


def _lexicon_auto_cycle() -> None:
    """Une demande 20/50/100 si le dictionnaire est en automatique.

    Non fatale : une synchro de tirages aboutit même si la lecture échoue.
    """
    try:
        from synchro.lexicon.service import load_draws_for_read, run_if_automatic, specialist_rows

        run_if_automatic(
            load_draws_for_read(era="current"),
            specialists=specialist_rows(),
        )
    except Exception:
        return


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
