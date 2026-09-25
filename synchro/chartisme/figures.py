"""Les 18 détecteurs chartistes, avec la géométrie nécessaire au dessin.

Chaque détection renvoie les pivots nommés (épaule gauche, tête, cou…), les
lignes à tracer, la cassure avec sa validation par l'activité — la règle d'or :
une cassure n'est validée que si l'activité dépasse sa moyenne mobile 20 et se
confirme en clôture ou par le pull-back suivant — et l'objectif projeté selon la
table des figures.

Aucune dépendance lourde : ces détecteurs restent disponibles sans torch.
"""

from __future__ import annotations

from typing import Any, Callable, Sequence

from synchro.analysis.tech import activity_confirms
from synchro.chartisme.catalog import kind_of, label_of, signal_of, target_basis
from synchro.chartisme.pivots import DEFAULT_PCT, swing_pivots
from synchro.chartisme.rails import FLAT_SLOPE, fit_rail_pair, line_at

DEFAULT_ZIGZAG_PCT = DEFAULT_PCT
DEFAULT_EPS = 0.05
ACTIVITY_PERIOD = 20
HOLD_BARS = 2


# --- Outils géométriques ------------------------------------------------------


def _scale(values: Sequence[float]) -> float:
    """Amplitude de référence de la fenêtre, pour rendre les seuils relatifs."""
    if not values:
        return 1.0
    span = max(values) - min(values)
    if span > 0:
        return span
    return max(1.0, abs(values[0]))


def _near(a: float, b: float, eps: float, scale: float) -> bool:
    return abs(a - b) <= eps * scale


def _fit_line(points: Sequence[tuple[float, float]]) -> tuple[float, float] | None:
    """Moindres carrés sur (index, valeur) → (pente, ordonnée à l'origine)."""
    if len(points) < 2:
        return None
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    xbar = sum(xs) / len(xs)
    ybar = sum(ys) / len(ys)
    den = sum((x - xbar) ** 2 for x in xs)
    if den == 0:
        return None
    slope = sum((x - xbar) * (y - ybar) for x, y in zip(xs, ys)) / den
    return slope, ybar - slope * xbar


def _at(line: tuple[float, float], index: float) -> float:
    return line[0] * index + line[1]


def _line_fit_error(line: tuple[float, float], points: Sequence[tuple[float, float]]) -> float:
    if not points:
        return 0.0
    return sum(abs(y - _at(line, x)) for x, y in points) / len(points)


# Une droite passe exactement par deux points : son erreur d'ajustement nulle
# ne prouve rien. Tant qu'un troisième appui manque, on facture l'ignorance —
# sans quoi une marche aléatoire quelconque décroche la confiance maximale.
NO_EVIDENCE = 0.07


def _mean_step(values: Sequence[float]) -> float:
    """Déplacement moyen par barre — la vitesse du tracé."""
    if len(values) < 2:
        return 0.0
    return sum(abs(values[i] - values[i - 1]) for i in range(1, len(values))) / (len(values) - 1)


def _score(*errors: float) -> float:
    """Erreurs relatives → confiance dans [0.05, 0.99]."""
    total = sum(max(0.0, e) for e in errors)
    return max(0.05, min(0.99, 1.0 / (1.0 + 6.0 * total)))


def _weigh(fit: float, first: int, last: int, pivots: int, window: int) -> float:
    """Qualité d'ajustement pondérée par l'appui de la figure.

    Deux lignes se laissent toujours ajuster à quatre points quelconques : sur
    un bout de fenêtre et sans appuis, un bel ajustement ne veut rien dire. On
    escompte donc la confiance selon la part de fenêtre expliquée et le nombre
    de pivots mobilisés. C'est une mesure de qualité géométrique, jamais une
    probabilité que la figure annonce quoi que ce soit.
    """
    span = max(1, window - 1)
    coverage = min(1.0, (last - first) / span / 0.6)
    support = min(1.0, pivots / 5.0)
    return max(0.01, min(0.99, fit * (0.35 + 0.65 * (0.55 * coverage + 0.45 * support))))


def _interior(ctx: Context, pivots: Sequence[dict[str, Any]]) -> list[dict[str, Any]]:
    """Pivots hors point d'ouverture de la fenêtre.

    Le premier point d'une fenêtre est presque toujours un extrême : il vient
    du découpage, pas du tracé. Le compter comme un appui fait passer
    n'importe quelle fenêtre pour un range.
    """
    return [p for p in pivots if int(p["index"]) > 0]


def _pivot(index: int, value: float, role: str, dates: Sequence[str]) -> dict[str, Any]:
    return {
        "index": int(index),
        "date": dates[index] if 0 <= index < len(dates) else None,
        "value": float(value),
        "role": role,
    }


def _guide(
    role: str,
    points: Sequence[tuple[int, float]],
    *,
    kind: str = "segment",
    dashed: bool = True,
) -> dict[str, Any]:
    return {
        "role": role,
        "kind": kind,
        "dashed": dashed,
        "points": [{"index": int(i), "value": float(v)} for i, v in points],
    }


def activity_ratio(activity: Sequence[float], index: int, period: int = ACTIVITY_PERIOD) -> float:
    if index < 0 or index >= len(activity):
        return 0.0
    start = max(0, index - period)
    chunk = list(activity[start:index])
    if not chunk:
        return 0.0
    mean = sum(chunk) / len(chunk)
    if mean <= 0:
        return 0.0
    return float(activity[index]) / mean


def _breakout(
    values: Sequence[float],
    dates: Sequence[str],
    activity: Sequence[float],
    *,
    start: int,
    level: Callable[[int], float],
    direction: str,
    limit: int | None = None,
) -> dict[str, Any] | None:
    """Premier franchissement du niveau après `start`, avec sa validation."""
    stop = len(values) if limit is None else min(len(values), start + limit + 1)
    for index in range(start + 1, stop):
        bound = level(index)
        crossed = values[index] < bound if direction == "down" else values[index] > bound
        if not crossed:
            continue
        ratio = activity_ratio(activity, index)
        volume_ok = bool(activity) and activity_confirms(list(activity), index, ACTIVITY_PERIOD)
        holds = True
        for ahead in range(index + 1, min(len(values), index + 1 + HOLD_BARS)):
            edge = level(ahead)
            if (values[ahead] >= edge) if direction == "down" else (values[ahead] <= edge):
                holds = False
                break
        # Règle d'or : activité au-dessus de sa MM20 **et** confirmation en
        # clôture (ou par le pull-back suivant). Le « et » n'est pas négociable
        # — c'est lui qui distingue la cassure du fake breakout. Sans série
        # d'activité la moitié volume du critère est indécidable, et on s'en
        # tient à la tenue.
        confirmed = bool(volume_ok and holds) if activity else holds
        return {
            "index": index,
            "date": dates[index] if index < len(dates) else None,
            "value": float(values[index]),
            "level": float(bound),
            "direction": direction,
            "activity_ratio": round(ratio, 3),
            "volume_ok": volume_ok,
            "holds": holds,
            "confirmed": confirmed,
            "fake": not confirmed,
        }
    return None


def _hit(
    figure: str,
    *,
    pivots: list[dict[str, Any]],
    guides: list[dict[str, Any]],
    confidence: float,
    dates: Sequence[str],
    breakout: dict[str, Any] | None = None,
    target: float | None = None,
    detector: str = "geometric",
    slope_bias: str | None = None,
) -> dict[str, Any]:
    indexes = [p["index"] for p in pivots] or [0]
    first, last = min(indexes), max(indexes)
    return {
        "figure": figure,
        "label": label_of(figure),
        "kind": kind_of(figure),
        "signal": signal_of(figure),
        "confidence": round(_weigh(confidence, first, last, len(pivots), len(dates)), 4),
        "from_index": first,
        "to_index": last,
        "from": dates[first] if first < len(dates) else None,
        "to": dates[last] if last < len(dates) else None,
        "pivots": pivots,
        "guides": guides,
        "breakout": breakout,
        "target": None if target is None else {"value": float(target), "basis": target_basis(figure)},
        "detector": detector,
        **({"slope_bias": slope_bias} if slope_bias else {}),
    }


class Context:
    """Fenêtre prête à détecter : valeurs, dates, activité, pivots."""

    def __init__(
        self,
        values: Sequence[float],
        dates: Sequence[str | None] | None = None,
        activity: Sequence[float] | None = None,
        *,
        zigzag_pct: float = DEFAULT_ZIGZAG_PCT,
        eps: float = DEFAULT_EPS,
    ) -> None:
        self.values = [float(v) for v in values]
        # Rembourré à la longueur de la fenêtre pour que `dates[i]` soit
        # toujours interrogeable, mais avec des trous plutôt que des indices
        # déguisés en dates : le champ part tel quel vers Neon et l'UI.
        self.dates: list[str | None] = list(dates or [])
        if len(self.dates) < len(self.values):
            self.dates += [None] * (len(self.values) - len(self.dates))
        self.activity = [float(a) for a in (activity or [])]
        self.eps = eps
        self.scale = _scale(self.values)
        self.pivots = swing_pivots(self.values, self.dates, zigzag_pct)
        self.highs = [p for p in self.pivots if p["type"] == "H"]
        self.lows = [p for p in self.pivots if p["type"] == "L"]

    def xy(self, pivot: dict[str, Any]) -> tuple[float, float]:
        return float(pivot["index"]), float(pivot["price"])

    def breakout(
        self,
        *,
        start: int,
        level: Callable[[int], float],
        direction: str,
        limit: int | None = None,
    ) -> dict[str, Any] | None:
        return _breakout(
            self.values,
            self.dates,
            self.activity,
            start=start,
            level=level,
            direction=direction,
            limit=limit,
        )

    def last_index(self) -> int:
        return len(self.values) - 1


# --- Retournements par pivots -------------------------------------------------


def detect_ete(ctx: Context) -> list[dict[str, Any]]:
    """Tête & épaules et sa version inversée."""
    out: list[dict[str, Any]] = []
    for inverted in (False, True):
        extremes = ctx.lows if inverted else ctx.highs
        counters = ctx.highs if inverted else ctx.lows
        figure = "ete_inv" if inverted else "ete"
        direction = "up" if inverted else "down"
        for slot in range(len(extremes) - 2):
            left, head, right = extremes[slot], extremes[slot + 1], extremes[slot + 2]
            lp, hp, rp = float(left["price"]), float(head["price"]), float(right["price"])
            # La tête doit dominer franchement les épaules, sinon c'est un
            # triple sommet / creux.
            prominence = min(lp - hp, rp - hp) if inverted else min(hp - lp, hp - rp)
            if prominence < 0.12 * ctx.scale:
                continue
            if not _near(lp, rp, ctx.eps * 2, ctx.scale):
                continue
            necks = [
                c
                for c in counters
                if left["index"] < c["index"] < right["index"]
            ]
            if len(necks) < 2:
                continue
            neck_a, neck_b = necks[0], necks[-1]
            line = _fit_line([ctx.xy(neck_a), ctx.xy(neck_b)])
            if line is None:
                continue
            depth = abs(hp - _at(line, float(head["index"])))
            if depth <= ctx.eps * ctx.scale:
                continue
            shoulder_err = abs(lp - rp) / ctx.scale
            balance = abs(
                (head["index"] - left["index"]) - (right["index"] - head["index"])
            ) / max(1, right["index"] - left["index"])
            breakout = ctx.breakout(
                start=right["index"],
                level=lambda i: _at(line, float(i)),
                direction=direction,
            )
            anchor = breakout["index"] if breakout else ctx.last_index()
            neck_at = _at(line, float(anchor))
            target = neck_at - depth if direction == "down" else neck_at + depth
            out.append(
                _hit(
                    figure,
                    pivots=[
                        _pivot(left["index"], lp, "left_shoulder", ctx.dates),
                        _pivot(neck_a["index"], float(neck_a["price"]), "neck_left", ctx.dates),
                        _pivot(head["index"], hp, "head", ctx.dates),
                        _pivot(neck_b["index"], float(neck_b["price"]), "neck_right", ctx.dates),
                        _pivot(right["index"], rp, "right_shoulder", ctx.dates),
                    ],
                    guides=[
                        _guide(
                            "neckline",
                            [
                                (neck_a["index"], _at(line, float(neck_a["index"]))),
                                (anchor, neck_at),
                            ],
                        ),
                        _guide(
                            "height",
                            [(head["index"], hp), (head["index"], _at(line, float(head["index"])))],
                            kind="measure",
                        ),
                    ],
                    confidence=_score(shoulder_err, balance * 0.5),
                    dates=ctx.dates,
                    breakout=breakout,
                    target=target,
                )
            )
    return out


def detect_multi_top(ctx: Context) -> list[dict[str, Any]]:
    """Double et triple sommet / creux."""
    out: list[dict[str, Any]] = []
    for inverted in (False, True):
        extremes = ctx.lows if inverted else ctx.highs
        counters = ctx.highs if inverted else ctx.lows
        direction = "up" if inverted else "down"
        for count, figure in ((3, "triple_bottom" if inverted else "triple_top"), (2, "double_bottom" if inverted else "double_top")):
            for slot in range(len(extremes) - count + 1):
                group = extremes[slot : slot + count]
                prices = [float(p["price"]) for p in group]
                # Tolérance de niveau plus large que `eps` : sur une courbe
                # bruitée, trois sommets « au même niveau » se lisent à l'œil
                # bien avant de tenir dans 5 % du range.
                level_eps = ctx.eps * 1.6 * ctx.scale
                if max(prices) - min(prices) > level_eps:
                    continue
                # Un range à quatre touches est un rectangle, pas un double
                # sommet : on exige que le niveau ne soit touché que `count` fois.
                center = sum(prices) / len(prices)
                touches = sum(
                    1
                    for p in _interior(ctx, extremes)
                    if abs(float(p["price"]) - center) <= level_eps
                )
                if touches > count:
                    continue
                mids = [
                    c
                    for c in counters
                    if group[0]["index"] < c["index"] < group[-1]["index"]
                ]
                if len(mids) != count - 1:
                    continue
                mid_prices = [float(c["price"]) for c in mids]
                level = max(mid_prices) if inverted else min(mid_prices)
                extreme = min(prices) if inverted else max(prices)
                height = abs(extreme - level)
                # Un vrai repli entre les sommets, pas une simple ondulation.
                if height <= 0.18 * ctx.scale:
                    continue
                # Le support ne doit pas être, lui aussi, une borne de range :
                # autant d'appuis dessous que dessus, et la figure est un
                # rectangle. Les pivots de bord de fenêtre ne comptent pas,
                # ils viennent du découpage et non du tracé.
                held = sum(
                    1
                    for c in _interior(ctx, counters)
                    if abs(float(c["price"]) - level) <= level_eps
                )
                if held > count - 1:
                    continue
                breakout = ctx.breakout(
                    start=group[-1]["index"],
                    level=lambda i, level=level: level,
                    direction=direction,
                )
                target = level - height if direction == "down" else level + height
                role = "bottom" if inverted else "top"
                pivots = [
                    _pivot(p["index"], float(p["price"]), role, ctx.dates) for p in group
                ]
                pivots.extend(
                    _pivot(
                        c["index"],
                        float(c["price"]),
                        "resistance" if inverted else "support",
                        ctx.dates,
                    )
                    for c in mids
                )
                spread = (max(prices) - min(prices)) / ctx.scale
                out.append(
                    _hit(
                        figure,
                        pivots=pivots,
                        guides=[
                            _guide(
                                "resistance" if inverted else "support",
                                [
                                    (group[0]["index"], level),
                                    (breakout["index"] if breakout else ctx.last_index(), level),
                                ],
                                kind="level",
                            ),
                            _guide(
                                "height",
                                [
                                    (group[0]["index"], extreme),
                                    (group[0]["index"], level),
                                ],
                                kind="measure",
                            ),
                        ],
                        confidence=_score(spread, 0.0 if count >= 3 else NO_EVIDENCE),
                        dates=ctx.dates,
                        breakout=breakout,
                        target=target,
                    )
                )
    return out


# --- Bornes convergentes / divergentes ---------------------------------------


def _bounds(ctx: Context, pivots_h: list[dict[str, Any]], pivots_l: list[dict[str, Any]]):
    upper = _fit_line([ctx.xy(p) for p in pivots_h])
    lower = _fit_line([ctx.xy(p) for p in pivots_l])
    if upper is None or lower is None:
        return None
    err = (
        _line_fit_error(upper, [ctx.xy(p) for p in pivots_h])
        + _line_fit_error(lower, [ctx.xy(p) for p in pivots_l])
    ) / ctx.scale
    err += NO_EVIDENCE * sum(1 for side in (pivots_h, pivots_l) if len(side) < 3)
    return upper, lower, err


def _bound_guides(
    upper: tuple[float, float],
    lower: tuple[float, float],
    first: int,
    last: int,
) -> list[dict[str, Any]]:
    return [
        _guide("upper", [(first, _at(upper, first)), (last, _at(upper, last))]),
        _guide("lower", [(first, _at(lower, first)), (last, _at(lower, last))]),
    ]


def _bound_pivots(
    ctx: Context,
    pivots_h: list[dict[str, Any]],
    pivots_l: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    pivots = [_pivot(p["index"], float(p["price"]), "upper", ctx.dates) for p in pivots_h]
    pivots.extend(_pivot(p["index"], float(p["price"]), "lower", ctx.dates) for p in pivots_l)
    return sorted(pivots, key=lambda p: p["index"])


def _pivot_groups(pivots: list[dict[str, Any]], sizes: Sequence[int] = (6, 5, 4)):
    """Sous-suites contiguës de pivots, les plus longues d'abord."""
    for size in sizes:
        for start in range(len(pivots) - size + 1):
            group = pivots[start : start + size]
            highs = [p for p in group if p["type"] == "H"]
            lows = [p for p in group if p["type"] == "L"]
            if len(highs) >= 2 and len(lows) >= 2:
                yield group, highs, lows


def detect_bounds(ctx: Context) -> list[dict[str, Any]]:
    """Figures à deux bornes : biseaux, triangles, rectangle, canal, broadening top.

    Les bornes sont ajustées sur un groupe de pivots *clos*, et la cassure est
    cherchée après son dernier pivot : la jambe de sortie ne contamine donc pas
    l'ajustement des bornes.
    """
    out: list[dict[str, Any]] = []
    for _group, highs, lows in _pivot_groups(ctx.pivots):
        pair = fit_rail_pair(highs, lows, eps=ctx.eps, scale=ctx.scale)
        if pair is None or not pair.get("figure"):
            continue
        upper, lower = pair["upper"], pair["lower"]
        first, last = int(pair["first"]), int(pair["last"])
        figure, direction = pair["figure"], pair["expected"]
        err = float(pair["ls_error"])
        err += NO_EVIDENCE * sum(1 for side in (highs, lows) if len(side) < 3)
        base = float(pair["height"])
        if base <= ctx.eps * ctx.scale:
            continue
        median = pair["median"]
        if figure == "rectangle":
            top = line_at(upper, first)
            bottom = line_at(lower, first)
            base = top - bottom
            up_level: Callable[[int], float] = lambda i, top=top: top
            down_level: Callable[[int], float] = lambda i, bottom=bottom: bottom
            guides = [
                _guide("upper", [(first, top), (last, top)], kind="level"),
                _guide("lower", [(first, bottom), (last, bottom)], kind="level"),
                _guide("height", [(first, bottom), (first, top)], kind="measure"),
                _guide(
                    "median",
                    [(first, line_at(median, first)), (last, line_at(median, last))],
                    kind="median",
                ),
            ]
        else:
            up_level = lambda i, upper=upper: line_at(upper, float(i))
            down_level = lambda i, lower=lower: line_at(lower, float(i))
            guides = _bound_guides(upper, lower, first, last) + [
                _guide(
                    "base",
                    [(first, line_at(lower, first)), (first, line_at(upper, first))],
                    kind="measure",
                ),
                _guide(
                    "median",
                    [(first, line_at(median, first)), (last, line_at(median, last))],
                    kind="median",
                ),
            ]
        if figure == "broadening_top":
            # Le signal est la cassure du dernier creux, pas celle de la borne.
            level = min(float(p["price"]) for p in lows[-2:])
            down_level = lambda i, level=level: level
            base = _at(upper, last) - _at(lower, last)
            guides.append(
                _guide(
                    "support",
                    [(lows[-1]["index"], level), (ctx.last_index(), level)],
                    kind="level",
                )
            )
        candidates: list[dict[str, Any] | None] = []
        if direction in {"down", "any"}:
            candidates.append(ctx.breakout(start=last, level=down_level, direction="down"))
        if direction in {"up", "any"}:
            candidates.append(ctx.breakout(start=last, level=up_level, direction="up"))
        breakout = min(
            (b for b in candidates if b is not None),
            key=lambda b: b["index"],
            default=None,
        )
        if breakout is None:
            origin = ctx.values[ctx.last_index()]
            target = origin - base if direction == "down" else origin + base
        else:
            origin = breakout["value"]
            target = origin - base if breakout["direction"] == "down" else origin + base
        out.append(
            _hit(
                figure,
                pivots=_bound_pivots(ctx, highs, lows),
                guides=guides,
                confidence=_score(err),
                dates=ctx.dates,
                breakout=breakout,
                target=target,
                slope_bias=pair.get("slope_bias"),
            )
        )
    return out


def detect_diamond(ctx: Context) -> list[dict[str, Any]]:
    """Diamant : les bornes s'écartent puis se resserrent autour d'un apex."""
    out: list[dict[str, Any]] = []
    if len(ctx.pivots) < 6:
        return out
    for size in (8, 7, 6):
        for offset in range(len(ctx.pivots) - size + 1):
            group = ctx.pivots[offset : offset + size]
            middle = size // 2
            left_part, right_part = group[: middle + 1], group[middle:]
            lh = [p for p in left_part if p["type"] == "H"]
            ll_ = [p for p in left_part if p["type"] == "L"]
            rh = [p for p in right_part if p["type"] == "H"]
            rl_ = [p for p in right_part if p["type"] == "L"]
            if min(len(lh), len(ll_), len(rh), len(rl_)) < 2:
                continue
            left = _bounds(ctx, lh, ll_)
            right = _bounds(ctx, rh, rl_)
            if left is None or right is None:
                continue
            lu, lo, left_err = left
            ru, ro, right_err = right
            first = group[0]["index"]
            last = group[-1]["index"]
            apex = group[middle]["index"]
            open_start = _at(lu, first) - _at(lo, first)
            open_mid = _at(lu, apex) - _at(lo, apex)
            open_end = _at(ru, last) - _at(ro, last)
            if open_mid <= 0:
                continue
            if open_mid < open_start * 1.2 or open_mid < open_end * 1.2:
                continue
            # Bornes qui s'écartent à gauche, se resserrent à droite : sans cette
            # exigence de signes, un simple triangle passerait pour un diamant.
            if not (lu[0] > 0 and lo[0] < 0 and ru[0] < 0 and ro[0] > 0):
                continue
            if not (0.3 <= (apex - first) / max(1, last - first) <= 0.7):
                continue
            level = _at(ro, float(last))
            breakout = ctx.breakout(
                start=last,
                level=lambda i, ro=ro: _at(ro, float(i)),
                direction="down",
            )
            origin = breakout["value"] if breakout else ctx.values[ctx.last_index()]
            pivots = _bound_pivots(ctx, lh + rh, ll_ + rl_)
            pivots.append(_pivot(apex, ctx.values[apex], "apex", ctx.dates))
            out.append(
                _hit(
                    "diamond",
                    pivots=pivots,
                    guides=[
                        _guide("upper", [(first, _at(lu, first)), (apex, _at(lu, apex))]),
                        _guide("lower", [(first, _at(lo, first)), (apex, _at(lo, apex))]),
                        _guide("upper", [(apex, _at(ru, apex)), (last, _at(ru, last))]),
                        _guide("lower", [(apex, _at(ro, apex)), (last, _at(ro, last))]),
                        _guide(
                            "height",
                            [(apex, _at(lo, apex)), (apex, _at(lu, apex))],
                            kind="measure",
                        ),
                        _guide("support", [(last, level), (ctx.last_index(), level)], kind="level"),
                    ],
                    confidence=_score(left_err, right_err),
                    dates=ctx.dates,
                    breakout=breakout,
                    target=origin - open_mid,
                )
            )
    return out


# --- Continuations avec mât ---------------------------------------------------


def _pause_groups(pivots: list[dict[str, Any]], sizes: Sequence[int] = (4, 3)):
    """Sous-suites courtes servant de pause à un drapeau : une borne suffit.

    `_pivot_groups` réclame deux appuis par borne, ce qu'une consolidation de
    quelques barres ne fournit jamais.
    """
    for size in sizes:
        for start in range(len(pivots) - size + 1):
            group = pivots[start : start + size]
            if any(p["type"] == "H" for p in group) and any(p["type"] == "L" for p in group):
                yield group


def _pause_holds(values: Sequence[float], first: int, last: int, anchor: float, reach: float) -> bool:
    """La pause reste-t-elle collée au sommet du mât ?

    Un drapeau ne rend pas la moitié de l'élan : s'il s'en éloigne, la jambe
    précédente n'était pas un mât mais une simple oscillation de plus.
    """
    return all(abs(float(v) - anchor) <= reach for v in values[first : last + 1])


def detect_flag_pennant(ctx: Context) -> list[dict[str, Any]]:
    """Drapeau et fanion : un mât franc, puis une consolidation serrée.

    Le mât est cherché sur les valeurs et non d'un pivot à l'autre : son départ
    tombe souvent hors fenêtre ou sous le seuil de détection des pivots, et la
    figure disparaîtrait alors qu'elle est là. Ce qui la définit reste l'écart
    d'échelle entre l'élan et la pause qui suit.
    """
    out: list[dict[str, Any]] = []
    for group in _pause_groups(ctx.pivots):
        first, last = group[0]["index"], group[-1]["index"]
        prices = [float(p["price"]) for p in group]
        amplitude = max(prices) - min(prices)
        if last <= first or amplitude <= 0:
            continue
        # Le mât : le plus grand déplacement net aboutissant au début de la
        # pause, cherché sur une fenêtre arrière proportionnée à la pause.
        lookback = max(4, min(first, 2 * (last - first)))
        window = ctx.values[first - lookback : first + 1]
        if len(window) < 3:
            continue
        anchor = float(ctx.values[first])
        low, high = min(window), max(window)
        pole_up = anchor - low
        pole_down = high - anchor
        direction = "up" if pole_up >= pole_down else "down"
        pole_len = max(pole_up, pole_down)
        origin_value = low if direction == "up" else high
        pole_start = first - lookback + (window.index(origin_value))
        pole_bars = first - pole_start
        if pole_bars <= 0 or pole_len < 0.3 * ctx.scale:
            continue
        # L'élan doit dominer la pause : c'est tout ce qui sépare un drapeau
        # d'un triangle, où chaque jambe vaut la précédente.
        if amplitude > pole_len * 0.5:
            continue
        if not _pause_holds(ctx.values, first, last, anchor, pole_len * 0.5):
            continue
        # Une pause est brève. Au-delà, c'est une figure à bornes qui suit une
        # tendance, pas un drapeau.
        if last - first > 3 * pole_bars:
            continue
        if _mean_step(ctx.values[pole_start : first + 1]) < 1.5 * _mean_step(ctx.values[first : last + 1]):
            continue
        cons_h = [p for p in group if p["type"] == "H"]
        cons_l = [p for p in group if p["type"] == "L"]
        upper = _fit_line([ctx.xy(p) for p in cons_h]) if len(cons_h) >= 2 else None
        lower = _fit_line([ctx.xy(p) for p in cons_l]) if len(cons_l) >= 2 else None
        if upper and lower:
            fit_err = (
                _line_fit_error(upper, [ctx.xy(p) for p in cons_h])
                + _line_fit_error(lower, [ctx.xy(p) for p in cons_l])
            ) / ctx.scale
            guides = _bound_guides(upper, lower, first, last)
            level_fn: Callable[[int], float] = (
                (lambda i: _at(upper, float(i))) if direction == "up" else (lambda i: _at(lower, float(i)))
            )
        else:
            fit_err = NO_EVIDENCE
            top, bottom = max(prices), min(prices)
            guides = [
                _guide("upper", [(first, top), (last, top)], kind="level"),
                _guide("lower", [(first, bottom), (last, bottom)], kind="level"),
            ]
            level_fn = (lambda i: top) if direction == "up" else (lambda i: bottom)
        breakout = ctx.breakout(start=last, level=level_fn, direction=direction)
        origin = breakout["value"] if breakout else ctx.values[ctx.last_index()]
        target = origin + pole_len if direction == "up" else origin - pole_len
        # Fanion = pause qui se resserre ; drapeau = canal d'amplitude
        # constante. Mesuré jusqu'à la cassure : le dernier pivot détecté
        # arrive tôt quand le resserrement fait taire les oscillations.
        figure = "flag"
        pause = ctx.values[first : (breakout["index"] if breakout else len(ctx.values))]
        if len(pause) >= 6:
            half = len(pause) // 2
            head_amp = max(pause[:half]) - min(pause[:half])
            tail_amp = max(pause[half:]) - min(pause[half:])
            if head_amp > 0 and tail_amp < head_amp * 0.75:
                figure = "pennant"
        pivots = [
            _pivot(pole_start, float(ctx.values[pole_start]), "pole_start", ctx.dates),
            _pivot(first, anchor, "pole_end", ctx.dates),
        ]
        pivots.extend(
            _pivot(p["index"], float(p["price"]), "upper" if p["type"] == "H" else "lower", ctx.dates)
            for p in group
        )
        out.append(
            _hit(
                figure,
                pivots=pivots,
                guides=guides
                + [
                    _guide(
                        "pole",
                        [(pole_start, float(ctx.values[pole_start])), (first, anchor)],
                        kind="measure",
                        dashed=False,
                    )
                ],
                # Une pause serrée fait un bon drapeau : on ne facture que
                # l'amplitude excessive, jamais la tenue du canal.
                confidence=_score(fit_err, max(0.0, amplitude / pole_len - 0.35)),
                dates=ctx.dates,
                breakout=breakout,
                target=target,
            )
        )
    return out


def detect_cup_handle(ctx: Context) -> list[dict[str, Any]]:
    """Tasse avec anse : fond arrondi entre deux lèvres, puis repli court."""
    out: list[dict[str, Any]] = []
    if len(ctx.highs) < 2 or not ctx.lows:
        return out
    for slot in range(len(ctx.highs) - 1):
        left_lip, right_lip = ctx.highs[slot], ctx.highs[slot + 1]
        lip_l, lip_r = float(left_lip["price"]), float(right_lip["price"])
        if not _near(lip_l, lip_r, ctx.eps * 3, ctx.scale):
            continue
        inner = [p for p in ctx.lows if left_lip["index"] < p["index"] < right_lip["index"]]
        if not inner:
            continue
        bottom = min(inner, key=lambda p: float(p["price"]))
        lip = min(lip_l, lip_r)
        depth = lip - float(bottom["price"])
        width = right_lip["index"] - left_lip["index"]
        if depth <= ctx.eps * 2 * ctx.scale or width < 6:
            continue
        # Un fond arrondi, pas un V : la moitié basse de la tasse doit être large.
        floor = float(bottom["price"]) + depth * 0.35
        wide = sum(
            1
            for i in range(left_lip["index"], right_lip["index"] + 1)
            if ctx.values[i] <= floor
        )
        roundness = wide / max(1, width)
        if roundness < 0.25:
            continue
        handle = [p for p in ctx.lows if p["index"] > right_lip["index"]]
        handle_low = handle[0] if handle else None
        if handle_low is not None:
            pullback = lip_r - float(handle_low["price"])
            if pullback > depth * 0.5:
                continue
        anchor = handle_low["index"] if handle_low else right_lip["index"]
        breakout = ctx.breakout(start=anchor, level=lambda i: lip_r, direction="up")
        origin = breakout["value"] if breakout else lip_r
        pivots = [
            _pivot(left_lip["index"], lip_l, "lip_left", ctx.dates),
            _pivot(bottom["index"], float(bottom["price"]), "bottom", ctx.dates),
            _pivot(right_lip["index"], lip_r, "lip_right", ctx.dates),
        ]
        if handle_low is not None:
            pivots.append(
                _pivot(handle_low["index"], float(handle_low["price"]), "handle_low", ctx.dates)
            )
        out.append(
            _hit(
                "cup_handle",
                pivots=pivots,
                guides=[
                    _guide(
                        "lip",
                        [(left_lip["index"], lip_r), (breakout["index"] if breakout else ctx.last_index(), lip_r)],
                        kind="level",
                    ),
                    _guide(
                        "depth",
                        [(bottom["index"], float(bottom["price"])), (bottom["index"], lip_r)],
                        kind="measure",
                    ),
                ],
                confidence=_score(abs(lip_l - lip_r) / ctx.scale, max(0.0, 0.5 - roundness)),
                dates=ctx.dates,
                breakout=breakout,
                target=origin + depth,
            )
        )
    return out


DETECTORS: tuple[Callable[[Context], list[dict[str, Any]]], ...] = (
    detect_ete,
    detect_multi_top,
    detect_bounds,
    detect_diamond,
    detect_flag_pennant,
    detect_cup_handle,
)

# Deux lectures peuvent coexister sur la même zone — la ligne de cou d'une ETE
# est aussi un double creux. À confiance voisine, la figure la plus spécifique
# passe devant.
SPECIFICITY: dict[str, int] = {
    "ete": 9,
    "ete_inv": 9,
    "cup_handle": 8,
    "diamond": 7,
    "triple_top": 6,
    "triple_bottom": 6,
    "pennant": 5,
    "flag": 5,
    "wedge_rising": 4,
    "wedge_falling": 4,
    "triangle_sym": 4,
    "triangle_asc": 4,
    "triangle_desc": 4,
    "broadening_top": 3,
    "double_top": 2,
    "double_bottom": 2,
    "canal": 2,
    "rectangle": 1,
    "none": 0,
}


def breakout_tier(hit: dict[str, Any]) -> int:
    """2 = cassure confirmée, 1 = figure en formation, 0 = fake breakout."""
    breakout = hit.get("breakout")
    if not breakout:
        return 1
    return 2 if breakout.get("confirmed") else 0


def rank_key(hit: dict[str, Any]) -> tuple[int, int, float, int]:
    """Une cassure confirmée passe devant, puis la lecture la plus spécifique."""
    return (
        -breakout_tier(hit),
        -SPECIFICITY.get(hit["figure"], 0),
        -hit["confidence"],
        hit["from_index"],
    )


def _overlap(a: dict[str, Any], b: dict[str, Any]) -> float:
    lo = max(a["from_index"], b["from_index"])
    hi = min(a["to_index"], b["to_index"])
    if hi <= lo:
        return 0.0
    shortest = min(a["to_index"] - a["from_index"], b["to_index"] - b["from_index"])
    if shortest <= 0:
        return 0.0
    return (hi - lo) / shortest


def dedupe(hits: Sequence[dict[str, Any]], *, max_overlap: float = 0.2) -> list[dict[str, Any]]:
    """Une seule occurrence par figure et par zone : on garde la mieux classée.

    Les groupes de pivots se chevauchent par construction (4, 5 puis 6 pivots
    glissants) : sans ce filtre, un même triangle ressortirait quatre fois.
    """
    kept: list[dict[str, Any]] = []
    for hit in sorted(hits, key=rank_key):
        clash = any(
            other["figure"] == hit["figure"] and _overlap(other, hit) > max_overlap
            for other in kept
        )
        if not clash:
            kept.append(hit)
    kept.sort(key=rank_key)
    return kept


def detect_figures(
    values: Sequence[float],
    dates: Sequence[str] | None = None,
    activity: Sequence[float] | None = None,
    *,
    zigzag_pct: float = DEFAULT_ZIGZAG_PCT,
    eps: float = DEFAULT_EPS,
    min_confidence: float = 0.0,
    max_overlap: float = 0.2,
    motifs: bool = True,
) -> list[dict[str, Any]]:
    """Toutes les figures d'une fenêtre, triées par confiance décroissante.

    `motifs` ajoute la lecture sur le graphe de visibilité. Un accord sur la
    même zone confirme la lecture géométrique — elle garde ses pivots et sa
    cassure. Un motif sans jumeau géométrique s'ajoute, puis `dedupe` tranche.
    """
    ctx = Context(values, dates, activity, zigzag_pct=zigzag_pct, eps=eps)
    hits: list[dict[str, Any]] = []
    for detector in DETECTORS:
        try:
            hits.extend(detector(ctx))
        except (ValueError, ZeroDivisionError, IndexError):
            continue
    if motifs:
        try:
            from synchro.chartisme.motif import apply_agreement, read_figures

            extra = read_figures(values, dates, activity, eps=eps)
            hits = apply_agreement(hits, extra)
        except (ValueError, ZeroDivisionError, IndexError):
            pass
    hits = [h for h in hits if h["confidence"] >= min_confidence]
    return dedupe(hits, max_overlap=max_overlap)


DEFAULT_MAX_OVERLAP = 0.2


def best_figure(
    values: Sequence[float],
    dates: Sequence[str] | None = None,
    activity: Sequence[float] | None = None,
    **kwargs: Any,
) -> dict[str, Any] | None:
    hits = detect_figures(values, dates, activity, **kwargs)
    return hits[0] if hits else None


def target_reached(
    values: Sequence[float],
    hit: dict[str, Any],
    *,
    horizon: int | None = None,
) -> dict[str, Any]:
    """L'objectif a-t-il été atteint après la cassure, avant invalidation ?"""
    breakout = hit.get("breakout")
    target = hit.get("target")
    if not breakout or not target:
        return {"status": "no_breakout", "reached": None, "bars": None}
    start = int(breakout["index"])
    level = float(breakout["level"])
    goal = float(target["value"])
    down = breakout["direction"] == "down"
    stop = len(values) if horizon is None else min(len(values), start + horizon + 1)
    for index in range(start + 1, stop):
        value = float(values[index])
        if (value >= goal) if not down else (value <= goal):
            return {"status": "reached", "reached": True, "bars": index - start}
        invalidated = value > level if down else value < level
        if invalidated:
            return {"status": "invalidated", "reached": False, "bars": index - start}
    return {"status": "open", "reached": None, "bars": stop - 1 - start}


def summarize(hits: Sequence[dict[str, Any]]) -> dict[str, Any]:
    confirmed = sum(1 for h in hits if (h.get("breakout") or {}).get("confirmed"))
    fakes = sum(1 for h in hits if (h.get("breakout") or {}).get("fake"))
    by_figure: dict[str, int] = {}
    for hit in hits:
        by_figure[hit["figure"]] = by_figure.get(hit["figure"], 0) + 1
    return {
        "count": len(hits),
        "confirmed": confirmed,
        "fake": fakes,
        "pending": len(hits) - confirmed - fakes,
        "by_figure": dict(sorted(by_figure.items(), key=lambda kv: -kv[1])),
    }
