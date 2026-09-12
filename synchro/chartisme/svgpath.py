"""Fenêtre de courbe → chemins SVG → tokens de commandes.

Une fenêtre est ramenée au carré unité (indépendance à la résolution), réduite à
ses points perceptuellement importants (PIP, Fu et al.), puis ajustée par des
Béziers cubiques. Le résultat est un *groupe* de chemins — courbe, enveloppe
haute, enveloppe basse, activité — tokenisé comme dans DeepSVG : un identifiant
de commande (MoveTo / LineTo / CubicBezier / ClosePath) et six arguments
quantifiés par commande.

Convention : `y = 1` est la valeur la plus haute de la fenêtre. Le retournement
vertical pour l'affichage se fait au rendu (`to_svg_d(flip_y=True)`).
"""

from __future__ import annotations

import math
from typing import Any, Sequence

CMD_TOKENS = ("PAD", "SOS", "EOS", "m", "l", "c", "z")
CMD_PAD, CMD_SOS, CMD_EOS, CMD_MOVE, CMD_LINE, CMD_CUBIC, CMD_CLOSE = range(7)

N_ARGS = 6
ARG_BINS = 256
# 0 = argument absent ; une valeur quantifiée v ∈ [0, 255] est stockée v + 1.
ARG_VOCAB = ARG_BINS + 1
ARG_NONE = 0

MAX_CMDS = 48
MAX_PATHS = 4

PATH_ROLES = ("curve", "upper", "lower", "activity")


class Command:
    """Une commande de chemin : identifiant + six arguments dans le carré unité."""

    __slots__ = ("cmd", "args")

    def __init__(self, cmd: int, args: Sequence[float | None] | None = None) -> None:
        self.cmd = int(cmd)
        raw = list(args or [])
        raw += [None] * (N_ARGS - len(raw))
        self.args: list[float | None] = [None if a is None else float(a) for a in raw[:N_ARGS]]

    @property
    def end(self) -> tuple[float, float]:
        x, y = self.args[4], self.args[5]
        return (0.0 if x is None else x, 0.0 if y is None else y)

    def as_dict(self) -> dict[str, Any]:
        return {"cmd": CMD_TOKENS[self.cmd], "args": list(self.args)}

    def __repr__(self) -> str:
        return f"Command({CMD_TOKENS[self.cmd]}, {self.args})"


def move_to(x: float, y: float) -> Command:
    return Command(CMD_MOVE, [None, None, None, None, x, y])


def line_to(x: float, y: float) -> Command:
    return Command(CMD_LINE, [None, None, None, None, x, y])


def cubic_to(x1: float, y1: float, x2: float, y2: float, x: float, y: float) -> Command:
    return Command(CMD_CUBIC, [x1, y1, x2, y2, x, y])


def close_path() -> Command:
    return Command(CMD_CLOSE)


# --- Normalisation ------------------------------------------------------------


def normalize_window(values: Sequence[float]) -> list[tuple[float, float]]:
    """Fenêtre → points du carré unité. x = rang, y = valeur (1 = max)."""
    n = len(values)
    if n == 0:
        return []
    if n == 1:
        return [(0.0, 0.5)]
    lo = min(values)
    hi = max(values)
    span = hi - lo
    if span <= 0:
        return [(i / (n - 1), 0.5) for i in range(n)]
    return [(i / (n - 1), (float(values[i]) - lo) / span) for i in range(n)]


def denormalize_y(y: float, values: Sequence[float]) -> float:
    """Inverse de `normalize_window` sur l'axe des valeurs."""
    if not values:
        return 0.0
    lo = min(values)
    hi = max(values)
    span = hi - lo
    if span <= 0:
        return float(lo)
    return float(lo) + y * span


# --- Points perceptuellement importants --------------------------------------


def pips(points: Sequence[tuple[float, float]], k: int = 15) -> list[int]:
    """Indices des k points les plus saillants (distance verticale maximale)."""
    n = len(points)
    if n == 0:
        return []
    if n <= 2 or k <= 2:
        return sorted({0, n - 1})
    keep = [0, n - 1]
    while len(keep) < min(k, n):
        best_idx = -1
        best_dist = -1.0
        for slot in range(len(keep) - 1):
            left, right = keep[slot], keep[slot + 1]
            if right - left < 2:
                continue
            x0, y0 = points[left]
            x1, y1 = points[right]
            dx = x1 - x0
            for i in range(left + 1, right):
                x, y = points[i]
                on_line = y0 if dx == 0 else y0 + (y1 - y0) * (x - x0) / dx
                dist = abs(y - on_line)
                if dist > best_dist:
                    best_dist = dist
                    best_idx = i
        if best_idx < 0:
            break
        keep.append(best_idx)
        keep.sort()
    return keep


# --- Ajustement de Béziers cubiques ------------------------------------------


def _chord_params(points: Sequence[tuple[float, float]]) -> list[float]:
    if len(points) < 2:
        return [0.0] * len(points)
    dists = [0.0]
    total = 0.0
    for i in range(1, len(points)):
        (x0, y0), (x1, y1) = points[i - 1], points[i]
        total += math.hypot(x1 - x0, y1 - y0)
        dists.append(total)
    if total <= 0:
        return [i / (len(points) - 1) for i in range(len(points))]
    return [d / total for d in dists]


def fit_cubic(
    points: Sequence[tuple[float, float]],
) -> tuple[tuple[float, float], tuple[float, float]]:
    """Points de contrôle d'une Bézier cubique ajustée aux moindres carrés.

    Les extrémités sont imposées (`points[0]`, `points[-1]`) ; seuls les deux
    points de contrôle intermédiaires sont résolus.
    """
    if len(points) < 2:
        p = points[0] if points else (0.0, 0.0)
        return p, p
    p0 = points[0]
    p3 = points[-1]
    if len(points) == 2:
        return (
            (p0[0] + (p3[0] - p0[0]) / 3, p0[1] + (p3[1] - p0[1]) / 3),
            (p0[0] + 2 * (p3[0] - p0[0]) / 3, p0[1] + 2 * (p3[1] - p0[1]) / 3),
        )
    us = _chord_params(points)
    c11 = c12 = c22 = 0.0
    x1 = [0.0, 0.0]
    x2 = [0.0, 0.0]
    for point, u in zip(points, us):
        mt = 1.0 - u
        b0 = mt**3
        b1 = 3 * u * mt * mt
        b2 = 3 * u * u * mt
        b3 = u**3
        c11 += b1 * b1
        c12 += b1 * b2
        c22 += b2 * b2
        rx = point[0] - (b0 * p0[0] + b3 * p3[0])
        ry = point[1] - (b0 * p0[1] + b3 * p3[1])
        x1[0] += b1 * rx
        x1[1] += b1 * ry
        x2[0] += b2 * rx
        x2[1] += b2 * ry
    det = c11 * c22 - c12 * c12
    if abs(det) < 1e-12:
        return (
            (p0[0] + (p3[0] - p0[0]) / 3, p0[1] + (p3[1] - p0[1]) / 3),
            (p0[0] + 2 * (p3[0] - p0[0]) / 3, p0[1] + 2 * (p3[1] - p0[1]) / 3),
        )
    p1 = ((c22 * x1[0] - c12 * x2[0]) / det, (c22 * x1[1] - c12 * x2[1]) / det)
    p2 = ((c11 * x2[0] - c12 * x1[0]) / det, (c11 * x2[1] - c12 * x1[1]) / det)
    return p1, p2


def build_path(
    points: Sequence[tuple[float, float]],
    anchors: Sequence[int] | None = None,
    *,
    cubic: bool = True,
) -> list[Command]:
    """Chemin passant par les ancres, segments ajustés en cubiques si demandé."""
    if not points:
        return []
    idx = list(anchors) if anchors else list(range(len(points)))
    idx = sorted({max(0, min(len(points) - 1, i)) for i in idx})
    if len(idx) < 2:
        return [move_to(*points[idx[0] if idx else 0])]
    commands = [move_to(*points[idx[0]])]
    for slot in range(len(idx) - 1):
        left, right = idx[slot], idx[slot + 1]
        target = points[right]
        if not cubic or right - left < 2:
            commands.append(line_to(*target))
            continue
        segment = points[left : right + 1]
        c1, c2 = fit_cubic(segment)
        commands.append(cubic_to(c1[0], c1[1], c2[0], c2[1], target[0], target[1]))
    return commands


def polyline_path(points: Sequence[tuple[float, float]]) -> list[Command]:
    if not points:
        return []
    commands = [move_to(*points[0])]
    commands.extend(line_to(*p) for p in points[1:])
    return commands


# --- Groupe de chemins -------------------------------------------------------


def build_group(
    values: Sequence[float],
    *,
    activity: Sequence[float] | None = None,
    pivots: Sequence[dict[str, Any]] | None = None,
    k: int = 15,
    cubic: bool = True,
) -> dict[str, Any]:
    """Groupe multi-chemins d'une fenêtre : courbe, enveloppes, activité.

    C'est la hiérarchie que le transformer encode : chemins d'abord, groupe
    ensuite. Les enveloppes portent la topologie des pivots (épaules à même
    niveau, résistance plate), l'activité porte la règle d'or.
    """
    points = normalize_window(values)
    anchors = pips(points, k)
    paths: list[list[Command]] = [build_path(points, anchors, cubic=cubic)]
    roles = ["curve"]

    highs: list[tuple[float, float]] = []
    lows: list[tuple[float, float]] = []
    for pivot in pivots or []:
        i = int(pivot.get("index", -1))
        if 0 <= i < len(points):
            (highs if pivot.get("type") == "H" else lows).append(points[i])
    if len(highs) >= 2:
        paths.append(polyline_path(highs))
        roles.append("upper")
    if len(lows) >= 2:
        paths.append(polyline_path(lows))
        roles.append("lower")
    if activity is not None and len(activity) >= 2:
        act_points = normalize_window(list(activity)[: len(values)])
        act_anchors = pips(act_points, max(4, k // 2))
        paths.append(build_path(act_points, act_anchors, cubic=False))
        roles.append("activity")

    return {
        "points": points,
        "anchors": anchors,
        "paths": paths[:MAX_PATHS],
        "roles": roles[:MAX_PATHS],
    }


# --- Tokenisation ------------------------------------------------------------


def quantize(value: float | None, bins: int = ARG_BINS) -> int:
    if value is None:
        return ARG_NONE
    clamped = max(0.0, min(1.0, float(value)))
    return int(round(clamped * (bins - 1))) + 1


def dequantize(token: int, bins: int = ARG_BINS) -> float | None:
    if token <= ARG_NONE:
        return None
    return (token - 1) / (bins - 1)


def tokenize_path(commands: Sequence[Command], max_cmds: int = MAX_CMDS) -> dict[str, Any]:
    """Un chemin → identifiants de commandes et arguments quantifiés, avec SOS/EOS."""
    cmds = [CMD_SOS]
    args = [[ARG_NONE] * N_ARGS]
    for command in list(commands)[: max_cmds - 2]:
        cmds.append(command.cmd)
        args.append([quantize(a) for a in command.args])
    cmds.append(CMD_EOS)
    args.append([ARG_NONE] * N_ARGS)
    length = len(cmds)
    while len(cmds) < max_cmds:
        cmds.append(CMD_PAD)
        args.append([ARG_NONE] * N_ARGS)
    return {"commands": cmds, "args": args, "length": length}


def tokenize_group(
    group: dict[str, Any],
    *,
    max_cmds: int = MAX_CMDS,
    max_paths: int = MAX_PATHS,
) -> dict[str, Any]:
    """Groupe → tenseurs de tokens prêts pour le transformer hiérarchique."""
    paths = list(group.get("paths") or [])[:max_paths]
    commands: list[list[int]] = []
    args: list[list[list[int]]] = []
    lengths: list[int] = []
    for path in paths:
        token = tokenize_path(path, max_cmds)
        commands.append(token["commands"])
        args.append(token["args"])
        lengths.append(token["length"])
    path_mask = [1] * len(paths)
    while len(commands) < max_paths:
        commands.append([CMD_PAD] * max_cmds)
        args.append([[ARG_NONE] * N_ARGS for _ in range(max_cmds)])
        lengths.append(0)
        path_mask.append(0)
    return {
        "commands": commands,
        "args": args,
        "lengths": lengths,
        "path_mask": path_mask,
        "roles": list(group.get("roles") or []),
    }


# --- Sortie SVG --------------------------------------------------------------


def to_svg_d(
    commands: Sequence[Command],
    *,
    width: float = 1.0,
    height: float = 1.0,
    flip_y: bool = True,
    precision: int = 4,
) -> str:
    """Attribut `d` d'un chemin. `flip_y` remet l'axe des valeurs vers le haut."""

    def fx(x: float | None) -> str:
        return f"{(0.0 if x is None else x) * width:.{precision}f}"

    def fy(y: float | None) -> str:
        v = 0.0 if y is None else y
        return f"{((1.0 - v) if flip_y else v) * height:.{precision}f}"

    parts: list[str] = []
    for command in commands:
        if command.cmd == CMD_MOVE:
            parts.append(f"M {fx(command.args[4])} {fy(command.args[5])}")
        elif command.cmd == CMD_LINE:
            parts.append(f"L {fx(command.args[4])} {fy(command.args[5])}")
        elif command.cmd == CMD_CUBIC:
            parts.append(
                "C "
                f"{fx(command.args[0])} {fy(command.args[1])} "
                f"{fx(command.args[2])} {fy(command.args[3])} "
                f"{fx(command.args[4])} {fy(command.args[5])}"
            )
        elif command.cmd == CMD_CLOSE:
            parts.append("Z")
    return " ".join(parts)


def group_to_svg(
    group: dict[str, Any],
    *,
    width: float = 256.0,
    height: float = 128.0,
) -> list[dict[str, str]]:
    paths = group.get("paths") or []
    roles = group.get("roles") or []
    out: list[dict[str, str]] = []
    for i, path in enumerate(paths):
        out.append(
            {
                "role": roles[i] if i < len(roles) else f"path{i}",
                "d": to_svg_d(path, width=width, height=height),
            }
        )
    return out


def parse_svg_d(d: str, *, flip_y: bool = True) -> list[Command]:
    """Lecture d'un `d` normalisé (M/L/C/Z, coordonnées absolues dans [0, 1])."""
    tokens = d.replace(",", " ").split()
    commands: list[Command] = []
    i = 0

    def take(count: int) -> list[float]:
        nonlocal i
        out: list[float] = []
        while len(out) < count and i < len(tokens):
            try:
                value = float(tokens[i])
            except ValueError:
                break
            out.append(value)
            i += 1
        return out

    def conv_y(y: float) -> float:
        return 1.0 - y if flip_y else y

    while i < len(tokens):
        head = tokens[i].upper()
        i += 1
        if head == "M":
            xs = take(2)
            if len(xs) == 2:
                commands.append(move_to(xs[0], conv_y(xs[1])))
        elif head == "L":
            xs = take(2)
            if len(xs) == 2:
                commands.append(line_to(xs[0], conv_y(xs[1])))
        elif head == "C":
            xs = take(6)
            if len(xs) == 6:
                commands.append(
                    cubic_to(xs[0], conv_y(xs[1]), xs[2], conv_y(xs[3]), xs[4], conv_y(xs[5]))
                )
        elif head == "Z":
            commands.append(close_path())
    return commands


def sample_commands(commands: Sequence[Command], count: int = 64) -> list[tuple[float, float]]:
    """Échantillonne un chemin en points — pour le DTW et les croquis libres."""
    if not commands:
        return []
    dense: list[tuple[float, float]] = []
    cursor = commands[0].end if commands[0].cmd == CMD_MOVE else (0.0, 0.0)
    dense.append(cursor)
    for command in commands:
        if command.cmd == CMD_MOVE:
            cursor = command.end
            dense.append(cursor)
        elif command.cmd == CMD_LINE:
            target = command.end
            for step in range(1, 9):
                t = step / 8
                dense.append(
                    (cursor[0] + (target[0] - cursor[0]) * t, cursor[1] + (target[1] - cursor[1]) * t)
                )
            cursor = target
        elif command.cmd == CMD_CUBIC:
            p0 = cursor
            p1 = (command.args[0] or 0.0, command.args[1] or 0.0)
            p2 = (command.args[2] or 0.0, command.args[3] or 0.0)
            p3 = command.end
            for step in range(1, 17):
                t = step / 16
                mt = 1 - t
                dense.append(
                    (
                        mt**3 * p0[0] + 3 * mt * mt * t * p1[0] + 3 * mt * t * t * p2[0] + t**3 * p3[0],
                        mt**3 * p0[1] + 3 * mt * mt * t * p1[1] + 3 * mt * t * t * p2[1] + t**3 * p3[1],
                    )
                )
            cursor = p3
    if len(dense) <= count:
        return dense
    stride = (len(dense) - 1) / (count - 1)
    return [dense[min(len(dense) - 1, int(round(i * stride)))] for i in range(count)]


def resample_values(values: Sequence[float], count: int) -> list[float]:
    """Ré-échantillonnage linéaire — sert aux déformations temporelles."""
    n = len(values)
    if n == 0 or count <= 0:
        return []
    if n == 1:
        return [float(values[0])] * count
    if count == 1:
        return [float(values[0])]
    out: list[float] = []
    for i in range(count):
        pos = i * (n - 1) / (count - 1)
        left = int(math.floor(pos))
        right = min(n - 1, left + 1)
        frac = pos - left
        out.append(float(values[left]) * (1 - frac) + float(values[right]) * frac)
    return out
