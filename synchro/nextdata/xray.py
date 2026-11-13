"""Rayons X : la trace d’un pas déjà assemblé, et les contrôles de règle.

Rien ici ne réajuste un modèle. Les chiffres viennent des morceaux en mémoire,
des fonctions pures du cadre, et du chemin de projection. L’origine d’un
morceau (relu ou calculé) est celle de cette réponse : elle n’entre pas dans
le fichier de cache.
"""

from __future__ import annotations

import hashlib
from functools import lru_cache
from pathlib import Path
from typing import Any

from synchro.nextdata.covariates import (
    TEMPORAL_TARGETS,
    column_family,
    future_columns,
    known_block,
    past_columns,
)
from synchro.nextdata.models import lag_choice, loss_indices, row_weight
from synchro.nextdata.panel import Frame
from synchro.nextdata.project import _valid_numbers, _valid_stars, held_center

# Même fenêtre et mêmes cibles que l’assemblage. Un test les compare.
CHRONOS_WINDOW = 10
CHRONOS_TARGETS = {"sum": "sum", "star_sum": "star_sum"}
CALIBRATION_NEED = 9
OPERATIONS = (
    "cadre",
    "reglage",
    "pas",
    "matrice",
    "quantiles",
    "chronos",
    "arbitrage",
    "projection",
    "calibrage",
    "persist",
)
QUANTILE_NAMES = (
    "sum",
    "star_sum",
    "parity",
    "spread",
    "n1",
    "g1",
    "g2",
    "g3",
    "g4",
    "e1",
    "e2",
    "e_gap",
    *(f"level:{name}" for name in ("n1", "n2", "n3", "n4", "n5", "e1", "e2")),
    *(f"delta:{name}" for name in ("n1", "n2", "n3", "n4", "n5", "e1", "e2")),
)


def _band(band: dict[str, Any]) -> dict[str, float]:
    return {key: round(float(band[key]), 4) for key in ("lo", "mid", "hi")}


def _floats(values: list[float]) -> list[float]:
    return [round(float(value), 4) for value in values]


def _ints(values: list[int]) -> list[int]:
    return [int(value) for value in values]


@lru_cache(maxsize=1)
def assembly_fingerprint() -> str:
    """Empreinte de l’assemblage. Elle n’entre pas dans la clé d’un pas."""
    digest = hashlib.sha256()
    folder = Path(__file__).resolve().parent
    for name in ("project.py", "backtest.py"):
        digest.update((folder / name).read_bytes())
    return digest.hexdigest()[:8]


def core_trace(
    *,
    moments_before: dict[str, Any],
    chronos: dict[str, Any] | None,
    window_t: list[int],
    library: str,
    engine: str,
    darts_names: list[str],
    composed: dict[str, Any],
    ranked: list[dict[str, Any]],
    arbitration: dict[str, Any] | None,
    star_pool: int,
    scored_t: int,
    error: str | None,
) -> dict[str, Any]:
    """Ce que l’assemblage sait déjà : bandes avant Chronos, chemin, faisceau."""
    quantiles = {
        name: _band(moments_before[name])
        for name in QUANTILE_NAMES
        if isinstance(moments_before.get(name), dict) and "mid" in moments_before[name]
    }
    note = chronos or {}
    held = held_center(composed, star_pool)
    numbers = held["numbers"]
    stars = held["stars"]
    neighbors = []
    for item in ranked[:6]:
        terms = item.get("terms") or {}
        neighbors.append(
            {
                "numbers": _ints(item["numbers"]),
                "stars": _ints(item["stars"]),
                "score": item["score"],
                "distance": terms.get("distance"),
                "frequency": terms.get("frequency"),
                "couples": terms.get("couples"),
                "triples": terms.get("triples"),
                "pulse": terms.get("pulse"),
            }
        )
    return {
        "quantiles": quantiles,
        "chronos": {
            "available": bool(note.get("available")),
            "weights": {name: note["weights"][name] for name in note.get("weights") or {}},
            "window": int(note.get("window") or 0),
            "holdout_mae_lgb": note.get("holdout_mae_lgb"),
            "holdout_mae_chronos": note.get("holdout_mae_chronos"),
            "medians": {name: note[name] for name in ("sum", "star_sum") if note.get(name) is not None},
            "window_t": [int(value) for value in window_t],
            "scored_t": int(scored_t),
        },
        "engine": engine,
        "library": library,
        "darts": list(darts_names),
        "error": error,
        "arbitration": _arbitration(arbitration),
        "projection": {
            "raw": _floats(numbers["raw"]),
            "ordered": _ints(numbers["ordered"]),
            "after_sum": _ints(numbers["after_sum"]),
            "after_spread": _ints(numbers["after_spread"]),
            "center": {"numbers": _ints(held["center_numbers"]), "stars": _ints(held["center_stars"])},
            "stars_raw": _floats(stars["raw"]),
            "stars_ordered": _ints(stars["ordered"]),
            "stars_after_sum": _ints(stars["after_sum"]),
            "neighbors": neighbors,
        },
    }


def _arbitration(trace: dict[str, Any] | None) -> dict[str, Any] | None:
    if not trace:
        return None
    ranks = []
    for row in list(trace.get("numbers") or []) + list(trace.get("stars") or []):
        ranks.append(
            {
                "rank": row.get("rank"),
                "chain": row.get("chain"),
                "level": row.get("level"),
                "delta": row.get("delta"),
                "weights": dict(row.get("weights") or {}),
                "clipped": row.get("clipped"),
                "grid": row.get("grid"),
            }
        )
    gaps = []
    star_gap = trace.get("star_gap")
    for gap in list(trace.get("gaps") or []) + ([star_gap] if star_gap else []):
        gaps.append(
            {
                "name": gap.get("name"),
                "blend": gap.get("blend"),
                "clipped": gap.get("clipped"),
                "lo": gap.get("lo"),
                "hi": gap.get("hi"),
                "hit": bool(gap.get("hit")),
            }
        )
    return {"ranks": ranks, "gaps": gaps}


def _matrice(frame: Frame, t: int, mode: str, families: list[str], excluded: list[str]) -> dict[str, Any]:
    lags, past = lag_choice(max(0, int(t)))
    indices = loss_indices(max(0, int(t)), lags, frame.focus_start, mode)
    weights = [row_weight(index, frame.focus_start, mode) for index in indices]
    columns: dict[str, dict[str, int]] = {}
    for name in past_columns(families, excluded):
        slot = columns.setdefault(column_family(name), {"past": 0, "future": 0})
        slot["past"] += 1
    for name in future_columns(families, excluded):
        slot = columns.setdefault(column_family(name), {"past": 0, "future": 0})
        slot["future"] += 1
    return {
        "lags": lags,
        "past": past,
        "loss_rows": len(indices),
        "weight_3": sum(1 for weight in weights if weight == 3.0),
        "weight_1": sum(1 for weight in weights if weight == 1.0),
        "columns": columns,
    }


def _persist_view(snap: dict[str, Any] | None) -> dict[str, Any]:
    if not snap:
        return {"swaps": [], "held": None, "numbers": [], "stars": []}
    grid = snap.get("grid") if isinstance(snap.get("grid"), dict) else snap
    return {
        "swaps": list(snap.get("swaps") or []),
        "held": snap.get("held"),
        "numbers": [int(value) for value in grid.get("numbers") or []],
        "stars": [int(value) for value in grid.get("stars") or []],
    }


def _check(items: list[dict[str, Any]], check_id: str, ok: bool, detail: str) -> None:
    items.append({"id": check_id, "ok": bool(ok), "detail": detail})


def public_xray(
    frame: Frame,
    step: dict[str, Any],
    reading_key: str,
    reading: dict[str, Any],
    *,
    focus_requested: int,
    families: list[str],
    block_requested: str | None,
    excluded: list[str],
    estimators: int,
    chronos_requested: bool,
    timesfm_requested: bool = False,
    persist: dict[str, int] | None,
    calibration: dict[str, Any] | None,
    moved: dict[str, Any] | None,
    persist_snap: dict[str, Any] | None,
) -> dict[str, Any]:
    """Les dix opérations et les contrôles, pour la lecture affichée."""
    del reading_key
    core = reading.get("xray_core") or {}
    mode = str(reading.get("mode") or "corpus")
    library = str(reading.get("library") or core.get("library") or "lightgbm")
    scored_t = int(step.get("t") if step.get("t") is not None else core.get("chronos", {}).get("scored_t") or 0)
    previous = frame.rows[scored_t - 1]["date"] if 0 < scored_t <= len(frame.rows) else None
    date = frame.rows[scored_t]["date"] if scored_t < len(frame.rows) else frame.next_date
    found = known_block(block_requested) if block_requested else None
    ignored = found is not None and found.family not in set(families)
    parts = step.get("parts") or {}
    present = [name for name in ("lightgbm", "catboost", "darts", "chronos") if name in parts]
    keys = step.get("part_keys") or {}
    chrono = dict(core.get("chronos") or {})
    times_note = reading.get("timesfm") if isinstance(reading.get("timesfm"), dict) else {}
    applies = library == "lightgbm" and chronos_requested
    window = int(chrono.get("window") or 0)
    available = bool(chrono.get("available"))
    projection = dict(core.get("projection") or {})
    neighbors = list(projection.get("neighbors") or [])
    grid = reading.get("grid") or {}
    numbers = [int(value) for value in grid.get("numbers") or []]
    stars = [int(value) for value in grid.get("stars") or []]
    pool = int(step.get("star_pool") or frame.star_pool)
    info = calibration or {}
    edges = dict(info.get("edges") or {})
    history_t = [int(value) for value in info.get("history_t") or []]
    raw_view = reading.get("view") or {}
    fields: dict[str, Any] = {}
    for name, band in raw_view.items():
        if not isinstance(band, dict) or "mid" not in band:
            continue
        moved_band = (moved or {}).get(name)
        fields[name] = {
            "raw": _band(band),
            "moved": _band(moved_band) if isinstance(moved_band, dict) and "mid" in moved_band else None,
            "down": (edges.get(name) or {}).get("down"),
            "up": (edges.get(name) or {}).get("up"),
        }
    snap = _persist_view(persist_snap)
    payload: dict[str, Any] = {
        "cadre": {
            "rows": len(frame.rows),
            "focus": frame.focus,
            "focus_requested": int(focus_requested),
            "focus_start": frame.focus_start,
            "years": list(frame.years),
            "years_present": list(frame.years_present),
            "weekday": frame.weekday,
            "date": date,
            "star_pool": pool,
            "t": scored_t,
            "previous_date": previous,
        },
        "reglage": {
            "families": list(families),
            "block": None if ignored or found is None else found.id,
            "block_requested": None if found is None else found.id,
            "block_family": None if found is None else found.family,
            "excluded": list(excluded),
            "estimators": int(estimators),
            "chronos": bool(chronos_requested),
            "timesfm": bool(timesfm_requested),
            "persist": None if persist is None else {"radius": int(persist["radius"]), "limit": int(persist["limit"])},
            "mode": mode,
            "library": library,
        },
        "pas": {
            "parts": present,
            "engine": core.get("engine") or library,
            "error": core.get("error"),
            "origin": dict(step.get("origin") or {}),
            "fingerprints": {part: str(keys[part])[:8] for part in present if keys.get(part)},
            "assembly": assembly_fingerprint(),
            "darts": list(core.get("darts") or []),
        },
        "matrice": _matrice(frame, scored_t, mode, families, excluded),
        "quantiles": dict(core.get("quantiles") or {}),
        "chronos": {
            "applies": applies,
            "available": available,
            "weights": dict(chrono.get("weights") or {}),
            "window": window,
            "window_of": CHRONOS_WINDOW,
            "half": applies and available and window < CHRONOS_WINDOW,
            "holdout_mae_lgb": chrono.get("holdout_mae_lgb"),
            "holdout_mae_chronos": chrono.get("holdout_mae_chronos"),
            "medians": dict(chrono.get("medians") or {}),
            "targets": dict(CHRONOS_TARGETS),
            "window_t": [int(value) for value in chrono.get("window_t") or []],
            "scored_t": int(chrono.get("scored_t") if chrono.get("scored_t") is not None else scored_t),
        },
        "timesfm": {
            "requested": bool(timesfm_requested),
            "available": bool(times_note.get("available")),
            "sum": times_note.get("sum"),
            "star_sum": times_note.get("star_sum"),
        },
        "arbitrage": core.get("arbitration"),
        "projection": {**projection, "neighbors": neighbors, "valid": _valid_numbers(numbers) and _valid_stars(stars, pool)},
        "calibrage": {
            "steps": int(info.get("steps") or 0),
            "need": CALIBRATION_NEED,
            "calibrated": bool(info.get("calibrated")),
            "history_t": history_t,
            "edges": edges,
            "fields": fields,
        },
        "persist": {
            "on": persist is not None,
            "radius": None if persist is None else int(persist["radius"]),
            "limit": None if persist is None else int(persist["limit"]),
            "swaps": snap["swaps"],
            "held": snap["held"],
            "numbers": snap["numbers"],
            "stars": snap["stars"],
            "source_numbers": numbers,
            "source_stars": stars,
        },
    }
    payload["controles"] = controles(payload)
    return payload


def controles(payload: dict[str, Any]) -> list[dict[str, Any]]:
    """Contrôles dans l’ordre des opérations. Un écart a `ok` faux."""
    items: list[dict[str, Any]] = []
    cadre = payload["cadre"]
    if cadre["focus"] < cadre["focus_requested"]:
        _check(items, "cadre.focus", False, f"Le focus réel est {cadre['focus']}, le bouton demande {cadre['focus_requested']}.")
    else:
        _check(items, "cadre.focus", True, "Le focus demandé est dans le cadre.")
    missing = [year for year in cadre["years"] if year not in set(cadre["years_present"])]
    if missing:
        _check(items, "cadre.annees", False, "Absentes du cadre : " + ", ".join(missing) + ".")
    else:
        _check(items, "cadre.annees", True, "Les années cochées sont dans le cadre.")

    reglage = payload["reglage"]
    if reglage["block_requested"] and reglage["block_family"] not in set(reglage["families"]):
        _check(
            items,
            "reglage.bloc",
            False,
            f"Le bloc {reglage['block_requested']} vise {reglage['block_family']}, et cette famille est éteinte.",
        )
    elif reglage["block"]:
        _check(items, "reglage.bloc", True, f"Le bloc {reglage['block']} retire ses colonnes.")
    else:
        _check(items, "reglage.bloc", True, "Aucun bloc retiré.")

    error = payload["pas"].get("error")
    _check(items, "pas.erreur", not error, error or "Aucun morceau en erreur.")
    darts = list(payload["pas"].get("darts") or [])
    extra = [name for name in darts if name not in TEMPORAL_TARGETS]
    if extra:
        _check(items, "pas.darts", False, "Darts a touché " + ", ".join(extra) + ", hors des médianes temporelles.")
    elif darts:
        _check(items, "pas.darts", True, "Darts a remplacé " + ", ".join(darts) + ". La chaîne des écarts reste LightGBM.")
    else:
        _check(items, "pas.darts", True, "Darts n’a pas remplacé de médiane.")

    crossed = [
        name
        for name, band in payload["quantiles"].items()
        if not (band["lo"] <= band["mid"] <= band["hi"])
    ]
    if crossed:
        _check(items, "quantiles.ordre", False, "Bande croisée : " + ", ".join(crossed) + ".")
    else:
        _check(items, "quantiles.ordre", True, "Les bandes ont lo, puis mid, puis hi.")

    chronos = payload["chronos"]
    if not chronos["applies"]:
        detail = "CatBoost n’est pas mélangé." if payload["reglage"]["library"] == "catboost" else "Chronos n’est pas demandé."
        _check(items, "chronos.fenetre", True, detail)
        _check(items, "chronos.moitie", True, "Pas de mélange.")
    elif chronos["scored_t"] in set(chronos["window_t"]):
        _check(items, "chronos.fenetre", False, f"Le tirage noté t {chronos['scored_t']} est dans la fenêtre des poids.")
        _check(items, "chronos.moitie", not chronos["half"], _half_detail(chronos))
    else:
        _check(items, "chronos.fenetre", True, "La fenêtre des poids s’arrête avant le tirage noté.")
        _check(items, "chronos.moitie", not chronos["half"], _half_detail(chronos))

    missing = []
    if payload["reglage"].get("chronos") and not payload["chronos"].get("available"):
        missing.append("Chronos")
    if payload["reglage"].get("timesfm") and not (payload.get("timesfm") or {}).get("available"):
        missing.append("TimesFM")
    if missing:
        _check(items, "etage1.vide", False, "Demandé, rien à l’étage 1 : " + ", ".join(missing) + ".")
    else:
        _check(items, "etage1.vide", True, "L’étage 1 a répondu, ou aucune lecture de fondation n’est demandée.")

    arbitration = payload.get("arbitrage")
    if not arbitration:
        _check(items, "arbitrage.chaine", False, "Pas de niveau ni de delta : la chaîne fait le centre.")
        _check(items, "arbitrage.bord", True, "Pas de trace d’écarts.")
    else:
        fallen = [
            row["rank"]
            for row in arbitration["ranks"]
            if float((row.get("weights") or {}).get("chain") or 0) > 0
        ]
        if fallen:
            _check(items, "arbitrage.chaine", False, "Repli sur la chaîne : " + ", ".join(fallen) + ".")
        else:
            _check(items, "arbitrage.chaine", True, "La chaîne ne pèse pas.")
        hits = [gap["name"] for gap in arbitration["gaps"] if gap.get("hit")]
        if hits:
            _check(items, "arbitrage.bord", False, "Ramenés au bord : " + ", ".join(hits) + ".")
        else:
            _check(items, "arbitrage.bord", True, "Aucun écart ramené au bord.")

    projection = payload["projection"]
    if projection.get("valid"):
        _check(items, "projection.grille", True, "La grille est croissante et dans l’urne.")
    else:
        _check(items, "projection.grille", False, "La grille retenue n’est pas une grille 5+2 valide.")
    if not neighbors_of(projection):
        _check(items, "projection.score", False, "Le faisceau n’a pas rendu de grille.")
    else:
        best = neighbors_of(projection)[0]
        score_ok = all(item["score"] <= best["score"] + 1e-9 for item in neighbors_of(projection))
        same = best["numbers"] == payload["persist"]["source_numbers"] and best["stars"] == payload["persist"]["source_stars"]
        if not same:
            _check(items, "projection.score", False, "La grille affichée n’est pas le premier voisin du faisceau.")
        elif not score_ok:
            _check(items, "projection.score", False, "Un voisin a un score plus haut que la grille retenue.")
        else:
            _check(items, "projection.score", True, "La grille retenue a le meilleur score du faisceau.")

    calibrage = payload["calibrage"]
    if payload["cadre"]["t"] in set(calibrage["history_t"]):
        _check(items, "calibrage.tirage", False, f"Le tirage t {payload['cadre']['t']} sert à calibrer sa propre bande.")
    else:
        _check(items, "calibrage.tirage", True, "Le tirage noté est hors des pas de calibrage.")
    says = bool(calibrage["calibrated"])
    has_edges = bool(calibrage["edges"])
    if says != has_edges or (says and calibrage["steps"] < calibrage["need"]):
        _check(items, "calibrage.annonce", False, "Le calibrage est annoncé alors que les bords sont vides, ou l’inverse.")
    elif not says:
        _check(
            items,
            "calibrage.annonce",
            True,
            f"Bande brute : {calibrage['steps']} pas d’avant, il en faut {calibrage['need']}.",
        )
    else:
        _check(items, "calibrage.annonce", True, f"Bandes déplacées sur {calibrage['steps']} pas d’avant.")

    kept = payload["persist"]
    if not kept["on"]:
        _check(items, "persist.doublon", True, "Persist est éteint.")
        _check(items, "persist.limite", True, "Persist est éteint.")
    else:
        source_numbers = set(kept["source_numbers"])
        source_stars = set(kept["source_stars"])
        bad = [
            str(swap.get("to"))
            for swap in kept["swaps"]
            if swap.get("to") in (source_numbers if swap.get("kind") == "number" else source_stars)
        ]
        duplicate = len(kept["numbers"]) != len(set(kept["numbers"])) or len(kept["stars"]) != len(set(kept["stars"]))
        if bad or duplicate:
            _check(items, "persist.doublon", False, "Échange vers une boule déjà tenue, ou doublon.")
        else:
            _check(items, "persist.doublon", True, "Aucun échange ne reprend une boule déjà dans la grille.")
        number_swaps = sum(1 for swap in kept["swaps"] if swap.get("kind") == "number")
        star_swaps = sum(1 for swap in kept["swaps"] if swap.get("kind") == "star")
        if number_swaps <= int(kept["limit"]) and star_swaps <= 1:
            _check(items, "persist.limite", True, f"{number_swaps} échanges de numéros sur {kept['limit']}, {star_swaps} étoile.")
        else:
            _check(
                items,
                "persist.limite",
                False,
                f"Trop d’échanges : {number_swaps} numéros pour une limite de {kept['limit']}, {star_swaps} étoile.",
            )
    return items


def neighbors_of(projection: dict[str, Any]) -> list[dict[str, Any]]:
    return list(projection.get("neighbors") or [])


def _half_detail(chronos: dict[str, Any]) -> str:
    if not chronos.get("available"):
        return "Chronos n’a pas répondu sur cette lecture."
    if chronos.get("half"):
        return (
            f"Poids moitié-moitié : {chronos['window']} pas d’avant sur {chronos['window_of']}. "
            "La MAE peut s’écarter du pronostic tant que la fenêtre n’est pas pleine."
        )
    return f"Poids réglés sur {chronos['window']} pas d’avant."
