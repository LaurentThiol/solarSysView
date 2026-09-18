"""Générateur paramétrique des figures chartistes.

Sans lui, les modèles n'auraient rien à apprendre : quelques dizaines
d'étiquettes à la main ne suffisent pas. Chaque figure est ici une construction
géométrique tirée au sort (hauteurs, durées, pentes, asymétrie), posée sur une
marche aléatoire porteuse, puis bruitée et déformée dans le temps.

La classe `none` vient de marches aléatoires et de courbes réelles : c'est elle
qui empêche le modèle de voir une figure partout.
"""

from __future__ import annotations

import math
import random
from typing import Any, Callable, Sequence

from synchro.chartisme.catalog import FIGURE_IDS, canonical_figure, flip_of
from synchro.chartisme.svgpath import resample_values

DEFAULT_LENGTH = 60
BASE_LEVEL = 100.0


def _walk(rng: random.Random, count: int, step: float) -> list[float]:
    out = [0.0]
    for _ in range(count - 1):
        out.append(out[-1] + rng.gauss(0.0, step))
    return out


def _from_knots(count: int, knots: Sequence[tuple[float, float]]) -> list[float]:
    """Courbe lisse passant par des extrêmes imposés `(instant, niveau)`.

    Les figures de retournement se définissent par leurs pivots — épaules à
    même niveau, tête plus haute, creux intermédiaire à telle profondeur. Les
    construire à partir des pivots, et non en sommant des bosses, donne un
    contrôle exact sur ce que mesurent les détecteurs. L'interpolation en
    cosinus annule la pente à chaque nœud : chaque nœud est donc bien un
    extrême local, donc un pivot.
    """
    ordered = sorted(knots)
    out: list[float] = []
    for i in range(count):
        t = i / max(1, count - 1)
        slot = 0
        while slot < len(ordered) - 2 and t > ordered[slot + 1][0]:
            slot += 1
        (t0, v0), (t1, v1) = ordered[slot], ordered[slot + 1]
        width = t1 - t0
        frac = 0.0 if width <= 0 else min(1.0, max(0.0, (t - t0) / width))
        out.append(v0 + (v1 - v0) * (0.5 - 0.5 * math.cos(math.pi * frac)))
    return out


def _oscillation(
    count: int,
    upper: Callable[[float], float],
    lower: Callable[[float], float],
    touches: int,
    *,
    start_high: bool = True,
) -> list[float]:
    """Série qui rebondit entre deux bornes — triangles, biseaux, rectangles."""
    out: list[float] = []
    legs = max(2, touches)
    for i in range(count):
        t = i / max(1, count - 1)
        phase = t * legs
        leg = int(phase)
        frac = phase - leg
        high_first = (leg % 2 == 0) == start_high
        top, bottom = upper(t), lower(t)
        eased = 0.5 - 0.5 * math.cos(math.pi * frac)
        out.append(top - (top - bottom) * eased if high_first else bottom + (top - bottom) * eased)
    return out


def _tail(values: list[float], direction: int, amount: float, bars: int) -> list[float]:
    """Jambe de sortie : c'est elle qui matérialise la cassure."""
    out = list(values)
    last = out[-1]
    for k in range(bars):
        out.append(last + direction * amount * (k + 1) / bars)
    return out


# --- Une fonction par figure --------------------------------------------------


def _ete(rng: random.Random, count: int, *, inverted: bool = False) -> list[float]:
    head = rng.uniform(22.0, 42.0)
    shoulder = head * rng.uniform(0.5, 0.72)
    skew = rng.uniform(0.9, 1.1)
    neck = head * rng.uniform(0.12, 0.3)
    slope = head * rng.uniform(-0.1, 0.1)
    t_ls = rng.uniform(0.14, 0.2)
    t_rs = rng.uniform(0.78, 0.85)
    knots = [
        (0.0, -neck * rng.uniform(0.2, 1.0)),
        (t_ls, shoulder),
        (rng.uniform(0.29, 0.35), neck),
        (0.5, head),
        (rng.uniform(0.64, 0.7), neck + slope),
        (t_rs, shoulder * skew),
    ]
    body = _from_knots(count, knots if not inverted else [(t, -v) for t, v in knots])
    body = [BASE_LEVEL + v for v in body]
    return _tail(body, 1 if inverted else -1, head * rng.uniform(0.7, 1.2), max(4, count // 10))


def _multi_extreme(
    rng: random.Random,
    count: int,
    *,
    peaks: int,
    inverted: bool = False,
) -> list[float]:
    height = rng.uniform(20.0, 40.0)
    trough = height * rng.uniform(0.35, 0.55)
    margin = rng.uniform(0.22, 0.3)
    spacing = (1 - 2 * margin) / max(1, peaks - 1)
    knots: list[tuple[float, float]] = [(0.0, trough * rng.uniform(-0.6, 0.3))]
    for i in range(peaks):
        center = margin + spacing * i + rng.uniform(-0.02, 0.02)
        knots.append((center, height * rng.uniform(0.97, 1.03)))
        if i < peaks - 1:
            knots.append((center + spacing / 2, trough * rng.uniform(0.9, 1.1)))
    body = _from_knots(count, knots if not inverted else [(t, -v) for t, v in knots])
    body = [BASE_LEVEL + v for v in body]
    return _tail(body, 1 if inverted else -1, height * rng.uniform(0.7, 1.1), max(4, count // 10))


def _bounded(
    rng: random.Random,
    count: int,
    *,
    up_slope: float,
    low_slope: float,
    height: float,
    touches: int,
    break_dir: int,
) -> list[float]:
    top0 = BASE_LEVEL + height / 2
    bot0 = BASE_LEVEL - height / 2
    body = _oscillation(
        count,
        lambda t: top0 + up_slope * t * height,
        lambda t: bot0 + low_slope * t * height,
        touches,
        start_high=rng.random() < 0.5,
    )
    return _tail(body, break_dir, height * rng.uniform(0.8, 1.4), max(4, count // 10))


def _wedge_rising(rng: random.Random, count: int) -> list[float]:
    h = rng.uniform(22.0, 40.0)
    return _bounded(
        rng, count,
        up_slope=rng.uniform(0.5, 0.9),
        low_slope=rng.uniform(1.1, 1.8),
        height=h, touches=rng.randint(4, 6), break_dir=-1,
    )


def _wedge_falling(rng: random.Random, count: int) -> list[float]:
    h = rng.uniform(22.0, 40.0)
    return _bounded(
        rng, count,
        up_slope=rng.uniform(-1.8, -1.1),
        low_slope=rng.uniform(-0.9, -0.5),
        height=h, touches=rng.randint(4, 6), break_dir=1,
    )


def _triangle_sym(rng: random.Random, count: int) -> list[float]:
    h = rng.uniform(24.0, 44.0)
    taper = rng.uniform(0.55, 0.8)
    return _bounded(
        rng, count,
        up_slope=-taper, low_slope=taper,
        height=h, touches=rng.randint(4, 7),
        break_dir=rng.choice((-1, 1)),
    )


def _triangle_asc(rng: random.Random, count: int) -> list[float]:
    h = rng.uniform(22.0, 40.0)
    return _bounded(
        rng, count,
        up_slope=rng.uniform(-0.05, 0.05),
        low_slope=rng.uniform(0.55, 0.85),
        height=h, touches=rng.randint(4, 7), break_dir=1,
    )


def _triangle_desc(rng: random.Random, count: int) -> list[float]:
    h = rng.uniform(22.0, 40.0)
    return _bounded(
        rng, count,
        up_slope=rng.uniform(-0.85, -0.55),
        low_slope=rng.uniform(-0.05, 0.05),
        height=h, touches=rng.randint(4, 7), break_dir=-1,
    )


def _rectangle(rng: random.Random, count: int) -> list[float]:
    h = rng.uniform(20.0, 38.0)
    return _bounded(
        rng, count,
        up_slope=rng.uniform(-0.04, 0.04),
        low_slope=rng.uniform(-0.04, 0.04),
        height=h, touches=rng.randint(4, 8),
        break_dir=rng.choice((-1, 1)),
    )


def _canal(rng: random.Random, count: int) -> list[float]:
    """Canal à bornes parallèles, inclinées : ce n'est pas un rectangle plat."""
    h = rng.uniform(20.0, 36.0)
    slope = rng.uniform(0.55, 1.2) * (1 if rng.random() < 0.5 else -1)
    jitter = rng.uniform(-0.08, 0.08)
    return _bounded(
        rng, count,
        up_slope=slope + jitter,
        low_slope=slope - jitter,
        height=h, touches=rng.randint(5, 7),
        break_dir=rng.choice((-1, 1)),
    )


def _broadening_top(rng: random.Random, count: int) -> list[float]:
    h = rng.uniform(14.0, 24.0)
    return _bounded(
        rng, count,
        up_slope=rng.uniform(0.9, 1.6),
        low_slope=rng.uniform(-1.6, -0.9),
        height=h, touches=rng.randint(5, 8), break_dir=-1,
    )


def _diamond(rng: random.Random, count: int) -> list[float]:
    h = rng.uniform(30.0, 50.0)
    legs = rng.randint(6, 9)
    apex = rng.uniform(0.42, 0.58)
    body: list[float] = []
    for i in range(count):
        t = i / max(1, count - 1)
        openness = 1 - abs(t - apex) / max(apex, 1 - apex)
        amp = (h / 2) * (0.12 + 0.88 * max(0.0, openness))
        body.append(BASE_LEVEL + amp * math.sin(t * legs * math.pi))
    return _tail(body, -1, h * rng.uniform(0.6, 1.0), max(4, count // 10))


def _flag_like(rng: random.Random, count: int, *, pennant: bool) -> list[float]:
    pole_bars = max(6, int(count * rng.uniform(0.2, 0.3)))
    rest_bars = count - pole_bars
    direction = rng.choice((-1, 1))
    pole_len = rng.uniform(38.0, 65.0)
    body = [BASE_LEVEL + direction * pole_len * (i + 1) / pole_bars for i in range(pole_bars)]
    top = body[-1]
    amp = pole_len * rng.uniform(0.16, 0.24) if pennant else pole_len * rng.uniform(0.1, 0.18)
    # Un fanion dérive peu : sa dérive masquerait le resserrement qui le
    # distingue du drapeau.
    drift = -direction * pole_len * (rng.uniform(0.01, 0.05) if pennant else rng.uniform(0.03, 0.12))
    legs = rng.randint(3, 5)
    for i in range(rest_bars):
        t = i / max(1, rest_bars - 1)
        # Resserrement mesuré : trop fort, les dernières oscillations passent
        # sous le seuil de détection des pivots et le fanion perd ses appuis.
        decay = (1 - 0.55 * t) if pennant else 1.0
        # La consolidation part toujours à contresens du mât : sinon elle
        # dépasse le sommet du mât, qui cesse d'être le pivot de fin.
        body.append(top + drift * t - direction * amp * decay * math.sin(t * legs * math.pi))
    return _tail(body, direction, pole_len * rng.uniform(0.8, 1.2), max(4, count // 10))


def _cup_handle(rng: random.Random, count: int) -> list[float]:
    depth = rng.uniform(24.0, 42.0)
    cup_bars = max(12, int(count * rng.uniform(0.68, 0.8)))
    handle_bars = count - cup_bars
    flatness = rng.uniform(3.0, 5.0)
    lip_skew = rng.uniform(-0.08, 0.05) * depth
    body: list[float] = []
    for i in range(cup_bars):
        u = (i / max(1, cup_bars - 1)) * 2 - 1
        body.append(BASE_LEVEL - depth * (1 - abs(u) ** flatness) + lip_skew * (u + 1) / 2)
    lip = body[-1]
    pull = depth * rng.uniform(0.16, 0.34)
    for i in range(max(3, handle_bars)):
        t = i / max(1, handle_bars - 1)
        body.append(lip - pull * math.sin(t * math.pi))
    return _tail(body, 1, depth * rng.uniform(0.7, 1.2), max(4, count // 10))


def _none(rng: random.Random, count: int) -> list[float]:
    total = count + max(4, count // 10)
    kind = rng.random()
    if kind < 0.45:
        drift = rng.uniform(-0.2, 0.2)
        walk = _walk(rng, total, rng.uniform(4.0, 9.0))
        return [BASE_LEVEL + v + drift * i for i, v in enumerate(walk)]
    if kind < 0.75:
        slope = rng.uniform(-0.6, 0.6)
        noise = _walk(rng, total, rng.uniform(2.0, 5.0))
        return [BASE_LEVEL + slope * i + n for i, n in enumerate(noise)]
    period = rng.uniform(4.0, 14.0)
    amp = rng.uniform(6.0, 20.0)
    noise = _walk(rng, total, rng.uniform(2.0, 6.0))
    return [
        BASE_LEVEL + amp * math.sin(i / period * 2 * math.pi) + noise[i] for i in range(total)
    ]


GENERATORS: dict[str, Callable[[random.Random, int], list[float]]] = {
    "ete": lambda rng, n: _ete(rng, n, inverted=False),
    "ete_inv": lambda rng, n: _ete(rng, n, inverted=True),
    "double_top": lambda rng, n: _multi_extreme(rng, n, peaks=2, inverted=False),
    "double_bottom": lambda rng, n: _multi_extreme(rng, n, peaks=2, inverted=True),
    "triple_top": lambda rng, n: _multi_extreme(rng, n, peaks=3, inverted=False),
    "triple_bottom": lambda rng, n: _multi_extreme(rng, n, peaks=3, inverted=True),
    "wedge_rising": _wedge_rising,
    "wedge_falling": _wedge_falling,
    "triangle_sym": _triangle_sym,
    "triangle_asc": _triangle_asc,
    "triangle_desc": _triangle_desc,
    "rectangle": _rectangle,
    "canal": _canal,
    "flag": lambda rng, n: _flag_like(rng, n, pennant=False),
    "pennant": lambda rng, n: _flag_like(rng, n, pennant=True),
    "cup_handle": _cup_handle,
    "diamond": _diamond,
    "broadening_top": _broadening_top,
    "none": _none,
}


# --- Augmentations ------------------------------------------------------------


def add_carrier(values: Sequence[float], rng: random.Random, strength: float = 0.08) -> list[float]:
    """Marche aléatoire porteuse : la figure n'arrive jamais sur une base plate.

    La porteuse est redressée avant d'être ajoutée. Sa dérive, sinon, incline
    la figure au point de changer sa classe — un rectangle devient un biseau,
    et l'étiquette devient fausse. On garde l'irrégularité, pas la pente.
    """
    count = len(values)
    span = (max(values) - min(values)) or 1.0
    walk = _walk(rng, count, span * strength / max(1.0, math.sqrt(count)))
    drift = (walk[-1] - walk[0]) / max(1, count - 1)
    return [v + w - drift * i for i, (v, w) in enumerate(zip(values, walk))]


def add_noise(values: Sequence[float], rng: random.Random, ratio: float = 0.03) -> list[float]:
    span = (max(values) - min(values)) or 1.0
    return [v + rng.gauss(0.0, span * ratio) for v in values]


def time_warp(values: Sequence[float], rng: random.Random, amount: float = 0.2) -> list[float]:
    """Déformation temporelle : même forme, rythme différent."""
    n = len(values)
    if n < 4:
        return list(values)
    knots = sorted(rng.uniform(0.2, 0.8) for _ in range(2))
    targets = [min(0.95, max(0.05, k + rng.uniform(-amount, amount))) for k in knots]
    src = [0.0, *knots, 1.0]
    dst = [0.0, *sorted(targets), 1.0]
    out: list[float] = []
    for i in range(n):
        t = i / (n - 1)
        slot = max(0, min(len(dst) - 2, next((s for s in range(len(dst) - 1) if t <= dst[s + 1]), 0)))
        width = dst[slot + 1] - dst[slot]
        frac = 0.0 if width <= 0 else (t - dst[slot]) / width
        u = src[slot] + (src[slot + 1] - src[slot]) * frac
        pos = u * (n - 1)
        left = int(pos)
        right = min(n - 1, left + 1)
        out.append(values[left] + (values[right] - values[left]) * (pos - left))
    return out


def rescale(values: Sequence[float], rng: random.Random) -> list[float]:
    factor = rng.uniform(0.4, 2.5)
    offset = rng.uniform(-40.0, 40.0)
    return [v * factor + offset for v in values]


def flip_vertical(values: Sequence[float]) -> list[float]:
    mid = (max(values) + min(values)) / 2
    return [2 * mid - v for v in values]


def augment(
    values: Sequence[float],
    figure: str,
    rng: random.Random,
    *,
    flip: bool = True,
    warp: bool = True,
    noise: float = 0.02,
    carrier: float = 0.08,
) -> tuple[list[float], str]:
    """Une variation de la même figure. La symétrie verticale change l'étiquette."""
    out = list(values)
    label = figure
    if carrier > 0:
        out = add_carrier(out, rng, carrier)
    if warp and rng.random() < 0.6:
        out = time_warp(out, rng)
    if noise > 0:
        out = add_noise(out, rng, noise)
    out = rescale(out, rng)
    if flip and rng.random() < 0.5:
        out = flip_vertical(out)
        label = flip_of(figure)
    return out, label


def make_sample(
    figure: str,
    rng: random.Random,
    *,
    length: int = DEFAULT_LENGTH,
    jitter: float = 0.25,
    **kwargs: Any,
) -> dict[str, Any]:
    """Une fenêtre synthétique étiquetée, avec son activité."""
    figure = canonical_figure(figure)
    generator = GENERATORS.get(figure)
    if generator is None:
        raise ValueError(f"Figure inconnue: {figure}")
    base = max(24, int(length * rng.uniform(1 - jitter, 1 + jitter)))
    raw = generator(rng, base)
    values, label = augment(raw, figure, rng, **kwargs)
    values = resample_values(values, length)
    activity = [abs(values[i] - values[i - 1]) if i else 0.0 for i in range(len(values))]
    if len(activity) > 1:
        activity[0] = activity[1]
    return {
        "figure": label,
        "values": values,
        "activity": activity,
        "length": len(values),
        "source": "synth",
    }


def make_dataset(
    *,
    per_class: int = 400,
    length: int = DEFAULT_LENGTH,
    seed: int = 0,
    figures: Sequence[str] | None = None,
    none_ratio: float = 1.5,
    **kwargs: Any,
) -> list[dict[str, Any]]:
    """Jeu synthétique équilibré. La classe `none` est volontairement sur-représentée."""
    rng = random.Random(seed)
    wanted = list(figures or FIGURE_IDS)
    samples: list[dict[str, Any]] = []
    for figure in wanted:
        count = int(per_class * none_ratio) if figure == "none" else per_class
        for _ in range(count):
            samples.append(make_sample(figure, rng, length=length, **kwargs))
    rng.shuffle(samples)
    return samples


def windows_from_curve(
    curve: dict[str, Any],
    *,
    length: int = DEFAULT_LENGTH,
    count: int = 200,
    seed: int = 0,
) -> list[dict[str, Any]]:
    """Fenêtres réelles tirées au sort, étiquetées `none` faute de mieux.

    Elles servent de contre-exemples : une vraie courbe de tirages ne porte
    presque jamais de figure franche.
    """
    values = [float(v) for v in curve.get("values") or []]
    activity = [float(a) for a in curve.get("activity") or []]
    if len(values) < length:
        return []
    rng = random.Random(seed)
    out: list[dict[str, Any]] = []
    for _ in range(count):
        start = rng.randint(0, len(values) - length)
        out.append(
            {
                "figure": "none",
                "values": values[start : start + length],
                "activity": activity[start : start + length],
                "length": length,
                "source": "real",
                "curve_id": curve.get("id"),
                "from_index": start,
            }
        )
    return out
