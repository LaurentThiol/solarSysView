"""Questions du flux : état juste avant le tirage t, étiquette sur t+1.

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
SERIES_CHOICES = ("parity", "sum", "spread", "n1")
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


def build_series(draws: list[dict[str, Any]], *, series: str = "parity") -> dict[str, Any]:
    if series not in ("parity", "sum", "spread", "n1", "n2", "n3", "n4", "n5", "g1", "g2", "g3", "g4"):
        raise ValueError(f"Série inconnue: {series}.")
    rows = ordered_draws(draws)
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


def draw_numbers(draw: dict[str, Any]) -> list[int]:
    return [int(n) for n in numbers_of(draw)]


def draw_stars(draw: dict[str, Any]) -> list[int]:
    return [int(n) for n in stars_of(draw)]
