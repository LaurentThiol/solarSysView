"""Cycle autonome : le module se remet à jour tout seul.

`./launch` appelle déjà `/api/sync/ensure` au démarrage, et `run_ensure()`
accroche ce cycle dès qu'un tirage entre en base. Le module chartisme suit donc
l'évolution des tirages sans un geste — c'est le « mode export automatique »
demandé.

Le cycle enchaîne : réexport des courbes → balayage des figures → avis des
réseaux s'ils sont là → évaluation des règles → journal des déclenchements →
état sur disque.

Tout est sous `try/except` non fatal et volontairement silencieux en cas
d'échec : un balayage qui casse ne doit jamais empêcher une synchro de
tirages d'aboutir. L'échec est consigné dans l'état, pas propagé.
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any, Sequence

from synchro.chartisme.export import (
    CHARTISME_DIR,
    bundle_index,
    export_curves,
    manifest,
    read_bundle,
    write_bundle,
)
from synchro.chartisme.rules import evaluate_all, summarize_firings
from synchro.chartisme.scan import outcome_stats, scan_bundle

STATE_PATH = CHARTISME_DIR / "state.json"
DEFAULT_LIMIT_PER_CURVE = 40
DEFAULT_MIN_CONFIDENCE = 0.6


def _suppressed() -> bool:
    """Neutralisé sous pytest : un cycle complet dans une suite de tests la
    rendrait lente et dépendante de l'état du disque."""
    return bool(os.environ.get("PYTEST_CURRENT_TEST"))


def read_state(*, path: Path | None = None) -> dict[str, Any] | None:
    target = path or STATE_PATH
    if not target.exists():
        return None
    try:
        return json.loads(target.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def write_state(state: dict[str, Any], *, path: Path | None = None) -> Path:
    target = path or STATE_PATH
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    return target


def run_cycle(
    draws: Sequence[dict[str, Any]],
    *,
    reason: str = "manuel",
    rules: Sequence[dict[str, Any]] | None = None,
    limit_per_curve: int | None = DEFAULT_LIMIT_PER_CURVE,
    min_confidence: float = DEFAULT_MIN_CONFIDENCE,
    persist: bool = True,
) -> dict[str, Any]:
    """Un cycle complet. Lève : c'est `run_auto_cycle` qui absorbe."""
    started = time.time()
    bundle = export_curves(list(draws))
    if persist:
        write_bundle(bundle)
    scan = scan_bundle(
        bundle,
        limit_per_curve=limit_per_curve,
        min_confidence=min_confidence,
    )
    hits = scan["figures"]
    firings = evaluate_all(list(rules or []), hits, curves=bundle_index(bundle))
    state = {
        "ran_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "reason": reason,
        "seconds": round(time.time() - started, 2),
        "curves": manifest(bundle),
        "figures": scan["summary"],
        "outcomes": outcome_stats(hits),
        "firings": summarize_firings(firings),
        "ok": True,
    }
    if persist:
        write_state(state)
    return {**state, "bundle": bundle, "scan": scan, "hits": hits, "firings": firings}


def run_auto_cycle(
    draws: Sequence[dict[str, Any]],
    *,
    reason: str = "ensure",
    rules: Sequence[dict[str, Any]] | None = None,
    **kwargs: Any,
) -> dict[str, Any] | None:
    """Cycle non fatal : renvoie `None` sans rien casser en cas d'échec."""
    if _suppressed():
        return None
    try:
        result = run_cycle(draws, reason=reason, rules=rules, **kwargs)
    except Exception as exc:  # noqa: BLE001 — rien ne doit remonter jusqu'à la synchro
        failure = {
            "ran_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "reason": reason,
            "ok": False,
            "error": f"{type(exc).__name__}: {exc}",
        }
        try:
            write_state(failure)
        except OSError:
            pass
        return None
    return {k: v for k, v in result.items() if k not in ("bundle", "scan", "hits", "firings")}


def status() -> dict[str, Any]:
    """Ce que l'en-tête affiche : dernier cycle, volumes, réseaux."""
    from synchro.chartisme.models import availability
    from synchro.chartisme.models.infer import ready

    state = read_state()
    bundle = read_bundle()
    models: dict[str, Any] = dict(availability())
    try:
        models.update(ready())
    except Exception:  # noqa: BLE001 — un réseau cassé ne doit pas vider la pastille
        pass
    return {
        "ok": True,
        "state": state,
        "curves": manifest(bundle) if bundle else None,
        "models": models,
        "auto_export": None,
    }
