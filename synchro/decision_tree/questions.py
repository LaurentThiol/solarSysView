"""Questions du flux : état juste avant le tirage t, étiquette sur t+1.

« Flux » n'est pas un objet que l'on rédige. C'est le tableau que
`build_question` fabrique, puis que `read_flux` fait couper par un arbre.
`picture` en donne une image : les lignes regroupées, la coupure
apprentissage / contrôle sur une frontière, les huit dernières lignes
en nombres exacts.

Les libellés sont partagés par le dessin, le panneau et la CLI. « Retard »
reste le retard d'une boule : un lag s'appelle « dernière ».
"""

from __future__ import annotations

from typing import Any, Sequence

import numpy as np

from synchro.analysis.common import numbers_of, ordered_draws, stars_of, weekday_of
from synchro.analysis.variables import series as extract_series
from synchro.brain_specialists.features import FEATURE_IDS, FEATURES, series_matrix, warmup_needed

QUESTIONS = ("shape", "series", "balls", "chartisme")
SHAPE_LABELS = ("sum_high", "parity_high", "n1_low")
SERIES_CHOICES = ("parity", "sum", "spread", "n1", "n2", "n3", "n4", "n5", "e1", "e2")
GAP_SERIES = ("g1", "g2", "g3", "g4")
STAR_TARGETS = ("e1", "e2")
DEFAULT_CURVES = ("sum", "spread", "parity", "n1")
SHAPE_SERIES = (
    "sum",
    "spread",
    "parity",
    "n1",
    "n2",
    "n3",
    "n4",
    "n5",
    "g1",
    "g2",
    "g3",
    "g4",
)
STAR_SERIES = ("star_sum", "e1", "e2")
SHAPE_MEASURES = ("last", "step", "slope", "z20")

SERIES_FR = {
    "sum": "somme",
    "spread": "étendue",
    "parity": "parité",
    "high_low": "haut / bas",
    "consecutive": "consécutifs",
    "centroid": "centroïde",
    "n1": "n1",
    "n2": "n2",
    "n3": "n3",
    "n4": "n4",
    "n5": "n5",
    "g1": "g1",
    "g2": "g2",
    "g3": "g3",
    "g4": "g4",
    "star_sum": "somme étoiles",
    "e1": "e1",
    "e2": "e2",
    "delay": "retard",
    "hit": "sorties",
}

MEASURE_FR = {
    "last": "dernière",
    "step": "pas",
    "slope": "pente",
    "z20": "z20",
}

LABEL_FR = {
    "sum_high": "somme haute",
    "parity_high": "parité ≥ 3",
    "n1_low": "n1 bas",
}

QUESTION_FR = {
    "shape": "Flux",
    "series": "Une série",
    "balls": "Boules",
    "chartisme": "Figures",
}


def feature_label(name: str, *, series: str | None = None) -> str:
    """Libellé court « série · mesure ». Jamais « retard » pour un lag."""
    if name in FEATURES and series:
        base = str(FEATURES[name]["label"])
        return f"{SERIES_FR.get(series, series)} · {base}"
    if name.startswith("ball."):
        measure = {
            "delay": "retard",
            "hit20": "sorties 20",
            "hit50": "sorties 50",
            "last": "dernière",
            "rsi": "RSI",
            "z20": "z20",
        }.get(name.split(".", 1)[1], name)
        return f"boule · {measure}"
    if "." in name and not name.startswith("curve_") and not name.startswith("figure_"):
        left, right = name.split(".", 1)
        return f"{SERIES_FR.get(left, left)} · {MEASURE_FR.get(right, right)}"
    plain = {
        "confidence": "confiance",
        "activity_ratio": "activité",
        "length": "longueur",
        "direction_up": "direction hausse",
        "weekday_mardi": "mardi",
    }
    if name in plain:
        return plain[name]
    if name.startswith("curve_"):
        return f"courbe · {SERIES_FR.get(name[6:], name[6:])}"
    if name.startswith("figure_"):
        return f"figure · {name[7:]}"
    if name in FEATURES:
        return str(FEATURES[name]["label"])
    return name


def class_names(question: str, label: str) -> list[str]:
    if question == "balls":
        return ["absente", "boule sortie"]
    if question == "chartisme":
        return ["invalidé", "atteint"]
    if label == "parity_high":
        return ["parité < 3", "parité ≥ 3"]
    if label == "n1_low":
        return ["n1 haut", "n1 bas"]
    if label == "sum_high":
        return ["somme basse", "somme haute"]
    return ["basse", "haute"]


def label_phrase(question: str, label: str, *, threshold: float | None = None) -> str:
    if question == "balls":
        return "la boule sort au tirage t"
    if question == "chartisme":
        return "l'objectif de la figure est atteint"
    if label == "parity_high":
        return "le tirage t a au moins 3 numéros pairs"
    if label == "n1_low":
        cut = f"{threshold:.2f}" if threshold is not None else "la médiane"
        return f"n1 du tirage t est bas (≤ {cut})"
    cut = f"{threshold:.2f}" if threshold is not None else "la médiane"
    series = SERIES_FR.get(label.replace("_high", "").replace("_low", ""), "la série")
    if question == "series":
        series = SERIES_FR.get(label, series)
        if label == "parity":
            return "la parité du tirage t est ≥ 3"
        return f"{series} du tirage t est haute (≥ {cut})"
    return f"la somme du tirage t est haute (≥ {cut})"


def _values(draws: list[dict[str, Any]], name: str) -> np.ndarray:
    payload = extract_series(draws, name)
    return np.array([float(v) for v in payload["values"]], dtype=float)


def _shape_columns(
    draws: list[dict[str, Any]], names: Sequence[str]
) -> tuple[list[str], np.ndarray]:
    from synchro.brain_specialists.features import slope, zscore

    columns: list[np.ndarray] = []
    labels: list[str] = []
    for name in names:
        values = _values(draws, name).tolist()
        last = np.array(values, dtype=float)
        step = np.full(len(values), np.nan)
        if len(values) > 1:
            step[1:] = np.diff(values)
        slope_col = np.array(
            [np.nan if v is None else float(v) for v in slope(values, 10)], dtype=float
        )
        z_col = np.array(
            [np.nan if v is None else float(v) for v in zscore(values, 20)], dtype=float
        )
        for measure, col in (
            ("last", last),
            ("step", step),
            ("slope", slope_col),
            ("z20", z_col),
        ):
            labels.append(f"{name}.{measure}")
            columns.append(col)
    if not columns:
        return [], np.zeros((len(draws), 0))
    return labels, np.column_stack(columns)


def _binary_from_raw(
    raw: np.ndarray, *, kind: str, train_end: int
) -> tuple[np.ndarray, float, str]:
    """Même règle que `_encode_y(..., task='binary')`, seuil figé sur l'apprentissage."""
    if kind in {"parity", "parity_high"}:
        return (raw >= 3.0).astype(float), 3.0, "ge"
    finite = raw[: max(train_end, 1)]
    finite = finite[np.isfinite(finite)]
    threshold = float(np.median(finite)) if finite.size else 0.0
    if kind in {"n1_low"}:
        return (raw <= threshold).astype(float), threshold, "le"
    return (raw >= threshold).astype(float), threshold, "ge"


def holdout_cut(n: int) -> int:
    """Même découpe que les spécialistes : les 100 derniers, ou 30 % si c'est court."""
    if n < 40:
        return max(1, int(n * 0.7))
    return max(20, n - 100)


def _rows_from_aligned(
    features: np.ndarray,
    raw_next: np.ndarray,
    dates: list[str],
    *,
    kind: str,
    warmup: int,
) -> dict[str, Any]:
    xs: list[np.ndarray] = []
    raws: list[float] = []
    used_dates: list[str] = []
    for t in range(warmup, len(raw_next) - 1):
        row = features[t]
        target = raw_next[t + 1]
        if not np.isfinite(row).all() or not np.isfinite(target):
            continue
        xs.append(row)
        raws.append(float(target))
        used_dates.append(dates[t + 1])
    x = np.vstack(xs) if xs else np.zeros((0, features.shape[1]))
    raw = np.array(raws, dtype=float)
    cut = holdout_cut(len(raw)) if len(raw) else 0
    y, threshold, sense = _binary_from_raw(raw, kind=kind, train_end=cut)
    return {
        "x": x,
        "y": y,
        "raw": raw,
        "dates": used_dates,
        "threshold": threshold,
        "sense": sense,
        "cut_hint": cut,
    }


def build_shape(
    draws: list[dict[str, Any]],
    *,
    label: str = "sum_high",
    include_stars: bool = True,
) -> dict[str, Any]:
    if label not in SHAPE_LABELS:
        raise ValueError(f"Étiquette inconnue: {label}. Choisir parmi {SHAPE_LABELS}.")
    rows = ordered_draws(draws)
    names = list(SHAPE_SERIES)
    if include_stars:
        names.extend(STAR_SERIES)
    feature_names, matrix = _shape_columns(rows, names)
    target_name = {"sum_high": "sum", "parity_high": "parity", "n1_low": "n1"}[label]
    raw = _values(rows, target_name)
    dates = [str(p["date"]) for p in extract_series(rows, target_name)["points"]]
    packed = _rows_from_aligned(matrix, raw, dates, kind=label, warmup=20)
    packed.update(
        {
            "question": "shape",
            "label": label,
            "series": None,
            "feature_names": feature_names,
            "class_names": class_names("shape", label),
            "class_weight": None,
            "null": "shuffle_draws",
        }
    )
    return packed


def _star_pools(draws: Sequence[dict[str, Any]]) -> set[int]:
    """Une urne manquante compte comme 12, la formule actuelle."""
    pools: set[int] = set()
    for row in draws:
        raw = row.get("star_pool")
        pools.add(int(raw) if raw is not None else 12)
    return pools


def build_series(draws: list[dict[str, Any]], *, series: str = "parity") -> dict[str, Any]:
    if series not in SERIES_CHOICES and series not in GAP_SERIES:
        raise ValueError(f"Série inconnue: {series}.")
    rows = ordered_draws(draws)
    if series in STAR_TARGETS:
        pools = _star_pools(rows)
        if len(pools) > 1:
            listed = ", ".join(str(pool) for pool in sorted(pools))
            raise ValueError(
                "e1 et e2 se lisent sur une seule urne d'étoiles. "
                f"Ces tirages mélangent les urnes {listed}."
            )
    values = _values(rows, series)
    names = list(FEATURE_IDS)
    matrix = series_matrix(values.tolist(), names)
    dates = [str(p["date"]) for p in extract_series(rows, series)["points"]]
    kind = "parity" if series == "parity" else series
    packed = _rows_from_aligned(
        matrix, values, dates, kind=kind, warmup=warmup_needed(names)
    )
    if series == "parity":
        names_cls = class_names("series", "parity_high")
    else:
        title = SERIES_FR.get(series, series)
        names_cls = [f"{title} basse", f"{title} haute"]
    packed.update(
        {
            "question": "series",
            "label": series,
            "series": series,
            "feature_names": names,
            "class_names": names_cls,
            "class_weight": None,
            "null": "shuffle_draws",
        }
    )
    return packed


def build_balls(draws: list[dict[str, Any]], *, pool: int = 50) -> dict[str, Any]:
    from synchro.brain_specialists.features import rsi, zscore

    rows = ordered_draws(draws)
    n = len(rows)
    dates = [str(p["date"]) for p in extract_series(rows, "sum")["points"]]
    feature_names = [
        "ball.delay",
        "ball.hit20",
        "ball.hit50",
        "ball.last",
        "ball.rsi",
        "ball.z20",
    ]
    pending: list[tuple[str, int, np.ndarray, float]] = []
    latest: dict[int, np.ndarray] = {}
    for ball in range(1, pool + 1):
        delay_payload = extract_series(rows, "delay", n=ball)
        hit_payload = extract_series(rows, "hit", n=ball)
        delay_v = [float(v) for v in delay_payload["values"]]
        hit_v = np.array([float(v) for v in hit_payload["values"]], dtype=float)
        rsi_v = [np.nan if v is None else float(v) for v in rsi(delay_v, 14)]
        z_v = [np.nan if v is None else float(v) for v in zscore(delay_v, 20)]
        for t in range(20, n - 1):
            window20 = hit_v[t - 19 : t + 1]
            window50 = hit_v[max(0, t - 49) : t + 1]
            row = np.array(
                [
                    delay_v[t],
                    float(np.mean(window20)),
                    float(np.mean(window50)),
                    hit_v[t],
                    rsi_v[t],
                    z_v[t],
                ],
                dtype=float,
            )
            if not np.isfinite(row).all():
                continue
            pending.append((dates[t + 1], ball, row, float(hit_v[t + 1])))
        # Dernier état connu (tirage n-1) pour noter la boule au prochain tirage.
        t = n - 1
        if t >= 20:
            window20 = hit_v[t - 19 : t + 1]
            window50 = hit_v[max(0, t - 49) : t + 1]
            last = np.array(
                [
                    delay_v[t],
                    float(np.mean(window20)),
                    float(np.mean(window50)),
                    hit_v[t],
                    rsi_v[t],
                    z_v[t],
                ],
                dtype=float,
            )
            if np.isfinite(last).all():
                latest[ball] = last
    pending.sort(key=lambda item: (item[0], item[1]))
    xs = [item[2] for item in pending]
    ys = [item[3] for item in pending]
    used_dates = [item[0] for item in pending]
    ball_ids = [item[1] for item in pending]
    x = np.vstack(xs) if xs else np.zeros((0, len(feature_names)))
    y = np.array(ys, dtype=float)
    return {
        "question": "balls",
        "label": "hit",
        "series": None,
        "x": x,
        "y": y,
        "raw": y.copy(),
        "dates": used_dates,
        "ball_ids": ball_ids,
        "latest_by_ball": latest,
        "threshold": None,
        "sense": "hit",
        "feature_names": feature_names,
        "class_names": class_names("balls", "hit"),
        "class_weight": "balanced",
        "null": "shuffle_draws",
    }


def chartisme_matrix(records: Sequence[dict[str, Any]]) -> dict[str, Any]:
    """Lignes déjà tranchées (atteint / invalidé). Pas de nouveau balayage."""
    records = sorted(records, key=lambda row: str(row.get("date") or ""))
    curves = sorted({str(row.get("curve") or "sum") for row in records})
    figures = sorted({str(row.get("figure") or "") for row in records if row.get("figure")})
    feature_names = [
        "confidence",
        "activity_ratio",
        "length",
        "direction_up",
        "weekday_mardi",
        *[f"curve_{name}" for name in curves],
        *[f"figure_{name}" for name in figures if name],
    ]
    xs: list[np.ndarray] = []
    ys: list[float] = []
    dates: list[str] = []
    for row in records:
        status = str(row.get("status") or "")
        if status not in {"reached", "invalidated"} and "y" not in row:
            continue
        y = float(row["y"]) if "y" in row else (1.0 if status == "reached" else 0.0)
        curve = str(row.get("curve") or "sum")
        figure = str(row.get("figure") or "")
        direction = str(row.get("direction") or "")
        weekday = str(row.get("weekday") or "")
        values = [
            float(row.get("confidence") or 0.0),
            float(row.get("activity_ratio") or 0.0),
            float(row.get("length") or 0.0),
            1.0 if direction == "up" else 0.0,
            1.0 if weekday in {"mardi", "tuesday"} else 0.0,
        ]
        values.extend(1.0 if curve == name else 0.0 for name in curves)
        values.extend(1.0 if figure == name else 0.0 for name in figures if name)
        xs.append(np.array(values, dtype=float))
        ys.append(y)
        dates.append(str(row.get("date") or ""))
    x = np.vstack(xs) if xs else np.zeros((0, len(feature_names)))
    y = np.array(ys, dtype=float)
    return {
        "question": "chartisme",
        "label": "reached",
        "series": None,
        "x": x,
        "y": y,
        "raw": y.copy(),
        "dates": dates,
        "threshold": None,
        "sense": "reached",
        "feature_names": feature_names,
        "class_names": class_names("chartisme", "reached"),
        "class_weight": "balanced",
        "null": "shuffle_labels",
        "records": list(records),
    }


def build_chartisme(
    draws: list[dict[str, Any]],
    *,
    curves: Sequence[str] = DEFAULT_CURVES,
    scale: int = 60,
) -> dict[str, Any]:
    from synchro.chartisme.export import build_curve
    from synchro.chartisme.figures import target_reached
    from synchro.chartisme.scan import scan_curve

    rows = ordered_draws(draws)
    records: list[dict[str, Any]] = []
    for name in curves:
        curve = build_curve(rows, name)
        hits = scan_curve(curve, scales=(int(scale),), min_confidence=0.35)
        values = curve["values"]
        dates = curve["dates"]
        for hit in hits:
            outcome = target_reached(values, hit, horizon=40)
            status = outcome.get("status")
            if status not in {"reached", "invalidated"}:
                continue
            breakout = hit.get("breakout") or {}
            end = int(hit.get("to_index") or breakout.get("index") or 0)
            start = int(hit.get("from_index") or max(0, end - scale))
            weekday = ""
            if 0 <= end < len(rows):
                weekday = str(weekday_of(rows[end]) or "")
            records.append(
                {
                    "status": status,
                    "confidence": hit.get("confidence"),
                    "activity_ratio": breakout.get("activity_ratio"),
                    "length": max(1, end - start),
                    "direction": breakout.get("direction"),
                    "curve": name,
                    "figure": hit.get("figure"),
                    "weekday": weekday,
                    "date": dates[end] if 0 <= end < len(dates) else "",
                }
            )
    if len(records) < 24:
        raise ValueError(
            f"Pas assez de figures tranchées ({len(records)}). Élargis les courbes ou l'archive."
        )
    return chartisme_matrix(records)


def build_question(
    draws: list[dict[str, Any]],
    question: str,
    *,
    label: str | None = None,
    series: str | None = None,
    include_stars: bool = True,
    curves: Sequence[str] | None = None,
    chartisme_records: Sequence[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    if question not in QUESTIONS:
        raise ValueError(f"Question inconnue: {question}.")
    if question == "shape":
        return build_shape(draws, label=label or "sum_high", include_stars=include_stars)
    if question == "series":
        return build_series(draws, series=series or "parity")
    if question == "balls":
        return build_balls(draws)
    if chartisme_records is not None:
        return chartisme_matrix(chartisme_records)
    return build_chartisme(draws, curves=tuple(curves or DEFAULT_CURVES))


def feature_labels(names: Sequence[str], *, series: str | None = None) -> dict[str, str]:
    return {name: feature_label(name, series=series) for name in names}


def catalog() -> dict[str, Any]:
    return {
        "questions": [
            {
                "id": "shape",
                "label": "Flux",
                "sentence": "Le tirage t porte-t-il la forme demandée ?",
                "labels": [
                    {"id": item, "label": LABEL_FR[item]} for item in SHAPE_LABELS
                ],
            },
            {
                "id": "series",
                "label": "Une série",
                "sentence": "Cette série sera-t-elle haute au tirage t ?",
                "series": list(SERIES_CHOICES),
            },
            {
                "id": "balls",
                "label": "Boules",
                "sentence": "Cette boule sort-elle au tirage t ?",
            },
            {
                "id": "chartisme",
                "label": "Figures",
                "sentence": "L'objectif de cette figure est-il atteint ?",
                "curves": list(DEFAULT_CURVES),
            },
        ]
    }


def band_edges(n: int, cut: int, limit: int = 64) -> list[tuple[int, int]]:
    """Blocs contigus [début, fin) qui couvrent 0..n, coupure sur une frontière."""
    if n <= 0:
        return []
    cut = min(max(int(cut), 0), n)
    if n <= limit:
        return [(index, index + 1) for index in range(n)]

    def chunks(start: int, end: int, bins: int) -> list[tuple[int, int]]:
        length = end - start
        if length <= 0 or bins <= 0:
            return []
        bins = min(int(bins), length)
        edges = [start + (index * length) // bins for index in range(bins + 1)]
        edges[-1] = end
        return [
            (edges[index], edges[index + 1])
            for index in range(bins)
            if edges[index + 1] > edges[index]
        ]

    if cut <= 0 or cut >= n:
        return chunks(0, n, limit)
    hold_bins = max(1, min(n - cut, max(1, limit - max(1, int(round(limit * cut / n))))))
    train_bins = max(1, min(cut, limit - hold_bins))
    return chunks(0, cut, train_bins) + chunks(cut, n, hold_bins)


def _feature_meta(name: str, series: str | None) -> dict[str, str]:
    label = feature_label(name, series=series)
    group = "mesure"
    measure = label
    if name.startswith("ball."):
        group = "boule"
        measure = label.split(" · ", 1)[-1]
    elif name.startswith("curve_"):
        group = "courbe"
        measure = label.split(" · ", 1)[-1]
    elif name.startswith("figure_"):
        group = "figure"
        measure = name[7:] or label
    elif "." in name:
        left, right = name.split(".", 1)
        group = SERIES_FR.get(left, left)
        measure = MEASURE_FR.get(right, right)
    elif series:
        group = SERIES_FR.get(series, series)
        measure = label.split(" · ", 1)[-1] if " · " in label else label
    return {"name": name, "label": label, "group": group, "measure": measure}


def _round_num(value: Any, digits: int = 4) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if number != number or number in {float("inf"), float("-inf")}:
        return None
    return round(number, digits)


def _column_mean(column: np.ndarray) -> float | None:
    finite = column[np.isfinite(column)]
    if finite.size == 0:
        return None
    return round(float(finite.mean()), 4)


def picture(packed: dict[str, Any], *, limit: int = 64, tail: int = 8) -> dict[str, Any]:
    """Image du tableau : blocs de lignes, coupure du contrôle, dernières lignes."""
    names = [str(name) for name in packed.get("feature_names") or []]
    series = packed.get("series")
    x = np.asarray(packed.get("x"), dtype=float)
    y = np.asarray(packed.get("y"), dtype=float).reshape(-1)
    raw = np.asarray(packed.get("raw", y), dtype=float).reshape(-1)
    if x.ndim == 1:
        x = x.reshape(-1, 1)
    if x.size == 0:
        x = np.zeros((0, len(names)))
    n = int(y.shape[0])
    if x.shape[0] != n:
        n = min(n, int(x.shape[0]))
        x = x[:n]
        y = y[:n]
    if raw.shape[0] < n:
        padded = np.full(n, np.nan)
        padded[: raw.shape[0]] = raw
        raw = padded
    else:
        raw = raw[:n]
    if x.shape[1] != len(names):
        width = min(int(x.shape[1]), len(names)) if names else int(x.shape[1])
        names = names[:width] or [f"c{index}" for index in range(width)]
        x = x[:, : len(names)]
    dates = [str(item) for item in (packed.get("dates") or [])]
    if len(dates) < n:
        dates = dates + [""] * (n - len(dates))
    ball_ids = packed.get("ball_ids")
    cut = holdout_cut(n) if n else 0
    edges = band_edges(n, cut, limit)
    bands: list[dict[str, Any]] = []
    for start, end in edges:
        bands.append(
            {
                "start": start,
                "end": end,
                "n": end - start,
                "from": dates[start],
                "to": dates[end - 1],
                "holdout": start >= cut,
                "y": _column_mean(y[start:end]),
                "values": [_column_mean(x[start:end, index]) for index in range(len(names))],
            }
        )
    cut_band = next((index for index, band in enumerate(bands) if band["holdout"]), None)
    tail_rows: list[dict[str, Any]] = []
    begin = max(0, n - max(int(tail), 0))
    for index in range(begin, n):
        ball = None
        if isinstance(ball_ids, list) and index < len(ball_ids):
            ball = int(ball_ids[index])
        tail_rows.append(
            {
                "index": index,
                "date": dates[index],
                "ball": ball,
                "y": _round_num(y[index], 0),
                "raw": _round_num(raw[index] if index < len(raw) else None),
                "holdout": index >= cut,
                "values": [_round_num(x[index, column]) for column in range(len(names))],
            }
        )
    question = str(packed.get("question") or "")
    label = packed.get("label")
    threshold = packed.get("threshold")
    threshold_num = _round_num(threshold, 6) if threshold is not None else None
    open_rows: list[dict[str, Any]] = []
    latest = packed.get("latest_by_ball") or {}
    if isinstance(latest, dict) and latest:
        for ball in sorted(latest, key=lambda item: int(item)):
            row = np.asarray(latest[ball], dtype=float).reshape(-1)
            open_rows.append(
                {
                    "ball": int(ball),
                    "values": [_round_num(row[index]) if index < row.size else None for index in range(len(names))],
                }
            )
    return {
        "question": question,
        "label": None if label is None else str(label),
        "series": None if series is None else str(series),
        "phrase": label_phrase(question, str(label or ""), threshold=threshold_num),
        "class_names": [str(name) for name in (packed.get("class_names") or [])],
        "rows": n,
        "columns": len(names),
        "train_n": cut if n else 0,
        "holdout_n": max(0, n - cut),
        "threshold": threshold_num,
        "sense": packed.get("sense"),
        "from_date": dates[0] if n else None,
        "to_date": dates[n - 1] if n else None,
        "features": [_feature_meta(name, None if series is None else str(series)) for name in names],
        "bands": bands,
        "cut_band": cut_band,
        "tail": tail_rows,
        "open": {"rows": open_rows} if open_rows else None,
    }


_PICTURES: dict[tuple[Any, ...], dict[str, Any]] = {}


def _picture_key(
    draws: list[dict[str, Any]],
    question: str,
    *,
    label: str | None,
    series: str | None,
    include_stars: bool,
    curves: Sequence[str] | None,
) -> tuple[Any, ...]:
    count = len(draws)
    probe = 0
    if count:
        step = max(1, count // 16)
        for index in range(0, count, step):
            numbers = draws[index].get("numbers") or [0]
            probe = (probe * 131 + int(numbers[0] or 0)) % 1_000_003
    def _stamp_date(draw: dict[str, Any]) -> str:
        return str(draw.get("draw_date") or draw.get("date") or "")

    head = _stamp_date(draws[0]) if count else ""
    last = _stamp_date(draws[-1]) if count else ""
    return (
        question,
        label,
        series,
        bool(include_stars),
        tuple(curves or ()),
        count,
        head,
        last,
        probe,
    )


def question_picture(
    draws: list[dict[str, Any]],
    question: str,
    *,
    label: str | None = None,
    series: str | None = None,
    include_stars: bool = True,
    curves: Sequence[str] | None = None,
    chartisme_records: Sequence[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Tableau de `build_question`, mis en image. Le cache évite de le refabriquer."""
    key = _picture_key(
        draws,
        question,
        label=label,
        series=series,
        include_stars=include_stars,
        curves=curves,
    )
    if chartisme_records is None and key in _PICTURES:
        return _PICTURES[key]
    packed = build_question(
        draws,
        question,
        label=label,
        series=series,
        include_stars=include_stars,
        curves=curves,
        chartisme_records=chartisme_records,
    )
    view = picture(packed)
    if chartisme_records is None:
        _PICTURES[key] = view
        while len(_PICTURES) > 8:
            _PICTURES.pop(next(iter(_PICTURES)))
    return view


def draw_numbers(draw: dict[str, Any]) -> list[int]:
    return [int(n) for n in numbers_of(draw)]


def draw_stars(draw: dict[str, Any]) -> list[int]:
    return [int(n) for n in stars_of(draw)]
