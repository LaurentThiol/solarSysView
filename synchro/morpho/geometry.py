"""Détecteurs morphologiques sur les coordonnées de grille (pas les pixels)."""

from __future__ import annotations

from collections import Counter
from typing import Any, Iterable

from synchro.analysis.common import as_date, iso, numbers_of, stars_of, weekday_of
from synchro.morpho.board import N_COLS, N_ROWS, number_cell, occupancy, star_cell
from synchro.morpho.lexicon import MOTIF_IDS, caption_from_facts, facts_from

CENTER_ROWS = {1, 2, 3}
CENTER_COLS = {2, 3, 4, 5, 6, 7}


def _cells(numbers: Iterable[int]) -> list[tuple[int, int]]:
    return [number_cell(int(n)) for n in numbers]


def _star_cells(stars: Iterable[int]) -> list[tuple[int, int]]:
    return [star_cell(int(s)) for s in stars]


def _bbox(cells: list[tuple[int, int]]) -> tuple[int, int, int, int, int]:
    rows = [r for r, _ in cells]
    cols = [c for _, c in cells]
    min_r, max_r = min(rows), max(rows)
    min_c, max_c = min(cols), max(cols)
    area = (max_r - min_r + 1) * (max_c - min_c + 1)
    return min_r, min_c, max_r, max_c, area


def _line_groups(cells: list[tuple[int, int]]) -> dict[str, list[int]]:
    rows: Counter[int] = Counter()
    cols: Counter[int] = Counter()
    diag_a: Counter[int] = Counter()  # row - col
    diag_b: Counter[int] = Counter()  # row + col
    for r, c in cells:
        rows[r] += 1
        cols[c] += 1
        diag_a[r - c] += 1
        diag_b[r + c] += 1
    return {
        "row": list(rows.values()),
        "col": list(cols.values()),
        "diag_a": list(diag_a.values()),
        "diag_b": list(diag_b.values()),
        "max_row": max(rows.values()) if rows else 0,
        "max_col": max(cols.values()) if cols else 0,
        "max_diag": max(
            [max(diag_a.values()) if diag_a else 0, max(diag_b.values()) if diag_b else 0]
        ),
    }


def _is_line(cells: list[tuple[int, int]]) -> bool:
    if len(cells) < 5:
        return False
    g = _line_groups(cells)
    return g["max_row"] >= 5 or g["max_col"] >= 5 or g["max_diag"] >= 5


def _has_wedge(cells: list[tuple[int, int]]) -> bool:
    if _is_line(cells) or len(cells) < 5:
        return False
    g = _line_groups(cells)
    return g["max_row"] >= 3 or g["max_col"] >= 3 or g["max_diag"] >= 3


def _mirror_pairs(cells: list[tuple[int, int]]) -> int:
    occ = set(cells)
    seen: set[tuple[int, int]] = set()
    pairs = 0
    for r, c in cells:
        if (r, c) in seen:
            continue
        mirror = (r, N_COLS - 1 - c)
        if mirror[1] == c:
            continue
        if mirror in occ:
            pairs += 1
            seen.add((r, c))
            seen.add(mirror)
    return pairs


def _is_w_shape(cells: list[tuple[int, int]]) -> bool:
    if len(cells) != 5:
        return False
    by_row: dict[int, list[int]] = {}
    for r, c in cells:
        by_row.setdefault(r, []).append(c)
    if len(by_row) != 3:
        return False
    rows = sorted(by_row)
    counts = [len(by_row[r]) for r in rows]
    if counts != [2, 1, 2]:
        return False
    mid_c = by_row[rows[1]][0]
    others = by_row[rows[0]] + by_row[rows[2]]
    return min(others) < mid_c < max(others)


def detect(numbers: list[int], stars: list[int]) -> dict[str, Any]:
    nums = sorted(int(n) for n in numbers)
    sts = sorted(int(s) for s in stars)
    cells = _cells(nums)
    scells = _star_cells(sts)
    g = _line_groups(cells)
    min_r, min_c, max_r, max_c, area = _bbox(cells)
    mean_r = sum(r for r, _ in cells) / len(cells)
    mean_c = sum(c for _, c in cells) / len(cells)

    center_n = sum(1 for r, c in cells if r in CENTER_ROWS and c in CENTER_COLS)
    peri_n = sum(1 for r, c in cells if r in (0, N_ROWS - 1) or c in (0, N_COLS - 1))
    top_n = sum(1 for r, _ in cells if r <= 1)
    bot_n = sum(1 for r, _ in cells if r >= 3)
    left_n = sum(1 for _, c in cells if c <= 2)
    right_n = sum(1 for _, c in cells if c >= 7)

    star_cheb = 99
    if len(scells) == 2:
        (r1, c1), (r2, c2) = scells
        star_cheb = max(abs(r1 - r2), abs(c1 - c2))

    motifs: list[str] = []
    if g["max_row"] >= 3:
        motifs.append("align_h")
    if g["max_col"] >= 3:
        motifs.append("align_v")
    if g["max_diag"] >= 3:
        motifs.append("diagonal")
    if _is_line(cells):
        motifs.append("line")
    if _has_wedge(cells):
        motifs.append("wedge")
    if area <= 9:
        motifs.append("cluster")
    if area >= 30:
        motifs.append("spread")
    if center_n >= 3:
        motifs.append("center")
    if peri_n >= 4:
        motifs.append("periphery")
    if top_n >= 3:
        motifs.append("top")
    if bot_n >= 3:
        motifs.append("bottom")
    if left_n >= 3:
        motifs.append("left")
    if right_n >= 3:
        motifs.append("right")
    if _mirror_pairs(cells) >= 2:
        motifs.append("mirror_v")
    if _is_w_shape(cells):
        motifs.append("w_shape")
    if star_cheb <= 1:
        motifs.append("stars_adj")
    if len(scells) == 2 and scells[0][0] == scells[1][0]:
        motifs.append("stars_same_row")

    descriptors = {
        "centroid_row": round(mean_r, 4),
        "centroid_col": round(mean_c, 4),
        "bbox_area": float(area),
        "bbox_h": float(max_r - min_r + 1),
        "bbox_w": float(max_c - min_c + 1),
        "compactness": round(5.0 / area, 4),
        "center_n": float(center_n),
        "periphery_n": float(peri_n),
        "max_row": float(g["max_row"]),
        "max_col": float(g["max_col"]),
        "max_diag": float(g["max_diag"]),
        "mirror_pairs": float(_mirror_pairs(cells)),
        "star_chebyshev": float(star_cheb),
    }
    facts = facts_from(motifs, descriptors)
    flags = [1 if m in motifs else 0 for m in MOTIF_IDS]
    return {
        "numbers": nums,
        "stars": sts,
        "cells": cells,
        "star_cells": scells,
        "motifs": motifs,
        "descriptors": descriptors,
        "facts": facts,
        "caption": caption_from_facts(facts),
        "flags": flags,
        "occupancy": occupancy(nums, sts),
    }


def analyze_draw(draw: dict[str, Any]) -> dict[str, Any]:
    raw_date = draw.get("draw_date") or draw.get("date")
    portrait = detect(numbers_of(draw), stars_of(draw))
    portrait["date"] = iso(as_date(raw_date)) if raw_date else None
    portrait["weekday"] = weekday_of(draw)
    return portrait


def signature_vector(portrait: dict[str, Any]) -> list[float]:
    flags = [float(x) for x in portrait["flags"]]
    d = portrait["descriptors"]
    extra = [
        d["centroid_row"] / 4.0,
        d["centroid_col"] / 9.0,
        d["compactness"],
        d["bbox_area"] / 50.0,
        min(d["star_chebyshev"], 6.0) / 6.0,
    ]
    occ = [float(x) for x in portrait["occupancy"]]
    return flags + extra + occ


def cosine(a: list[float], b: list[float]) -> float:
    num = sum(x * y for x, y in zip(a, b))
    na = sum(x * x for x in a) ** 0.5
    nb = sum(y * y for y in b) ** 0.5
    if na == 0 or nb == 0:
        return 0.0
    return num / (na * nb)


def jaccard(a: Iterable[str], b: Iterable[str]) -> float:
    sa, sb = set(a), set(b)
    if not sa and not sb:
        return 1.0
    if not sa or not sb:
        return 0.0
    return len(sa & sb) / len(sa | sb)
