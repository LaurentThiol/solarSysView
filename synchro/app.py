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

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from synchro import db
from synchro.analysis.bayes import bayes_report
from synchro.analysis.combinatorics import proba_tables
from synchro.analysis.common import as_date
from synchro.analysis.dependence import dependence_report
from synchro.analysis.diagnostics import diagnostics_report
from synchro.analysis.inference import inference_report
from synchro.analysis.lab import lab_report
from synchro.analysis.montecarlo import montecarlo_report
from synchro.analysis.ta import indicators
from synchro.analysis.variables import VARIABLE_NAMES, series
from synchro.analysis.windows import heikin_ashi, ohlc_blocks, rolling_stats
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
    ) -> dict[str, Any]:
        if name not in VARIABLE_NAMES:
            raise HTTPException(400, f"Variable inconnue: {name}")
        draws = _analysis_draws(era, from_date, to_date)
        payload = series(draws, name, n=n)
        candles = ohlc_blocks(draws, name=name, block=block, window=window, n=n)["candles"]
        return indicators(
            [float(v) for v in payload["values"]],
            candles,
            sma_period=window,
            ema_period=window,
            bb_period=window,
        )

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
    ) -> dict[str, Any]:
        if name not in VARIABLE_NAMES:
            raise HTTPException(400, f"Variable inconnue: {name}")
        draws = _analysis_draws(era, from_date, to_date)
        return lab_report(
            draws,
            variable=name,
            window=window,
            block=block,
            n=n,
            n_sim=n_sim,
            seed=seed,
            include_mc=True,
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
        return ensure_draws()
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(502, f"Synchro FDJ impossible: {exc}") from exc


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
