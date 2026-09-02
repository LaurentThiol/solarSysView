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
from synchro.config import ROOT, WEB_DIR, get_settings
from synchro.fdj import Draw, fetch_all_draws
from synchro.ranks import evaluate_grid, validate_grid
from synchro.stats import compute_stats

_LOCAL_SHUTDOWN_HOSTS = {"127.0.0.1", "::1", "localhost", "testclient"}


class GridIn(BaseModel):
    label: str = "Grille"
    numbers: list[int] = Field(min_length=5, max_length=5)
    stars: list[int] = Field(min_length=2, max_length=2)


class CheckIn(BaseModel):
    numbers: list[int] = Field(min_length=5, max_length=5)
    stars: list[int] = Field(min_length=2, max_length=2)
    last_n: int = Field(default=1, ge=1, le=200)


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
        }
        if not neon.get("ok"):
            return payload
        try:
            db.init_db()
            latest = db.latest_draw()
            payload["draws"] = db.count_draws()
            payload["latest"] = _json(db.serialize_draw(latest)) if latest else None
            payload["last_sync"] = _json(db.last_sync())
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
        limit: int = Query(50, ge=1, le=500),
        offset: int = Query(0, ge=0),
        q: str | None = None,
    ) -> dict[str, Any]:
        rows = [db.serialize_draw(r) for r in db.list_draws(limit=limit, offset=offset, query=q)]
        return {"items": _json(rows), "total": db.count_draws()}

    @app.get("/api/draws/latest")
    def latest() -> dict[str, Any]:
        row = db.latest_draw()
        if not row:
            raise HTTPException(404, "Aucun tirage. Lancez une synchro FDJ.")
        return _json(db.serialize_draw(row))

    @app.get("/api/stats")
    def stats(era: str = Query("current", pattern="^(current|all)$")) -> dict[str, Any]:
        return compute_stats(db.all_draws(era=era))

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

    if WEB_DIR.exists():
        app.mount("/", StaticFiles(directory=str(WEB_DIR), html=True), name="web")

    return app


def sync_draws() -> dict[str, Any]:
    db.init_db()
    sync_id = db.log_sync_start()
    try:
        draws: list[Draw] = fetch_all_draws()
        upserted = db.upsert_draws([item.as_row() for item in draws])
        db.log_sync_end(sync_id, "ok", fetched=len(draws), upserted=upserted)
        latest = db.latest_draw()
        return {
            "ok": True,
            "fetched": len(draws),
            "upserted": upserted,
            "latest": _json(db.serialize_draw(latest)) if latest else None,
        }
    except Exception as exc:
        db.log_sync_end(sync_id, "error", error=str(exc))
        raise


def run_sync() -> dict[str, Any]:
    try:
        return sync_draws()
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
        "last_sync": _json(db.last_sync()),
    }
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(_json(snapshot), ensure_ascii=False), encoding="utf-8")
    return target
