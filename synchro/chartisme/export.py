"""Export des courbes du logiciel vers le module chartisme.

Une courbe = une variable d'analyse (éventuellement paramétrée par une boule)
déroulée sur les tirages, plus son proxy d'activité qui sert la règle d'or
(cassure validée seulement si l'activité dépasse sa moyenne mobile 20).
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

from synchro.analysis.tech import activity_from_close
from synchro.analysis.variables import series
from synchro.config import ROOT

CHARTISME_DIR = ROOT / ".chartisme"
CURVES_PATH = CHARTISME_DIR / "curves.json"

N_POOL = 50
S_POOL = 12

# Variables sans paramètre : une courbe chacune.
#: Courbes sans indice de boule.
#:
#: `n1`…`n5` et `e1`, `e2` sont les statistiques d'ordre du tirage — le plus petit
#: numéro, le deuxième, etc. Séparées exprès : chacune a son propre régime, et
#: l'espace de règles doit pouvoir viser `n1` sans viser `n5`. Le plus petit
#: numéro vit contre le plancher 1, le plus grand contre le plafond 50, et une
#: cassure ne veut pas dire la même chose sur les deux.
PLAIN_VARIABLES = (
    "sum",
    "spread",
    "parity",
    "high_low",
    "consecutive",
    "centroid",
    "n1",
    "n2",
    "n3",
    "n4",
    "n5",
    "star_sum",
    "e1",
    "e2",
)

# Variables par boule : une courbe par numéro (1–50) ou par étoile (1–12).
BALL_VARIABLES = ("delay", "hit")
STAR_VARIABLES = ("star_delay", "star_hit")

VARIABLE_LABELS: dict[str, str] = {
    "sum": "Somme des numéros",
    "spread": "Étendue (max − min)",
    "parity": "Pairs / impairs",
    "high_low": "Numéros ≥ 26",
    "consecutive": "Paires consécutives",
    "centroid": "Centre de masse",
    "n1": "Plus petit numéro",
    "n2": "2ᵉ numéro trié",
    "n3": "3ᵉ numéro trié",
    "n4": "4ᵉ numéro trié",
    "n5": "Plus grand numéro",
    "delay": "Retard d'une boule",
    "hit": "Présence d'une boule",
    "star_sum": "Somme des étoiles",
    "e1": "Plus petite étoile",
    "e2": "Plus grande étoile",
    "star_delay": "Retard d'une étoile",
    "star_hit": "Présence d'une étoile",
}


def curve_id(name: str, n: int | None) -> str:
    return name if n is None else f"{name}:{n}"


def parse_curve_id(cid: str) -> tuple[str, int | None]:
    if ":" not in cid:
        return cid, None
    name, _, raw = cid.partition(":")
    try:
        return name, int(raw)
    except ValueError:
        return name, None


def curve_label(name: str, n: int | None) -> str:
    base = VARIABLE_LABELS.get(name, name)
    if n is None:
        return base
    unit = "étoile" if name.startswith("star_") else "boule"
    return f"{base} — {unit} {n}"


def build_curve(draws: list[dict[str, Any]], name: str, n: int | None = None) -> dict[str, Any]:
    """Une courbe exportable : dates, valeurs, activité."""
    payload = series(draws, name, n)
    values = [float(v) for v in payload["values"]]
    return {
        "id": curve_id(name, n),
        "variable": name,
        "n": n,
        "label": curve_label(name, n),
        "draw_count": payload["draw_count"],
        "from_date": payload["from_date"],
        "to_date": payload["to_date"],
        "dates": [p["date"] for p in payload["points"]],
        "values": values,
        "activity": activity_from_close(values),
    }


def curve_specs(
    *,
    plain: bool = True,
    balls: bool = True,
    stars: bool = True,
) -> list[tuple[str, int | None]]:
    """Le catalogue des courbes à exporter, dans un ordre stable."""
    specs: list[tuple[str, int | None]] = []
    if plain:
        specs.extend((name, None) for name in PLAIN_VARIABLES)
    if balls:
        for name in BALL_VARIABLES:
            specs.extend((name, n) for n in range(1, N_POOL + 1))
    if stars:
        for name in STAR_VARIABLES:
            specs.extend((name, n) for n in range(1, S_POOL + 1))
    return specs


def export_curves(
    draws: list[dict[str, Any]],
    *,
    only: Iterable[str] | None = None,
    plain: bool = True,
    balls: bool = True,
    stars: bool = True,
) -> dict[str, Any]:
    """Bundle canonique. `only` restreint à une liste d'identifiants de courbes."""
    wanted = set(only) if only is not None else None
    specs = curve_specs(plain=plain, balls=balls, stars=stars)
    if wanted is not None:
        specs = [spec for spec in specs if curve_id(*spec) in wanted]
        for cid in wanted:
            if cid not in {curve_id(*spec) for spec in specs}:
                name, n = parse_curve_id(cid)
                specs.append((name, n))
    curves = [build_curve(draws, name, n) for name, n in specs]
    dates = curves[0]["dates"] if curves else []
    return {
        "exported_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "draw_count": len(dates),
        "from_date": dates[0] if dates else None,
        "to_date": dates[-1] if dates else None,
        "curve_count": len(curves),
        "curves": curves,
    }


def write_bundle(bundle: dict[str, Any], path: Path | None = None) -> Path:
    target = path or CURVES_PATH
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(bundle, ensure_ascii=False), encoding="utf-8")
    return target


def read_bundle(path: Path | None = None) -> dict[str, Any] | None:
    target = path or CURVES_PATH
    if not target.exists():
        return None
    try:
        return json.loads(target.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None


def bundle_index(bundle: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {curve["id"]: curve for curve in bundle.get("curves", [])}


def manifest(bundle: dict[str, Any]) -> dict[str, Any]:
    """Le bundle sans les séries — pour lister les courbes sans tout charger."""
    return {
        "exported_at": bundle.get("exported_at"),
        "draw_count": bundle.get("draw_count"),
        "from_date": bundle.get("from_date"),
        "to_date": bundle.get("to_date"),
        "curve_count": bundle.get("curve_count"),
        "curves": [
            {
                "id": curve["id"],
                "variable": curve["variable"],
                "n": curve["n"],
                "label": curve["label"],
                "draw_count": curve["draw_count"],
            }
            for curve in bundle.get("curves", [])
        ],
    }
