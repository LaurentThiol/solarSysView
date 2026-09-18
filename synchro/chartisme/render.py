"""Rendu SVG d'une courbe annotée.

Deux usages : l'API (pour afficher une figure sans recalculer côté navigateur)
et la visualisation des jeux d'entraînement. Même approche que
`synchro.morpho.render.glyph_svg` — concaténation de chaînes, pas de dépendance.

Repère : `x` sur l'indice du tirage, `y` sur la valeur (axe retourné, les
valeurs hautes en haut).
"""

from __future__ import annotations

from typing import Any, Sequence

from synchro.chartisme.catalog import PIVOT_ROLE_LABELS, label_of, slope_bias_label

WIDTH = 720
HEIGHT = 260
ACTIVITY_HEIGHT = 54
PAD_X = 40
PAD_Y = 18
GAP = 12

CURVE_COLOR = "#4aa3a2"
GUIDE_COLORS = {
    "neckline": "#d4a017",
    "upper": "#d4a017",
    "lower": "#d4a017",
    "support": "#d4a017",
    "resistance": "#d4a017",
    "lip": "#d4a017",
    "base": "#8a8f98",
    "height": "#8a8f98",
    "median": "#4aa3a2",
    "depth": "#8a8f98",
    "measure": "#8a8f98",
    "pole": "#b05ccc",
    "target": "#e0574b",
}
PIVOT_COLOR = "#e8e8e8"
BREAKOUT_OK = "#43b581"
BREAKOUT_FAKE = "#e0574b"
ACTIVITY_COLOR = "#5a6570"
ACTIVITY_MA_COLOR = "#d4a017"


def _esc(text: str) -> str:
    return (
        str(text)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


class Frame:
    """Échelles explicites, comme le chart SVG des chandeliers."""

    def __init__(
        self,
        values: Sequence[float],
        *,
        width: int = WIDTH,
        height: int = HEIGHT,
        extra: Sequence[float] = (),
        show_activity: bool = True,
    ) -> None:
        self.values = [float(v) for v in values]
        self.width = width
        self.height = height
        self.show_activity = show_activity
        pool = self.values + [float(v) for v in extra if v is not None]
        self.hi = max(pool) if pool else 1.0
        self.lo = min(pool) if pool else 0.0
        span = self.hi - self.lo
        if span <= 0:
            self.hi += 0.5
            self.lo -= 0.5
            span = 1.0
        pad = span * 0.08
        self.hi += pad
        self.lo -= pad
        self.span = self.hi - self.lo
        self.plot_h = height - PAD_Y * 2 - ((ACTIVITY_HEIGHT + GAP) if show_activity else 0)
        self.count = max(1, len(self.values))

    def x(self, index: float) -> float:
        if self.count == 1:
            return PAD_X
        inner = self.width - PAD_X * 2
        return PAD_X + inner * (float(index) / (self.count - 1))

    def y(self, value: float) -> float:
        return PAD_Y + ((self.hi - float(value)) / self.span) * self.plot_h

    def activity_top(self) -> float:
        return PAD_Y + self.plot_h + GAP

    def activity_y(self, value: float, peak: float) -> float:
        if peak <= 0:
            return self.activity_top() + ACTIVITY_HEIGHT
        return self.activity_top() + ACTIVITY_HEIGHT * (1 - min(1.0, float(value) / peak))


def _polyline(frame: Frame, values: Sequence[float], color: str, width: float = 1.8) -> str:
    points = " ".join(f"{frame.x(i):.1f},{frame.y(v):.1f}" for i, v in enumerate(values))
    return (
        f'<polyline points="{points}" fill="none" stroke="{color}" '
        f'stroke-width="{width}" stroke-linejoin="round" />'
    )


def _guide_svg(frame: Frame, guide: dict[str, Any]) -> str:
    points = guide.get("points") or []
    if len(points) < 2:
        return ""
    color = GUIDE_COLORS.get(guide.get("role", ""), GUIDE_COLORS.get(guide.get("kind", ""), "#8a8f98"))
    dash = ' stroke-dasharray="5 4"' if guide.get("dashed", True) else ""
    coords = " ".join(f"{frame.x(p['index']):.1f},{frame.y(p['value']):.1f}" for p in points)
    out = f'<polyline points="{coords}" fill="none" stroke="{color}" stroke-width="1.4"{dash} />'
    if guide.get("kind") == "measure":
        first, last = points[0], points[-1]
        for point in (first, last):
            out += (
                f'<line x1="{frame.x(point["index"]) - 4:.1f}" x2="{frame.x(point["index"]) + 4:.1f}" '
                f'y1="{frame.y(point["value"]):.1f}" y2="{frame.y(point["value"]):.1f}" '
                f'stroke="{color}" stroke-width="1.2" />'
            )
    return out


def _pivots_svg(frame: Frame, pivots: Sequence[dict[str, Any]], *, labels: bool = True) -> str:
    out = ""
    for pivot in pivots:
        cx = frame.x(pivot["index"])
        cy = frame.y(pivot["value"])
        out += f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="3.2" fill="{PIVOT_COLOR}" />'
        if not labels:
            continue
        role = PIVOT_ROLE_LABELS.get(pivot.get("role", ""), pivot.get("role", ""))
        if not role:
            continue
        anchor = "middle"
        if cx < PAD_X + 40:
            anchor = "start"
        elif cx > frame.width - PAD_X - 40:
            anchor = "end"
        out += (
            f'<text x="{cx:.1f}" y="{cy - 8:.1f}" text-anchor="{anchor}" '
            f'font-size="9" fill="{PIVOT_COLOR}">{_esc(role)}</text>'
        )
    return out


def _breakout_svg(frame: Frame, breakout: dict[str, Any] | None) -> str:
    if not breakout:
        return ""
    color = BREAKOUT_OK if breakout.get("confirmed") else BREAKOUT_FAKE
    cx = frame.x(breakout["index"])
    cy = frame.y(breakout["value"])
    down = breakout.get("direction") == "down"
    tip = cy + 16 if down else cy - 16
    head = -5 if down else 5
    return (
        f'<line x1="{cx:.1f}" x2="{cx:.1f}" y1="{cy:.1f}" y2="{tip:.1f}" '
        f'stroke="{color}" stroke-width="1.8" />'
        f'<polygon points="{cx:.1f},{tip:.1f} {cx - 4:.1f},{tip + head:.1f} '
        f'{cx + 4:.1f},{tip + head:.1f}" fill="{color}" />'
        f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="4" fill="none" stroke="{color}" stroke-width="1.6" />'
    )


def _target_svg(frame: Frame, hit: dict[str, Any]) -> str:
    target = hit.get("target")
    if not target:
        return ""
    value = float(target["value"])
    if not (frame.lo <= value <= frame.hi):
        return ""
    breakout = hit.get("breakout") or {}
    start = breakout.get("index", hit.get("to_index", 0))
    y = frame.y(value)
    x1 = frame.x(start)
    x2 = frame.width - PAD_X
    return (
        f'<line x1="{x1:.1f}" x2="{x2:.1f}" y1="{y:.1f}" y2="{y:.1f}" '
        f'stroke="{GUIDE_COLORS["target"]}" stroke-width="1.4" stroke-dasharray="2 3" />'
        f'<text x="{x2:.1f}" y="{y - 5:.1f}" text-anchor="end" font-size="9" '
        f'fill="{GUIDE_COLORS["target"]}">objectif {value:.1f}</text>'
    )


def _activity_svg(frame: Frame, activity: Sequence[float], period: int = 20) -> str:
    if not activity:
        return ""
    values = [float(a) for a in activity][: len(frame.values)]
    peak = max(values) if values else 0.0
    if peak <= 0:
        return ""
    top = frame.activity_top()
    base = top + ACTIVITY_HEIGHT
    slot = max(1.0, (frame.width - PAD_X * 2) / max(1, len(values)))
    bars = ""
    for i, value in enumerate(values):
        y = frame.activity_y(value, peak)
        bars += (
            f'<rect x="{frame.x(i) - slot * 0.35:.1f}" y="{y:.1f}" '
            f'width="{slot * 0.7:.2f}" height="{max(0.5, base - y):.1f}" '
            f'fill="{ACTIVITY_COLOR}" />'
        )
    ma_points: list[str] = []
    for i in range(len(values)):
        start = max(0, i - period)
        chunk = values[start:i]
        if not chunk:
            continue
        mean = sum(chunk) / len(chunk)
        ma_points.append(f"{frame.x(i):.1f},{frame.activity_y(mean, peak):.1f}")
    line = ""
    if len(ma_points) > 1:
        line = (
            f'<polyline points="{" ".join(ma_points)}" fill="none" '
            f'stroke="{ACTIVITY_MA_COLOR}" stroke-width="1.2" />'
        )
    label = (
        f'<text x="{PAD_X:.1f}" y="{top - 3:.1f}" font-size="9" fill="{ACTIVITY_COLOR}">'
        "activité · MM20</text>"
    )
    return bars + line + label


def _badge(hit: dict[str, Any]) -> str:
    breakout = hit.get("breakout") or {}
    if not breakout:
        state = "en formation"
        color = GUIDE_COLORS["base"]
    elif breakout.get("confirmed"):
        state = "cassure confirmée"
        color = BREAKOUT_OK
    else:
        state = "fake breakout"
        color = BREAKOUT_FAKE
    name = slope_bias_label(str(hit.get("figure") or ""), hit.get("slope_bias"))
    if not name:
        name = hit.get("label") or label_of(hit.get("figure", ""))
    confidence = float(hit.get("confidence") or 0.0)
    text = f"{name} · {confidence:.0%} · {state}"
    return (
        f'<rect x="{PAD_X - 6}" y="4" width="{min(len(text) * 6.2 + 14, WIDTH - PAD_X * 2):.0f}" '
        f'height="16" rx="4" fill="#1c1f24" stroke="{color}" stroke-width="1" />'
        f'<text x="{PAD_X + 1}" y="15.5" font-size="10" fill="{color}">{_esc(text)}</text>'
    )


def figure_svg(
    curve: dict[str, Any] | Sequence[float],
    hit: dict[str, Any] | None = None,
    *,
    width: int = WIDTH,
    height: int = HEIGHT,
    labels: bool = True,
    show_activity: bool = True,
    title: str | None = None,
) -> str:
    """Courbe + annotations de la figure, en un SVG autonome.

    `curve` accepte une courbe du bundle ou une simple liste de valeurs. Les
    indices de `hit` doivent être dans le même repère que les valeurs fournies.
    """
    if isinstance(curve, dict):
        values = [float(v) for v in curve.get("values") or []]
        activity = [float(a) for a in curve.get("activity") or []]
        heading = title or curve.get("label") or curve.get("id") or ""
    else:
        values = [float(v) for v in curve]
        activity = []
        heading = title or ""
    if not values:
        return f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}"></svg>'

    extra: list[float] = []
    if hit:
        for guide in hit.get("guides") or []:
            extra.extend(float(p["value"]) for p in guide.get("points") or [])
        if hit.get("target"):
            extra.append(float(hit["target"]["value"]))
    frame = Frame(
        values,
        width=width,
        height=height,
        extra=extra,
        show_activity=show_activity and bool(activity),
    )

    body = [
        f'<rect width="{width}" height="{height}" fill="#101316" rx="8" />',
        _polyline(frame, values, CURVE_COLOR),
    ]
    if frame.show_activity:
        body.append(_activity_svg(frame, activity))
    if hit:
        for guide in hit.get("guides") or []:
            body.append(_guide_svg(frame, guide))
        body.append(_target_svg(frame, hit))
        body.append(_pivots_svg(frame, hit.get("pivots") or [], labels=labels))
        body.append(_breakout_svg(frame, hit.get("breakout")))
        body.append(_badge(hit))
    elif heading:
        body.append(
            f'<text x="{PAD_X}" y="15" font-size="10" fill="{ACTIVITY_COLOR}">{_esc(heading)}</text>'
        )
    inner = "".join(part for part in body if part)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" '
        f'width="{width}" height="{height}" role="img" aria-label="{_esc(heading or "Courbe")}">'
        f"<title>{_esc(heading or 'Courbe')}</title>{inner}</svg>"
    )


def window_svg(
    values: Sequence[float],
    *,
    width: int = 240,
    height: int = 90,
    color: str = CURVE_COLOR,
) -> str:
    """Vignette d'une fenêtre — pour les listes de voisins et l'atelier."""
    if not values:
        return f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}"></svg>'
    frame = Frame(values, width=width, height=height, show_activity=False)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" '
        f'width="{width}" height="{height}" role="img" aria-label="Fenêtre">'
        f'<rect width="{width}" height="{height}" fill="#101316" rx="6" />'
        f"{_polyline(frame, values, color, 1.5)}</svg>"
    )


def figure_render(
    curve: dict[str, Any],
    hit: dict[str, Any],
    *,
    labels: bool = True,
) -> dict[str, Any]:
    """La figure enrichie de son SVG — équivalent de `portrait_render` côté Morpho."""
    window = _window_of(curve, hit)
    return {
        **hit,
        "svg": figure_svg(window, _shift(hit, -window["offset"]), labels=labels),
        "thumb": window_svg(window["values"]),
    }


def _window_of(curve: dict[str, Any], hit: dict[str, Any], margin: int = 6) -> dict[str, Any]:
    values = [float(v) for v in curve.get("values") or []]
    activity = [float(a) for a in curve.get("activity") or []]
    dates = list(curve.get("dates") or [])
    breakout = hit.get("breakout") or {}
    end = max(int(hit.get("to_index", 0)), int(breakout.get("index", 0)))
    start = max(0, int(hit.get("from_index", 0)) - margin)
    stop = min(len(values), end + margin + 1)
    return {
        "id": curve.get("id"),
        "label": curve.get("label"),
        "offset": start,
        "values": values[start:stop],
        "activity": activity[start:stop],
        "dates": dates[start:stop],
    }


def _shift(hit: dict[str, Any], delta: int) -> dict[str, Any]:
    out = dict(hit)
    out["from_index"] = hit.get("from_index", 0) + delta
    out["to_index"] = hit.get("to_index", 0) + delta
    out["pivots"] = [{**p, "index": p["index"] + delta} for p in hit.get("pivots") or []]
    out["guides"] = [
        {**g, "points": [{**p, "index": p["index"] + delta} for p in g.get("points") or []]}
        for g in hit.get("guides") or []
    ]
    breakout = hit.get("breakout")
    if breakout:
        out["breakout"] = {**breakout, "index": breakout["index"] + delta}
    return out
