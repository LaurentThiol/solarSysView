"""Requêtes GOES via SunPy (Fido). Aucun téléchargement si le paquet manque."""

from __future__ import annotations

from typing import Any


def _cell(value: Any) -> str:
    if hasattr(value, "isot"):
        return str(value.isot)
    if hasattr(value, "iso"):
        return str(value.iso)
    return str(value)


def _table_rows(table: Any, limit: int) -> list[dict[str, str]]:
    names = list(table.colnames)
    keep = names[:8]
    rows: list[dict[str, str]] = []
    count = min(limit, len(table))
    for index in range(count):
        row = table[index]
        rows.append({name: _cell(row[name]) for name in keep})
    return rows


def goes_search(start: str, end: str, kind: str = "xrs", limit: int = 12) -> dict[str, Any]:
    """Interroge Fido. `xrs` : flux X GOES. `flares` : événements HEK de type FL.

    La recherche renvoie le catalogue (table astropy). Le fichier TimeSeries
    n'est pas téléchargé ici : un intervalle XRS fait des dizaines de Mo.
    """
    if kind not in {"xrs", "flares"}:
        raise ValueError("kind doit être xrs ou flares")
    try:
        from sunpy.net import Fido
        from sunpy.net import attrs as a
    except ImportError as exc:
        raise RuntimeError(
            "SunPy n'est pas installé. pip install -r requirements-ref.txt"
        ) from exc

    if kind == "xrs":
        result = Fido.search(a.Time(start, end), a.Instrument("XRS"))
        label = "GOES XRS"
    else:
        result = Fido.search(a.Time(start, end), a.hek.EventType("FL"))
        label = "Éruptions HEK"

    blocks: list[dict[str, Any]] = []
    shown = 0
    for table in result:
        remaining = max(limit - shown, 0)
        rows = _table_rows(table, remaining) if remaining else []
        shown += len(rows)
        blocks.append({"rows": len(table), "preview": rows, "columns": list(table.colnames)[:8]})
        if shown >= limit:
            break

    file_num = getattr(result, "file_num", None)
    return {
        "ok": True,
        "kind": kind,
        "label": label,
        "start": start,
        "end": end,
        "file_num": file_num,
        "blocks": blocks,
        "downloaded": False,
        "note": (
            "Catalogue Fido seulement. sunpy.net.Fido.fetch télécharge le "
            "TimeSeries ou la table ; Réf ne le fait pas tout seul."
        ),
    }
