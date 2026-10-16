"""Comptage de boîtes d’un masque et d’un relief.

Le masque est une image binaire (tirages × cases). Le relief est le graphe
du compteur sur la même grille : une surface plate a pour dimension 2, une
surface qui remplit son volume tend vers 3. Les échelles sont des puissances
de 2. Le petit côté doit encore contenir au moins quatre boîtes.
"""

from __future__ import annotations

from typing import Any

import numpy as np

NULL_REPEATS = 32
MIN_SCALES = 4
MIN_RATIO = 8.0
MAX_SLOPE_SPREAD = 0.15
MIN_R2 = 0.99
FRACTION_GAP = 0.05


def scales_for(shape: tuple[int, int]) -> np.ndarray:
    """Puissances de 2, de 2 jusqu’au plus grand côté qui laisse quatre boîtes."""
    short = min(int(shape[0]), int(shape[1]))
    limit = short // 4
    scales: list[int] = []
    scale = 2
    while scale <= limit:
        scales.append(scale)
        scale *= 2
    return np.asarray(scales, dtype=int)


def binary_box_count(mask: np.ndarray) -> dict[str, Any]:
    """Dimension du masque booléen. Masque vide : pas de dimension."""
    grid = np.asarray(mask, dtype=bool)
    if grid.ndim != 2:
        raise ValueError("Le masque est une grille.")
    occupied = int(grid.sum())
    if occupied == 0 or grid.shape[0] < 2 or grid.shape[1] < 2:
        return _empty_fit()
    sat = np.zeros((grid.shape[0] + 1, grid.shape[1] + 1), dtype=np.int64)
    sat[1:, 1:] = np.cumsum(np.cumsum(grid, axis=0, dtype=np.int64), axis=1)
    scales = scales_for(grid.shape)
    counted = [_min_occupied(sat, int(scale)) for scale in scales]
    return _fit_counts(scales, counted, saturate_at=occupied)


def surface_box_count(height: np.ndarray) -> dict[str, Any]:
    """Comptage différentiel du relief. Champ constant : dimension 2.

    Dans une boîte de côté s, la contribution est (max − min) / h + 1.
    h vaut s fois l’étendue du compteur, ramenée au petit côté. Sans la
    troncature entière : elle ferait passer une pente douce d’un cran
    entre deux échelles et tirerait la dimension sous 2.
    """
    grid = np.asarray(height, dtype=float)
    if grid.ndim != 2:
        raise ValueError("Le relief est une grille.")
    if grid.shape[0] < 2 or grid.shape[1] < 2:
        return _empty_fit()
    if not np.isfinite(grid).all():
        raise ValueError("Le relief contient une valeur non finie.")
    span = float(grid.max() - grid.min())
    short = float(min(grid.shape))
    scales = scales_for(grid.shape)
    counted = [_min_surface(grid, int(scale), span, short) for scale in scales]
    return _fit_counts(scales, counted, saturate_at=int(grid.size))


def column_shuffle(height: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """Permute les cases dans chaque tirage. Les valeurs du tirage restent."""
    values = np.asarray(height, dtype=float)
    if values.ndim != 2:
        raise ValueError("Le mélange attend une grille.")
    keys = rng.random(values.shape)
    order = np.argsort(keys, axis=1, kind="stable")
    return np.take_along_axis(values, order, axis=1)


def fractal_report(
    height: np.ndarray,
    floor: float,
    rng: np.random.Generator | None = None,
) -> dict[str, Any]:
    """Masque au-dessus du plancher, relief, et écart à 32 mélanges."""
    grid = np.asarray(height, dtype=float)
    if grid.ndim != 2 or grid.shape[0] < 2 or grid.shape[1] < 2:
        raise ValueError("La grille a besoin d’au moins deux tirages et deux cases.")
    if not np.isfinite(grid).all():
        raise ValueError("La grille contient une valeur non finie.")
    level = float(floor)
    if not np.isfinite(level):
        raise ValueError("Plancher non fini.")
    generator = np.random.default_rng(0) if rng is None else rng
    mask_fit = binary_box_count(grid >= level)
    relief_fit = surface_box_count(grid)
    mask_null: list[float] = []
    relief_null: list[float] = []
    for _ in range(NULL_REPEATS):
        shuffled = column_shuffle(grid, generator)
        mask_dimension = binary_box_count(shuffled >= level)["dimension"]
        relief_dimension = surface_box_count(shuffled)["dimension"]
        if mask_dimension is not None:
            mask_null.append(float(mask_dimension))
        if relief_dimension is not None:
            relief_null.append(float(relief_dimension))
    mask_gap = _null_stats(mask_null, mask_fit["dimension"])
    relief_gap = _null_stats(relief_null, relief_fit["dimension"])
    return {
        "mask": mask_fit,
        "relief": relief_fit,
        "null": {"mask": mask_gap, "relief": relief_gap},
        "floor": level,
        "shape": [int(grid.shape[0]), int(grid.shape[1])],
        "phrase": _phrase(mask_fit, relief_fit, mask_gap, relief_gap),
    }


def _segments(length: int, scale: int, offset: int) -> list[tuple[int, int]]:
    if length <= 0:
        return []
    cuts: list[tuple[int, int]] = []
    if offset > 0:
        cuts.append((0, min(offset, length)))
    start = offset if offset < length else length
    while start < length:
        cuts.append((start, min(start + scale, length)))
        start += scale
    return cuts


def _offsets(scale: int) -> list[int]:
    """Origine alignée, puis un décalage d’une demi-boîte."""
    picked = [0]
    half = scale // 2
    if 0 < half < scale:
        picked.append(half)
    return picked


def _min_occupied(sat: np.ndarray, scale: int) -> tuple[int, int]:
    height = sat.shape[0] - 1
    width = sat.shape[1] - 1
    best: int | None = None
    footprint = 0
    for ox in _offsets(scale):
        xseg = _segments(height, scale, ox)
        for oy in _offsets(scale):
            yseg = _segments(width, scale, oy)
            count = _occupied(sat, xseg, yseg)
            if best is None or count < best:
                best = count
                footprint = len(xseg) * len(yseg)
    return int(best or 0), int(footprint)


def _occupied(
    sat: np.ndarray,
    xseg: list[tuple[int, int]],
    yseg: list[tuple[int, int]],
) -> int:
    if not xseg or not yseg:
        return 0
    x0 = np.fromiter((start for start, _ in xseg), dtype=np.int64)
    x1 = np.fromiter((stop for _, stop in xseg), dtype=np.int64)
    y0 = np.fromiter((start for start, _ in yseg), dtype=np.int64)
    y1 = np.fromiter((stop for _, stop in yseg), dtype=np.int64)
    total = (
        sat[np.ix_(x1, y1)]
        - sat[np.ix_(x0, y1)]
        - sat[np.ix_(x1, y0)]
        + sat[np.ix_(x0, y0)]
    )
    return int(np.count_nonzero(total))


def _min_surface(grid: np.ndarray, scale: int, span: float, short: float) -> tuple[float, int]:
    best: float | None = None
    footprint = 0
    for ox in _offsets(scale):
        xseg = _segments(grid.shape[0], scale, ox)
        for oy in _offsets(scale):
            yseg = _segments(grid.shape[1], scale, oy)
            count = _surface_count(grid, xseg, yseg, scale, span, short)
            if best is None or count < best:
                best = count
                footprint = len(xseg) * len(yseg)
    return float(best or 0.0), int(footprint)


def _surface_count(
    grid: np.ndarray,
    xseg: list[tuple[int, int]],
    yseg: list[tuple[int, int]],
    scale: int,
    span: float,
    short: float,
) -> float:
    if not xseg or not yseg:
        return 0.0
    maxima, minima = _box_extents(grid, xseg, yseg)
    if span == 0.0 or not np.isfinite(span):
        return float(maxima.size)
    step = scale * span / short
    if step == 0.0:
        return float(maxima.size)
    # (max-min)/h + 1, sans troncature : un plan échantillonné reste à 2.
    # floor() fait sauter la contribution d’un cran entre deux échelles
    # et tire une pente lisse sous 2.
    return float(np.sum((maxima - minima) / step + 1.0))


def _box_extents(
    grid: np.ndarray,
    xseg: list[tuple[int, int]],
    yseg: list[tuple[int, int]],
) -> tuple[np.ndarray, np.ndarray]:
    xgroups: dict[int, list[int]] = {}
    ygroups: dict[int, list[int]] = {}
    for start, stop in xseg:
        xgroups.setdefault(stop - start, []).append(start)
    for start, stop in yseg:
        ygroups.setdefault(stop - start, []).append(start)
    maxima: list[np.ndarray] = []
    minima: list[np.ndarray] = []
    for xlen, xstarts in xgroups.items():
        xindex = np.asarray(xstarts, dtype=np.int64)[:, None] + np.arange(xlen, dtype=np.int64)[None, :]
        stacked = grid[xindex]
        for ylen, ystarts in ygroups.items():
            yindex = np.asarray(ystarts, dtype=np.int64)[:, None] + np.arange(ylen, dtype=np.int64)[None, :]
            blocks = np.moveaxis(stacked[:, :, yindex], 2, 1)
            maxima.append(blocks.max(axis=(2, 3)).ravel())
            minima.append(blocks.min(axis=(2, 3)).ravel())
    if not maxima:
        empty = np.empty(0, dtype=float)
        return empty, empty
    return np.concatenate(maxima), np.concatenate(minima)


def _empty_fit() -> dict[str, Any]:
    return _fit_payload(None, None, None, [], [], [], False, None, None)


def _fit_counts(
    scales: np.ndarray,
    counted: list[tuple[float, int]],
    saturate_at: int,
) -> dict[str, Any]:
    kept_scales: list[int] = []
    kept_counts: list[float] = []
    kept_feet: list[int] = []
    for scale, (count, footprint) in zip(scales.tolist(), counted, strict=True):
        if count <= 1.0 or abs(count - saturate_at) <= 1e-6 or footprint <= 0:
            continue
        kept_scales.append(int(scale))
        kept_counts.append(float(count))
        kept_feet.append(int(footprint))
    if len(kept_scales) < 2:
        return _empty_fit()
    order = np.argsort(np.asarray(kept_scales))
    kept_scales = [kept_scales[int(i)] for i in order]
    kept_counts = [kept_counts[int(i)] for i in order]
    kept_feet = [kept_feet[int(i)] for i in order]
    x = np.log(1.0 / np.asarray(kept_scales, dtype=float))
    # N / empreinte retire le rectangle. Une nappe plate ou pleine reste à 2
    # même quand le petit côté n’est pas divisible par l’échelle.
    y = np.log(np.asarray(kept_counts, dtype=float) / np.asarray(kept_feet, dtype=float))
    if len(kept_scales) >= 4:
        coeff, covariance = np.polyfit(x, y, 1, cov=True)
        stderr = float(np.sqrt(max(float(covariance[0, 0]), 0.0)))
        if not np.isfinite(stderr):
            stderr = None
    else:
        coeff = np.polyfit(x, y, 1)
        stderr = None
    excess = float(coeff[0])
    dimension = 2.0 + excess
    intercept = float(coeff[1])
    predicted = excess * x + intercept
    residual = float(np.sum((y - predicted) ** 2))
    total = float(np.sum((y - y.mean()) ** 2))
    r_squared = 1.0 if total == 0.0 else 1.0 - residual / total
    local = np.diff(y) / np.diff(x) + 2.0
    local_slopes = [float(value) for value in local]
    spread = float(local.max() - local.min()) if local.size else None
    ratio = float(kept_scales[-1] / kept_scales[0])
    fractional = abs(dimension - round(dimension)) >= FRACTION_GAP
    sufficient = bool(
        len(kept_scales) >= MIN_SCALES
        and ratio >= MIN_RATIO
        and r_squared > MIN_R2
        and spread is not None
        and spread < MAX_SLOPE_SPREAD
        and fractional
    )
    return _fit_payload(
        dimension,
        stderr,
        float(r_squared),
        kept_scales,
        kept_counts,
        local_slopes,
        sufficient,
        ratio,
        spread,
    )


def _fit_payload(
    dimension: float | None,
    stderr: float | None,
    r_squared: float | None,
    scales: list[int],
    counts: list[int],
    local_slopes: list[float],
    sufficient: bool,
    scale_ratio: float | None,
    slope_spread: float | None,
) -> dict[str, Any]:
    return {
        "dimension": dimension,
        "stderr": stderr,
        "r_squared": r_squared,
        "scales": scales,
        "counts": [int(round(count)) for count in counts],
        "local_slopes": local_slopes,
        "sufficient": sufficient,
        "n_scales": len(scales),
        "scale_ratio": scale_ratio,
        "slope_spread": slope_spread,
    }


def _null_stats(values: list[float], observed: float | None) -> dict[str, Any]:
    if not values:
        return {"mean": None, "std": None, "delta": None, "count": 0}
    mean = float(np.mean(values))
    std = float(np.std(values, ddof=1)) if len(values) > 1 else 0.0
    delta = None if observed is None else float(observed - mean)
    return {"mean": mean, "std": std, "delta": delta, "count": len(values)}


def _fmt(value: float | None, digits: int) -> str:
    if value is None or not np.isfinite(value):
        return "—"
    text = f"{value:.{digits}f}".replace(".", ",")
    if text.startswith("-"):
        return "−" + text[1:]
    return text


def _reason(fit: dict[str, Any]) -> str:
    if fit["dimension"] is None or fit["n_scales"] < MIN_SCALES:
        return "L’axe des cases est trop court."
    ratio = fit["scale_ratio"]
    if ratio is None or ratio < MIN_RATIO:
        return "L’axe des cases est trop court."
    r_squared = fit["r_squared"]
    if r_squared is None or r_squared <= MIN_R2:
        return "L’ajustement ne tient pas."
    spread = fit["slope_spread"]
    if spread is None or spread >= MAX_SLOPE_SPREAD:
        return "La pente change d’échelle."
    return "La dimension est entière."


def _reading(name: str, fit: dict[str, Any], gap: dict[str, Any], kind: str) -> str:
    if fit["dimension"] is None:
        sentence = f"{name} : pas de pente. Pas de régime fractal. {_reason(fit)}"
    else:
        uncertainty = "" if fit["stderr"] is None else f" ± {_fmt(fit['stderr'], 2)}"
        scales = fit["scales"]
        span = f"{scales[0]} à {scales[-1]}" if scales else "—"
        if fit["sufficient"]:
            sentence = (
                f"{name} : dimension fractale {_fmt(fit['dimension'], 2)}{uncertainty}, "
                f"R² {_fmt(fit['r_squared'], 3)}, {fit['n_scales']} échelles de {span}. "
                "La pente tient."
            )
        else:
            sentence = (
                f"{name} : dimension {_fmt(fit['dimension'], 2)}{uncertainty}, "
                f"R² {_fmt(fit['r_squared'], 3)}, {fit['n_scales']} échelles de {span}. "
                f"Pas de régime fractal. {_reason(fit)}"
            )
    delta = gap.get("delta")
    if delta is None or abs(float(delta)) < 0.05:
        return sentence
    if kind == "mask":
        tail = (
            "Les hauts se regroupent par rapport au mélange."
            if delta < 0
            else "Les hauts sont plus dispersés que le mélange."
        )
    else:
        tail = (
            "Le relief est plus lisse que le mélange."
            if delta < 0
            else "Le relief est plus rugueux que le mélange."
        )
    return f"{sentence} Écart au mélange {_fmt(float(delta), 2)}. {tail}"


def _phrase(
    mask_fit: dict[str, Any],
    relief_fit: dict[str, Any],
    mask_gap: dict[str, Any],
    relief_gap: dict[str, Any],
) -> str:
    mask = _reading("Masque", mask_fit, mask_gap, "mask")
    relief = _reading("Relief", relief_fit, relief_gap, "relief")
    return f"{mask} {relief}"
