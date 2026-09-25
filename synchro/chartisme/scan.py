"""Balayage de l'archive : toutes les fenêtres, toutes les courbes.

`synchro.analysis.tech.detect_chart_patterns` ne regarde que les derniers pivots
— elle répond « où en est-on », ce qui suffit à l'onglet Figures. L'entraînement,
le rétro-test et la recherche par ressemblance ont besoin de l'inverse : chaque
figure jamais formée, avec sa position. C'est le rôle de ce module.
"""

from __future__ import annotations

from typing import Any, Iterable, Sequence

from synchro.chartisme.figures import (
    DEFAULT_EPS,
    DEFAULT_MAX_OVERLAP,
    DEFAULT_ZIGZAG_PCT,
    dedupe,
    detect_figures,
    rank_key,
    summarize,
    target_reached,
)

# Trois échelles : une figure courte n'a pas la même durée qu'un range annuel.
DEFAULT_SCALES = (30, 60, 120)
DEFAULT_STRIDE_RATIO = 0.25
MIN_WINDOW = 16


def window_starts(length: int, size: int, stride: int) -> list[int]:
    if length < size:
        return []
    starts = list(range(0, length - size + 1, max(1, stride)))
    tail = length - size
    if starts and starts[-1] != tail:
        starts.append(tail)
    return starts or [0]


def scan_curve(
    curve: dict[str, Any],
    *,
    scales: Sequence[int] | None = DEFAULT_SCALES,
    stride_ratio: float = DEFAULT_STRIDE_RATIO,
    zigzag_pct: float = DEFAULT_ZIGZAG_PCT,
    eps: float = DEFAULT_EPS,
    min_confidence: float = 0.5,
    min_confidence_by_scale: dict[int, float | None] | None = None,
    max_overlap: float = DEFAULT_MAX_OVERLAP,
    top_per_zone: bool = False,
    motifs: bool = True,
) -> list[dict[str, Any]]:
    """Figures d'une courbe, indices ramenés au repère de la courbe entière.

    `top_per_zone` ne garde que la meilleure lecture par zone. Plusieurs
    lectures d'une même zone sont légitimes — la ligne de cou d'une ETE est
    aussi un double creux — mais pour parcourir l'archive on veut une liste
    courte.

    `min_confidence_by_scale` donne un seuil propre à chaque échelle. Un seuil
    unique ne veut pas dire la même chose de l'une à l'autre : la confiance est
    escomptée selon la part de fenêtre couverte, donc une figure courte, qui
    couvre presque tout son tracé, la gagne sans rien gagner en substance. Lire
    en rareté visée — « ce que le hasard ne produit que dans une fenêtre sur
    cinq » — demande donc un seuil par échelle, et c'est ce qui rend les figures
    de deux échelles comparables. Une échelle absente de la table est balayée au
    seuil commun ; une échelle dont le seuil vaut `None` n'est pas balayée, la
    rareté demandée y étant hors d'atteinte.
    """
    values = [float(v) for v in curve.get("values") or []]
    dates = list(curve.get("dates") or [])
    activity = [float(a) for a in curve.get("activity") or []]
    if len(values) < MIN_WINDOW:
        return []
    found: list[dict[str, Any]] = []
    for size in scales or DEFAULT_SCALES:
        if size < MIN_WINDOW or size > len(values):
            continue
        bar = (min_confidence_by_scale or {}).get(size, min_confidence)
        if bar is None:
            continue
        stride = max(1, int(size * stride_ratio))
        for start in window_starts(len(values), size, stride):
            stop = start + size
            hits = detect_figures(
                values[start:stop],
                dates[start:stop],
                activity[start:stop],
                zigzag_pct=zigzag_pct,
                eps=eps,
                min_confidence=bar,
                max_overlap=max_overlap,
                motifs=motifs,
            )
            for hit in hits:
                found.append(
                    _rebase(
                        hit,
                        offset=start,
                        scale=size,
                        curve=curve,
                        values=values,
                        dates=dates,
                    )
                )
    kept = dedupe(found, max_overlap=max_overlap)
    return collapse_zones(kept, max_overlap=max_overlap) if top_per_zone else kept


def collapse_zones(
    hits: Sequence[dict[str, Any]],
    *,
    max_overlap: float = DEFAULT_MAX_OVERLAP,
) -> list[dict[str, Any]]:
    """Une seule figure par zone, la mieux classée ; les autres en `alternatives`."""
    kept: list[dict[str, Any]] = []
    for hit in sorted(hits, key=rank_key):
        host = next(
            (k for k in kept if _span_overlap(k, hit) > max_overlap),
            None,
        )
        if host is None:
            kept.append({**hit, "alternatives": []})
            continue
        host["alternatives"].append(
            {"figure": hit["figure"], "label": hit["label"], "confidence": hit["confidence"]}
        )
    return kept


def _span_overlap(a: dict[str, Any], b: dict[str, Any]) -> float:
    lo = max(a["from_index"], b["from_index"])
    hi = min(a["to_index"], b["to_index"])
    if hi <= lo:
        return 0.0
    shortest = min(a["to_index"] - a["from_index"], b["to_index"] - b["from_index"])
    return (hi - lo) / shortest if shortest > 0 else 0.0


def sample_by_figure(
    hits: Sequence[dict[str, Any]],
    *,
    per_figure: int = 200,
    seed: int = 0,
) -> list[dict[str, Any]]:
    """Échantillon équilibré par classe — sinon l'entraînement voit surtout du bruit."""
    import random

    rng = random.Random(seed)
    buckets: dict[str, list[dict[str, Any]]] = {}
    for hit in hits:
        buckets.setdefault(hit["figure"], []).append(hit)
    out: list[dict[str, Any]] = []
    for figure, rows in sorted(buckets.items()):
        ranked = sorted(rows, key=rank_key)
        if len(ranked) <= per_figure:
            out.extend(ranked)
            continue
        # Les mieux classées d'abord, puis un tirage au sort pour la diversité.
        head = ranked[: per_figure // 2]
        tail = rng.sample(ranked[per_figure // 2 :], per_figure - len(head))
        out.extend(head + tail)
    return out


def _rebase(
    hit: dict[str, Any],
    *,
    offset: int,
    scale: int,
    curve: dict[str, Any],
    values: Sequence[float],
    dates: Sequence[str],
) -> dict[str, Any]:
    """Décale les indices d'une fenêtre vers le repère de la courbe."""
    out = dict(hit)
    out["curve_id"] = curve.get("id")
    out["variable"] = curve.get("variable")
    out["n"] = curve.get("n")
    out["scale"] = scale
    out["window_start"] = offset
    out["from_index"] = hit["from_index"] + offset
    out["to_index"] = hit["to_index"] + offset
    out["pivots"] = [
        {**pivot, "index": pivot["index"] + offset, "date": _date(dates, pivot["index"] + offset)}
        for pivot in hit.get("pivots") or []
    ]
    out["guides"] = [
        {
            **guide,
            "points": [
                {**point, "index": point["index"] + offset} for point in guide.get("points") or []
            ],
        }
        for guide in hit.get("guides") or []
    ]
    breakout = hit.get("breakout")
    if breakout:
        index = breakout["index"] + offset
        out["breakout"] = {**breakout, "index": index, "date": _date(dates, index)}
    out["from"] = _date(dates, out["from_index"])
    out["to"] = _date(dates, out["to_index"])
    out["outcome"] = target_reached(values, out)
    return out


def _date(dates: Sequence[str], index: int) -> str | None:
    return dates[index] if 0 <= index < len(dates) else None


def slice_curve(
    curve: dict[str, Any],
    *,
    start: str | None = None,
    end: str | None = None,
    context: int = 0,
) -> dict[str, Any]:
    """Courbe restreinte à une fenêtre de dates, contexte compris.

    Les valeurs sont déjà calculées sur toute l'archive : les découper conserve
    le retard d'une boule et l'activité, là où les recalculer sur les seuls
    tirages de la fenêtre les ferait repartir de zéro au premier tirage retenu.

    `context` réserve devant la fenêtre les points dont le balayage a besoin —
    une figure de 60 points qui s'achève au premier tirage étudié commence 59
    points plus tôt — et ceux de la MM20 de la règle d'or. `context_count` dit
    combien ont réellement été trouvés : moins que demandé en début d'archive.

    `from_date` et `to_date` restent ceux de la fenêtre étudiée, pas ceux du
    découpage : le contexte est calculé, il n'est pas lu.
    """
    dates = [str(d) for d in curve.get("dates") or []]
    values = list(curve.get("values") or [])
    activity = list(curve.get("activity") or [])
    first = next((i for i, d in enumerate(dates) if d >= start), len(dates)) if start else 0
    last = next((i for i, d in enumerate(dates) if d > end), len(dates)) if end else len(dates)
    if first >= last:
        return {
            **curve,
            "dates": [],
            "values": [],
            "activity": [],
            "draw_count": 0,
            "context_count": 0,
            "from_date": None,
            "to_date": None,
        }
    lead = max(0, first - max(0, context))
    return {
        **curve,
        "dates": dates[lead:last],
        "values": values[lead:last],
        "activity": activity[lead:last],
        "draw_count": last - first,
        "context_count": first - lead,
        "from_date": dates[first],
        "to_date": dates[last - 1],
    }


def live_in_window(hit: dict[str, Any], context: int) -> bool:
    """La figure s'achève-t-elle dans la fenêtre, ou seulement dans le contexte ?

    Une figure entièrement contenue dans le contexte appartient au passé qu'on a
    calculé sans le lire. Une figure qui s'achève — ou qui casse — dans la
    fenêtre est au contraire ce qu'on cherche, même si son épaule gauche est en
    amont. Jumeau de `liveInWindow` côté navigateur.
    """
    if context <= 0:
        return True
    breakout = hit.get("breakout") or {}
    end = int(hit.get("to_index") or 0)
    index = breakout.get("index")
    if index is not None:
        end = max(end, int(index))
    return end >= context


def starts_in_context(hit: dict[str, Any], context: int) -> bool:
    """La figure commence-t-elle dans le contexte ?

    Jumeau de `startsInContext` côté navigateur. Une lecture listée — donc
    achevée dans la fenêtre — dont le premier pivot est en amont : c'est le
    cas à cheval, celui qu'on badge.
    """
    if context <= 0:
        return False
    return int(hit.get("from_index") or 0) < context


def scan_bundle(
    bundle: dict[str, Any],
    *,
    only: Iterable[str] | None = None,
    limit_per_curve: int | None = None,
    **kwargs: Any,
) -> dict[str, Any]:
    """Balaie tout un bundle de courbes."""
    wanted = set(only) if only is not None else None
    hits: list[dict[str, Any]] = []
    scanned = 0
    for curve in bundle.get("curves") or []:
        if wanted is not None and curve.get("id") not in wanted:
            continue
        scanned += 1
        found = scan_curve(curve, **kwargs)
        found.sort(key=rank_key)
        hits.extend(found if limit_per_curve is None else found[:limit_per_curve])
    hits.sort(key=rank_key)
    return {
        "exported_at": bundle.get("exported_at"),
        "curve_count": scanned,
        "figures": hits,
        "summary": summarize(hits),
    }


def windows_of(
    bundle: dict[str, Any],
    *,
    size: int = 60,
    stride: int = 15,
    curve: str | None = None,
    limit: int = 4000,
) -> list[dict[str, Any]]:
    """Toutes les fenêtres du bundle, sans détection — pour la recherche.

    L'appariement DTW est quadratique : `limit` borne l'index pour que le
    bloc-croquis réponde en une seconde plutôt qu'en une minute.
    """
    out: list[dict[str, Any]] = []
    for entry in bundle.get("curves") or []:
        if curve is not None and entry.get("id") != curve:
            continue
        values = [float(v) for v in entry.get("values") or []]
        dates = list(entry.get("dates") or [])
        if len(values) < size:
            continue
        for start in window_starts(len(values), size, stride):
            stop = start + size
            out.append(
                {
                    "curve_id": entry.get("id"),
                    "variable": entry.get("variable"),
                    "label": entry.get("label"),
                    "from_index": start,
                    "to_index": stop - 1,
                    "from": dates[start] if start < len(dates) else None,
                    "to": dates[stop - 1] if stop - 1 < len(dates) else None,
                    "values": values[start:stop],
                }
            )
            if len(out) >= limit:
                return out
    return out


def outcome_stats(hits: Sequence[dict[str, Any]]) -> dict[str, Any]:
    """Part des objectifs atteints, par figure — la base du rétro-test."""
    per_figure: dict[str, dict[str, int]] = {}
    for hit in hits:
        outcome = hit.get("outcome") or {}
        row = per_figure.setdefault(
            hit["figure"], {"reached": 0, "invalidated": 0, "open": 0, "no_breakout": 0}
        )
        status = outcome.get("status", "no_breakout")
        if status in row:
            row[status] += 1
    for row in per_figure.values():
        settled = row["reached"] + row["invalidated"]
        row["settled"] = settled
        row["hit_rate"] = round(row["reached"] / settled, 4) if settled else None
    return per_figure


def windows_for_training(
    curve: dict[str, Any],
    hits: Sequence[dict[str, Any]],
    *,
    size: int = 60,
) -> list[dict[str, Any]]:
    """Fenêtres étiquetées par le détecteur — les étiquettes faibles."""
    values = [float(v) for v in curve.get("values") or []]
    dates = list(curve.get("dates") or [])
    activity = [float(a) for a in curve.get("activity") or []]
    out: list[dict[str, Any]] = []
    for hit in hits:
        if hit.get("curve_id") not in (None, curve.get("id")):
            continue
        end = hit["to_index"]
        breakout = hit.get("breakout")
        if breakout:
            end = max(end, breakout["index"])
        start = max(0, end - size + 1)
        if end - start + 1 < MIN_WINDOW:
            continue
        out.append(
            {
                "curve_id": curve.get("id"),
                "figure": hit["figure"],
                "confidence": hit["confidence"],
                "from_index": start,
                "to_index": end,
                "from": _date(dates, start),
                "to": _date(dates, end),
                "values": values[start : end + 1],
                "activity": activity[start : end + 1],
            }
        )
    return out
