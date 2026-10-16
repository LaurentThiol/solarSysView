"""Lectures d’un relief de compteurs.

L’aire compare les triangles du maillage à une nappe plate, dans le
repère de la vue. La rugosité est un variogramme des compteurs, sans
ce repère. Le comptage de cubes reste disponible : il n’est une
dimension que si la pente tient sur assez d’échelles.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Any

import numpy as np

NULL_REPEATS = 32
MIN_SCALES = 4
MIN_RATIO = 8.0
MAX_SLOPE_SPREAD = 0.15
MIN_R2 = 0.99
FRACTION_GAP = 0.05
# Repère du relief. Identique à X_SPAN, Z_SPAN, Y_GAIN dans
# src/components/proba-dynamic/counter-map.tsx.
X_SPAN = 2.4
Z_SPAN = 1.15
Y_GAIN = 1.15


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


def mesh_scales(n_draws: int, n_slots: int) -> np.ndarray:
    """Côtés de cube : du pas du maillage jusqu’au quart du petit côté."""
    if n_draws < 2 or n_slots < 2:
        return np.asarray([], dtype=float)
    step = max(X_SPAN / (n_draws - 1), Z_SPAN / (n_slots - 1))
    limit = min(X_SPAN, Z_SPAN) / 4.0
    scales: list[float] = []
    eps = float(step)
    while eps <= limit * (1.0 + 1e-9) and len(scales) < 16:
        scales.append(eps)
        eps *= 2.0
    return np.asarray(scales, dtype=float)


def mesh_box_count(height: np.ndarray) -> dict[str, Any]:
    """Cubes sur les triangles du relief, dans le repère de la vue.

    Chaque facette est le même couple de triangles que le canvas.
    Dans une colonne de côté ε, la contribution est (max − min) / ε + 1 :
    l’intérieur de la facette compte, pas seulement ses sommets. Une nappe
    plate reste à 2. Le minimum est pris sur l’origine et un décalage d’un
    demi-cube.
    """
    grid = np.asarray(height, dtype=float)
    if grid.ndim != 2:
        raise ValueError("Le relief est une grille.")
    if grid.shape[0] < 2 or grid.shape[1] < 2:
        return _empty_fit()
    if not np.isfinite(grid).all():
        raise ValueError("Le relief contient une valeur non finie.")
    scales = mesh_scales(int(grid.shape[0]), int(grid.shape[1]))
    counted = [_min_mesh(grid, float(eps)) for eps in scales.tolist()]
    return _fit_counts(scales, counted, saturate_at=-1, integral_scales=False)


def _vec_norm(x: np.ndarray, y: np.ndarray, z: np.ndarray) -> np.ndarray:
    return np.sqrt(x * x + y * y + z * z)


def mesh_area_ratio(height: np.ndarray) -> dict[str, Any]:
    """Aire des triangles du relief, divisée par l’aire de la nappe plate.

    Les facettes sont les deux triangles du canvas. Une nappe plate vaut 1.
    """
    grid = np.asarray(height, dtype=float)
    if grid.ndim != 2:
        raise ValueError("Le relief est une grille.")
    if grid.shape[0] < 2 or grid.shape[1] < 2:
        raise ValueError("La grille a besoin d’au moins deux tirages et deux cases.")
    if not np.isfinite(grid).all():
        raise ValueError("Le relief contient une valeur non finie.")
    draws, slots = grid.shape
    dx = X_SPAN / (draws - 1)
    dz = Z_SPAN / (slots - 1)
    y = grid * Y_GAIN
    dy_ac = y[1:, :-1] - y[:-1, :-1]
    dy_ab = y[:-1, 1:] - y[:-1, :-1]
    area_acb = 0.5 * _vec_norm(dy_ac * dz, dx * dz, dx * dy_ab)
    y_b = y[:-1, 1:]
    y_c = y[1:, :-1]
    y_d = y[1:, 1:]
    dy_bc = y_c - y_b
    dy_bd = y_d - y_b
    area_bcd = 0.5 * _vec_norm(dz * dy_bd, dx * dz, dx * (dy_bd - dy_bc))
    mesh = float(np.sum(area_acb) + np.sum(area_bcd))
    flat = float(X_SPAN * Z_SPAN)
    return {"ratio": mesh / flat, "mesh": mesh, "flat": flat}


def variogram_roughness(height: np.ndarray) -> dict[str, Any]:
    """Rugosité des compteurs. 0 : lisse. 1 : aussi rugueux que le pas.

    γ(h) est la moyenne des carrés d’écarts, à parts égales entre l’axe
    des tirages et l’axe des cases. L’exposant local compare h = 1 et
    h = 2. La pente sur 1, 2, 4… n’est un régime que si le log-log est droit.
    """
    grid = np.asarray(height, dtype=float)
    if grid.ndim != 2:
        raise ValueError("Le relief est une grille.")
    if grid.shape[0] < 2 or grid.shape[1] < 2:
        raise ValueError("La grille a besoin d’au moins deux tirages et deux cases.")
    if not np.isfinite(grid).all():
        raise ValueError("Le relief contient une valeur non finie.")
    lags = _variogram_lags(grid.shape)
    kept_lags: list[int] = []
    gammas: list[float] = []
    for lag in lags:
        gamma = _gamma_at(grid, lag)
        if gamma is None or gamma <= 0.0 or not np.isfinite(gamma):
            continue
        kept_lags.append(lag)
        gammas.append(gamma)
    if not kept_lags:
        return _rough_payload(0.0, None, None, None, [], [], False, None, None, None, flat=True)
    local_slope = None
    exponent = None
    if len(kept_lags) >= 2:
        local_slope = float(
            (np.log(gammas[1]) - np.log(gammas[0])) / (np.log(kept_lags[1]) - np.log(kept_lags[0]))
        )
        exponent = _clamp_roughness(local_slope)
    fit_exponent = None
    stderr = None
    r_squared = None
    spread = None
    ratio = None
    sufficient = False
    if len(kept_lags) >= 2:
        slope, stderr, r_squared, spread, ratio, sufficient = _power_fit(kept_lags, gammas)
        fit_exponent = _clamp_roughness(slope)
    return _rough_payload(
        exponent,
        local_slope,
        fit_exponent,
        stderr,
        kept_lags,
        gammas,
        sufficient,
        r_squared,
        spread,
        ratio,
        flat=False,
    )


def fractal_report(
    height: np.ndarray,
    _floor: float | None = None,
    rng: np.random.Generator | None = None,
) -> dict[str, Any]:
    """Aire, rugosité, cubes, et écart à 32 mélanges de cases.

    Le plancher translucide de la vue ne coupe pas ces lectures : `_floor`
    est ignoré. La phrase cite l’aire et la rugosité.
    """
    grid = np.asarray(height, dtype=float)
    if grid.ndim != 2 or grid.shape[0] < 2 or grid.shape[1] < 2:
        raise ValueError("La grille a besoin d’au moins deux tirages et deux cases.")
    if not np.isfinite(grid).all():
        raise ValueError("La grille contient une valeur non finie.")
    generator = np.random.default_rng(0) if rng is None else rng
    area = mesh_area_ratio(grid)
    rough = variogram_roughness(grid)
    surface = mesh_box_count(grid)
    area_null: list[float] = []
    rough_null: list[float] = []
    surface_null: list[float] = []
    for _ in range(NULL_REPEATS):
        shuffled = column_shuffle(grid, generator)
        area_null.append(float(mesh_area_ratio(shuffled)["ratio"]))
        exponent = variogram_roughness(shuffled)["exponent"]
        if exponent is not None:
            rough_null.append(float(exponent))
        dimension = mesh_box_count(shuffled)["dimension"]
        if dimension is not None:
            surface_null.append(float(dimension))
    area_gap = _null_stats(area_null, area["ratio"])
    rough_gap = _null_stats(rough_null, rough["exponent"])
    surface_gap = _null_stats(surface_null, surface["dimension"])
    return {
        "area": area,
        "roughness": rough,
        "surface": surface,
        "null": {"area": area_gap, "roughness": rough_gap, "surface": surface_gap},
        "shape": [int(grid.shape[0]), int(grid.shape[1])],
        "phrase": _phrase(area, area_gap, rough, rough_gap),
    }


def _min_mesh(grid: np.ndarray, eps: float) -> tuple[float, int]:
    best: float | None = None
    footprint = 0
    for ox, oz in ((0.0, 0.0), (eps * 0.5, eps * 0.5)):
        boxes, foot = _mesh_measure(grid, eps, ox, oz)
        if best is None or boxes < best:
            best = boxes
            footprint = foot
    return float(best or 0.0), int(footprint)


def _mesh_measure(grid: np.ndarray, eps: float, ox: float, oz: float) -> tuple[float, int]:
    pattern = _mesh_pattern(int(grid.shape[0]), int(grid.shape[1]), float(eps), float(ox), float(oz))
    bin_i, bin_j, v0, v1, v2, w0, w1, w2, nx, nz = pattern
    if nx == 0 or nz == 0 or v0.size == 0:
        return 0.0, 0
    flat = grid.ravel()
    samples = Y_GAIN * (w0 * flat[v0] + w1 * flat[v1] + w2 * flat[v2])
    ymin = np.full((nx, nz), np.inf)
    ymax = np.full((nx, nz), -np.inf)
    np.minimum.at(ymin, (bin_i, bin_j), samples)
    np.maximum.at(ymax, (bin_i, bin_j), samples)
    occupied = np.isfinite(ymin)
    if not np.any(occupied):
        return 0.0, 0
    span = np.maximum(ymax[occupied] - ymin[occupied], 0.0)
    return float(np.sum(span / eps + 1.0)), int(np.count_nonzero(occupied))


@lru_cache(maxsize=64)
def _mesh_pattern(
    n_draws: int,
    n_slots: int,
    eps: float,
    ox: float,
    oz: float,
) -> tuple[np.ndarray, ...]:
    """Échantillons où le min et le max d’un triangle dans une colonne sont atteints.

    Sommets, croisements d’arêtes avec les faces des cubes, et coins de cubes
    tombés à l’intérieur d’une facette. La diagonale est celle du canvas :
    (tirage, case+1) — (tirage+1, case).
    """
    dx = X_SPAN / (n_draws - 1)
    dz = Z_SPAN / (n_slots - 1)
    lo_x = int(np.floor(-ox / eps))
    hi_x = int(np.floor((X_SPAN - ox) / eps - 1e-9))
    lo_z = int(np.floor(-oz / eps))
    hi_z = int(np.floor((Z_SPAN - oz) / eps - 1e-9))
    nx = hi_x - lo_x + 1
    nz = hi_z - lo_z + 1
    empty_i = np.empty(0, dtype=np.int64)
    empty_f = np.empty(0, dtype=float)
    blank = (empty_i, empty_i, empty_i, empty_i, empty_i, empty_f, empty_f, empty_f, 0, 0)
    if nx <= 0 or nz <= 0:
        return blank

    bin_i: list[np.ndarray] = []
    bin_j: list[np.ndarray] = []
    v0s: list[np.ndarray] = []
    v1s: list[np.ndarray] = []
    v2s: list[np.ndarray] = []
    w0s: list[np.ndarray] = []
    w1s: list[np.ndarray] = []
    w2s: list[np.ndarray] = []

    def add(
        px: np.ndarray,
        pz: np.ndarray,
        v0: np.ndarray,
        v1: np.ndarray,
        v2: np.ndarray,
        w0: np.ndarray,
        w1: np.ndarray,
        w2: np.ndarray,
    ) -> None:
        if px.size == 0:
            return
        sx = (px - ox) / eps
        sz = (pz - oz) / eps
        ix = np.floor(sx).astype(np.int64)
        iz = np.floor(sz).astype(np.int64)
        x_on = (np.abs(sx - np.round(sx)) < 1e-6) & (sx > 1e-6)
        z_on = (np.abs(sz - np.round(sz)) < 1e-6) & (sz > 1e-6)

        def push(ixs: np.ndarray, izs: np.ndarray, mask: np.ndarray) -> None:
            if not np.any(mask):
                return
            chosen = np.flatnonzero(mask)
            bi = ixs[mask] - lo_x
            bj = izs[mask] - lo_z
            ok = (bi >= 0) & (bi < nx) & (bj >= 0) & (bj < nz)
            if not np.any(ok):
                return
            picked = chosen[ok]
            bin_i.append(bi[ok])
            bin_j.append(bj[ok])
            v0s.append(v0[picked])
            v1s.append(v1[picked])
            v2s.append(v2[picked])
            w0s.append(w0[picked])
            w1s.append(w1[picked])
            w2s.append(w2[picked])

        push(ix, iz, np.ones(px.size, dtype=bool))
        push(ix - 1, iz, x_on)
        push(ix, iz - 1, z_on)
        push(ix - 1, iz - 1, x_on & z_on)

    def zeros(n: int) -> np.ndarray:
        return np.zeros(n, dtype=float)

    def ones(n: int) -> np.ndarray:
        return np.ones(n, dtype=float)

    ii, jj = np.meshgrid(np.arange(n_draws), np.arange(n_slots), indexing="ij")
    vid = (ii * n_slots + jj).ravel()
    add(
        (ii * dx).ravel(),
        (jj * dz).ravel(),
        vid,
        vid,
        vid,
        ones(vid.size),
        zeros(vid.size),
        zeros(vid.size),
    )

    i = np.arange(n_draws - 1)
    x_left = i * dx
    k_x = np.floor((x_left - ox) / eps).astype(np.int64) + 1
    xb = ox + k_x.astype(float) * eps
    t_x = (xb - x_left) / dx
    cross_x = (t_x > 1e-7) & (t_x < 1.0 - 1e-7)
    if np.any(cross_x):
        ic = i[cross_x]
        tc = t_x[cross_x]
        xbc = xb[cross_x]
        j = np.arange(n_slots)
        icg = np.repeat(ic, n_slots)
        jg = np.tile(j, ic.size)
        tcg = np.repeat(tc, n_slots)
        v_left = icg * n_slots + jg
        v_right = (icg + 1) * n_slots + jg
        add(np.repeat(xbc, n_slots), jg * dz, v_left, v_right, v_left, 1.0 - tcg, tcg, zeros(tcg.size))
        j = np.arange(n_slots - 1)
        icg = np.repeat(ic, j.size)
        jg = np.tile(j, ic.size)
        tcg = np.repeat(tc, j.size)
        v_b = icg * n_slots + (jg + 1)
        v_c = (icg + 1) * n_slots + jg
        add(
            np.repeat(xbc, j.size),
            (jg + 1) * dz - tcg * dz,
            v_b,
            v_c,
            v_b,
            1.0 - tcg,
            tcg,
            zeros(tcg.size),
        )

    j = np.arange(n_slots - 1)
    z_bot = j * dz
    k_z = np.floor((z_bot - oz) / eps).astype(np.int64) + 1
    zb = oz + k_z.astype(float) * eps
    t_z = (zb - z_bot) / dz
    cross_z = (t_z > 1e-7) & (t_z < 1.0 - 1e-7)
    if np.any(cross_z):
        jc = j[cross_z]
        tc = t_z[cross_z]
        zbc = zb[cross_z]
        i = np.arange(n_draws)
        ig = np.repeat(i, jc.size)
        jg = np.tile(jc, i.size)
        tcg = np.tile(tc, i.size)
        zbg = np.tile(zbc, i.size)
        v_bot = ig * n_slots + jg
        v_top = ig * n_slots + (jg + 1)
        add(ig * dx, zbg, v_bot, v_top, v_bot, 1.0 - tcg, tcg, zeros(tcg.size))
        # Diagonale du canvas, du haut-gauche vers le bas-droit, à chaque frontière z.
        i_quad = np.arange(n_draws - 1)
        ig = np.repeat(i_quad, jc.size)
        jg = np.tile(jc, i_quad.size)
        t = np.tile(tc, i_quad.size)
        t_diag = 1.0 - t
        pz = np.tile(zbc, i_quad.size)
        v_b = ig * n_slots + (jg + 1)
        v_c = (ig + 1) * n_slots + jg
        add(ig * dx + t_diag * dx, pz, v_b, v_c, v_b, 1.0 - t_diag, t_diag, zeros(t_diag.size))
        if np.any(cross_x):
            ic = i_quad[cross_x]
            tcx = t_x[cross_x]
            xbc = xb[cross_x]
            ig = np.repeat(ic, jc.size)
            jg = np.tile(jc, ic.size)
            s = np.repeat(tcx, jc.size)
            t = np.tile(tc, ic.size)
            px = np.repeat(xbc, jc.size)
            pz = np.tile(zbc, ic.size)
            a = ig * n_slots + jg
            b = ig * n_slots + (jg + 1)
            c = (ig + 1) * n_slots + jg
            d = (ig + 1) * n_slots + (jg + 1)
            low = s + t <= 1.0
            if np.any(low):
                sl = s[low]
                tl = t[low]
                add(px[low], pz[low], a[low], c[low], b[low], 1.0 - sl - tl, sl, tl)
            high = ~low
            if np.any(high):
                sh = s[high]
                th = t[high]
                add(px[high], pz[high], b[high], c[high], d[high], 1.0 - sh, 1.0 - th, sh + th - 1.0)

    if not bin_i:
        return blank
    return (
        np.concatenate(bin_i),
        np.concatenate(bin_j),
        np.concatenate(v0s),
        np.concatenate(v1s),
        np.concatenate(v2s),
        np.concatenate(w0s),
        np.concatenate(w1s),
        np.concatenate(w2s),
        nx,
        nz,
    )


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
    integral_scales: bool = True,
) -> dict[str, Any]:
    kept_scales: list[float] = []
    kept_counts: list[float] = []
    kept_feet: list[int] = []
    for scale, (count, footprint) in zip(scales.tolist(), counted, strict=True):
        if count <= 1.0 or abs(count - saturate_at) <= 1e-6 or footprint <= 0:
            continue
        kept_scales.append(int(scale) if integral_scales else float(scale))
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


def _variogram_lags(shape: tuple[int, int]) -> list[int]:
    short = min(int(shape[0]), int(shape[1]))
    limit = max(short // 4, 1)
    lags: list[int] = []
    lag = 1
    while lag <= limit and lag < short:
        lags.append(lag)
        if short // 4 < 1:
            break
        lag *= 2
    return lags


def _gamma_at(grid: np.ndarray, lag: int) -> float | None:
    parts: list[float] = []
    if grid.shape[0] > lag:
        diff = grid[lag:, :] - grid[:-lag, :]
        parts.append(float(np.mean(diff * diff)))
    if grid.shape[1] > lag:
        diff = grid[:, lag:] - grid[:, :-lag]
        parts.append(float(np.mean(diff * diff)))
    if not parts:
        return None
    return float(np.mean(parts))


def _clamp_roughness(log_slope: float) -> float:
    """1 − H, avec γ ~ h^(2H). Borné entre 0 et 1."""
    return float(np.clip(1.0 - 0.5 * log_slope, 0.0, 1.0))


def _power_fit(lags: list[int], gammas: list[float]) -> tuple[float, float | None, float, float | None, float, bool]:
    x = np.log(np.asarray(lags, dtype=float))
    y = np.log(np.asarray(gammas, dtype=float))
    if len(lags) >= 4:
        coeff, covariance = np.polyfit(x, y, 1, cov=True)
        stderr = float(np.sqrt(max(float(covariance[0, 0]), 0.0)))
        if not np.isfinite(stderr):
            stderr = None
    else:
        coeff = np.polyfit(x, y, 1)
        stderr = None
    slope = float(coeff[0])
    intercept = float(coeff[1])
    predicted = slope * x + intercept
    residual = float(np.sum((y - predicted) ** 2))
    total = float(np.sum((y - y.mean()) ** 2))
    r_squared = 1.0 if total == 0.0 else 1.0 - residual / total
    local = np.diff(y) / np.diff(x)
    spread = float(local.max() - local.min()) if local.size else None
    ratio = float(lags[-1] / lags[0])
    sufficient = bool(
        len(lags) >= MIN_SCALES
        and ratio >= MIN_RATIO
        and r_squared > MIN_R2
        and spread is not None
        and spread < MAX_SLOPE_SPREAD
    )
    return slope, stderr, float(r_squared), spread, ratio, sufficient


def _rough_payload(
    exponent: float | None,
    local_slope: float | None,
    fit_exponent: float | None,
    stderr: float | None,
    lags: list[int],
    gammas: list[float],
    sufficient: bool,
    r_squared: float | None,
    slope_spread: float | None,
    scale_ratio: float | None,
    flat: bool,
) -> dict[str, Any]:
    return {
        "exponent": exponent,
        "local_slope": local_slope,
        "fit_exponent": fit_exponent,
        "stderr": stderr,
        "r_squared": r_squared,
        "lags": lags,
        "gamma": gammas,
        "sufficient": sufficient,
        "n_lags": len(lags),
        "scale_ratio": scale_ratio,
        "slope_spread": slope_spread,
        "flat": flat,
    }


def _gap_clause(gap: dict[str, Any], low: str, high: str) -> str:
    delta = gap.get("delta")
    if delta is None or abs(float(delta)) < 0.05:
        return ""
    tail = low if float(delta) < 0 else high
    return f", écart au mélange {_fmt(float(delta), 2)}. {tail}"


def _area_sentence(area: dict[str, Any], gap: dict[str, Any]) -> str:
    clause = _gap_clause(
        gap,
        "Le placement a réduit la surface.",
        "La surface est plus étendue que le mélange.",
    )
    if clause:
        return f"Aire {_fmt(area['ratio'], 2)}{clause}"
    return f"Aire {_fmt(area['ratio'], 2)}."


def _rough_reason(rough: dict[str, Any]) -> str:
    if rough["n_lags"] < MIN_SCALES:
        return "Le relief est trop petit pour plusieurs écarts."
    ratio = rough["scale_ratio"]
    if ratio is None or ratio < MIN_RATIO:
        return "Le relief est trop petit pour plusieurs écarts."
    r_squared = rough["r_squared"]
    if r_squared is None or r_squared <= MIN_R2:
        return "L’ajustement ne tient pas."
    spread = rough["slope_spread"]
    if spread is None or spread >= MAX_SLOPE_SPREAD:
        return "La pente change d’écart."
    return ""


def _rough_sentence(rough: dict[str, Any], gap: dict[str, Any]) -> str:
    if rough["flat"]:
        sentence = "Rugosité 0,00. Nappe plate."
    elif rough["exponent"] is None:
        sentence = "Rugosité : pas de pente. Pas de régime. Le relief est trop petit pour plusieurs écarts."
    else:
        sentence = f"Rugosité {_fmt(rough['exponent'], 2)} au pas d’une case"
        if rough["sufficient"]:
            lags = rough["lags"]
            span = f"{lags[0]} à {lags[-1]}" if lags else "—"
            sentence += (
                f". Pente du variogramme {_fmt(rough['fit_exponent'], 2)}, "
                f"R² {_fmt(rough['r_squared'], 3)}, {rough['n_lags']} écarts de {span}. "
                "La pente tient."
            )
        else:
            sentence += f". Pas de régime. {_rough_reason(rough)}"
    delta = gap.get("delta")
    if delta is None or abs(float(delta)) < 0.05:
        return sentence
    tail = (
        "Le placement a lissé."
        if float(delta) < 0
        else "Le placement est plus rugueux que le mélange."
    )
    return f"{sentence} Écart au mélange {_fmt(float(delta), 2)}. {tail}"


def _phrase(
    area: dict[str, Any],
    area_gap: dict[str, Any],
    rough: dict[str, Any],
    rough_gap: dict[str, Any],
) -> str:
    return f"{_area_sentence(area, area_gap)} {_rough_sentence(rough, rough_gap)}"
