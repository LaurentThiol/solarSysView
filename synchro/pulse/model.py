"""Syntonisation : phase fermée, fondamentale, double cycle, groupes, tranches."""

from __future__ import annotations

import math
from typing import Any

import numpy as np

PERIOD_MIN = 2
PERIOD_MAX = 60
SLICE_SPAN = 40
SLICE_STEP = 10
PHASE_TOL = 0.15
PAIR_PHASE = (0.4, 0.6)
TRIPLET_GAP = 0.08
SCORE_RATIO = 0.85
SCORE_FLOOR = 0.5
DOUBLE_GAIN = 0.05
NULL_DRAWS = 16
LONG_PRESETS = frozenset({"last_200", "year", "year_n1", "year_n2"})
FAMILIES = ("simple", "double", "pair", "triplet")
PULSE_PRESETS = (
    "last_20",
    "last_50",
    "last_100",
    "last_200",
    "year",
    "year_n1",
    "year_n2",
)

DISCLAIMER = (
    "Les tirages sont indépendants. Pulse décrit le tracé, pas le prochain "
    "tirage. Unités : période en tirages et cycles/tirage."
)


def period_limit(length: int) -> int:
    """Plus longue période identifiable : min(60, N/2)."""
    return min(PERIOD_MAX, max(0, int(length) // 2))


def circ_dist(left: float, right: float) -> float:
    delta = abs(float(left) - float(right)) % 1.0
    return min(delta, 1.0 - delta)


def _empty_fit(draws: int, hits: int) -> dict[str, Any]:
    return {
        "period": None,
        "phase": None,
        "period2": None,
        "phase2": None,
        "generator": "simple",
        "concordance": 0.0,
        "lobe_rate": 0.0,
        "r": 0.0,
        "p": 1.0,
        "hits": int(hits),
        "draws": int(draws),
    }


def _concordance(lobe_rate: float) -> float:
    return float(np.clip(2.0 * (lobe_rate - 0.5), 0.0, 1.0))


def score_times(times: np.ndarray, period: int, draws: int) -> dict[str, Any]:
    """Phase optimale = argument de la somme des exp(2πi t / P) aux sorties."""
    idx = np.asarray(times, dtype=float).ravel()
    count = int(idx.size)
    if count < 2 or period < PERIOD_MIN:
        return _empty_fit(draws, count)
    angles = 2.0 * math.pi * idx / float(period)
    mean = np.exp(1j * angles).mean()
    radius = float(abs(mean))
    psi = float(np.angle(mean))
    lobe = np.cos(angles - psi) > 0.0
    lobe_rate = float(np.mean(lobe))
    phase = (psi / (2.0 * math.pi)) % 1.0
    return {
        "period": int(period),
        "phase": float(phase),
        "period2": None,
        "phase2": None,
        "generator": "simple",
        "concordance": _concordance(lobe_rate),
        "lobe_rate": lobe_rate,
        "r": radius,
        "p": float(math.exp(-count * radius * radius)),
        "hits": count,
        "draws": int(draws),
    }


def _hit_times(hits: np.ndarray, offset: int) -> np.ndarray:
    local = np.flatnonzero(np.asarray(hits, dtype=float) > 0.5)
    return local.astype(float) + float(offset)


def score_grid(hits: np.ndarray, offset: int = 0) -> list[dict[str, Any]]:
    mask = np.asarray(hits, dtype=float)
    draws = int(mask.size)
    times = _hit_times(mask, offset)
    cap = period_limit(draws)
    if times.size < 2 or cap < PERIOD_MIN:
        return []
    return [score_times(times, period, draws) for period in range(PERIOD_MIN, cap + 1)]


def principal_fit(hits: np.ndarray, offset: int = 0) -> dict[str, Any]:
    """Garde la fondamentale : la plus longue période d’une famille d’harmoniques."""
    mask = np.asarray(hits, dtype=float)
    grid = score_grid(mask, offset)
    if not grid:
        return _empty_fit(int(mask.size), int(np.count_nonzero(mask > 0.5)))
    best_r = max(row["r"] for row in grid)
    floor = max(SCORE_FLOOR, SCORE_RATIO * best_r)
    candidates = [row for row in grid if row["r"] >= floor - 1e-12]
    if not candidates:
        candidates = [max(grid, key=lambda row: (row["r"], row["period"]))]
    periods = {int(row["period"]) for row in candidates}
    kept = [
        row
        for row in candidates
        if not any(other > int(row["period"]) and other % int(row["period"]) == 0 for other in periods)
    ]
    pool = kept or candidates
    chosen = dict(max(pool, key=lambda row: (row["r"], row["period"])))
    # Le p de Rayleigh vaut pour une période fixée. Ici on a balayé la grille.
    scanned = len(grid)
    raw = float(chosen.get("p") if chosen.get("p") is not None else 1.0)
    chosen["p_raw"] = raw
    chosen["periods_tested"] = scanned
    chosen["p"] = min(1.0, raw * scanned) if scanned else raw
    return chosen


def _product_concordance(
    times: np.ndarray,
    period: int,
    phase: float,
    period2: int,
    phase2: float,
) -> tuple[float, float]:
    if times.size < 2:
        return 0.0, 0.0
    carrier = np.cos(2.0 * math.pi * (times / float(period) - phase))
    modulator = np.cos(2.0 * math.pi * (times / float(period2) - phase2))
    lobe_rate = float(np.mean(carrier * modulator > 0.0))
    return _concordance(lobe_rate), lobe_rate


def best_double(hits: np.ndarray, simple: dict[str, Any], offset: int = 0) -> dict[str, Any] | None:
    """Modulation : produit du cycle principal et d’un cycle secondaire."""
    period = simple.get("period")
    phase = simple.get("phase")
    if period is None or phase is None:
        return None
    mask = np.asarray(hits, dtype=float)
    times = _hit_times(mask, offset)
    draws = int(mask.size)
    cap = period_limit(draws)
    if times.size < 2 or cap < PERIOD_MIN:
        return None
    t = times.astype(float)
    carrier = np.cos(2.0 * math.pi * (t / float(period) - float(phase)))
    best: dict[str, Any] | None = None
    for period2 in range(PERIOD_MIN, cap + 1):
        if period2 == period or period % period2 == 0 or period2 % period == 0:
            continue
        phase2 = np.arange(period2, dtype=float) / float(period2)
        modulator = np.cos(2.0 * math.pi * (t[None, :] / float(period2) - phase2[:, None]))
        rates = np.mean(carrier[None, :] * modulator > 0.0, axis=1)
        concordance = np.clip(2.0 * (rates - 0.5), 0.0, 1.0)
        choice = int(np.argmax(concordance))
        score = float(concordance[choice])
        if best is None or score > best["concordance"]:
            best = {
                "period2": period2,
                "phase2": float(phase2[choice]),
                "concordance": score,
                "lobe_rate": float(rates[choice]),
            }
    return best


def _null_gains(hits: np.ndarray, offset: int, seed: int) -> list[float]:
    rng = np.random.default_rng(seed)
    gains: list[float] = []
    for _ in range(NULL_DRAWS):
        shuffled = rng.permutation(np.asarray(hits, dtype=float))
        simple = principal_fit(shuffled, offset)
        if simple["period"] is None:
            gains.append(0.0)
            continue
        alt = best_double(shuffled, simple, offset)
        gain = 0.0 if alt is None else float(alt["concordance"]) - float(simple["concordance"])
        gains.append(gain)
    return gains


def fit_one(
    hits: np.ndarray,
    *,
    families: tuple[str, ...] | list[str],
    offset: int = 0,
    seed: int = 0,
) -> dict[str, Any]:
    """Cycle simple, puis double cycle seulement si le gain bat le nul."""
    simple = principal_fit(hits, offset)
    wanted = set(families)
    if "double" not in wanted or simple["period"] is None or simple["concordance"] >= 0.999:
        return simple
    alt = best_double(hits, simple, offset)
    if alt is None:
        return simple
    gain = float(alt["concordance"]) - float(simple["concordance"])
    if gain < DOUBLE_GAIN:
        return simple
    nulls = _null_gains(hits, offset, seed)
    if gain <= max(nulls, default=0.0):
        return simple
    upgraded = dict(simple)
    upgraded["generator"] = "double"
    upgraded["period2"] = int(alt["period2"])
    upgraded["phase2"] = float(alt["phase2"])
    upgraded["concordance"] = float(alt["concordance"])
    upgraded["lobe_rate"] = float(alt["lobe_rate"])
    return upgraded


def _window_spans(length: int) -> list[tuple[int, int]]:
    if length <= 0:
        return []
    if length < SLICE_SPAN:
        return [(0, length)]
    starts = list(range(0, length - SLICE_SPAN + 1, SLICE_STEP))
    tail = length - SLICE_SPAN
    if tail != starts[-1]:
        starts.append(tail)
    return [(start, start + SLICE_SPAN) for start in starts]


def merged_ranges(hits: np.ndarray) -> list[tuple[int, int]]:
    """Fusionne les fenêtres glissantes qui gardent la même fondamentale et une phase stable."""
    mask = np.asarray(hits, dtype=float)
    spans = _window_spans(int(mask.size))
    if len(spans) <= 1:
        return [(0, int(mask.size))] if mask.size else []
    blocks: list[dict[str, Any]] = []
    for start, end in spans:
        fit = principal_fit(mask[start:end], start)
        if not blocks:
            blocks.append(
                {"start": start, "end": end, "period": fit["period"], "phase": fit["phase"]}
            )
            continue
        prev = blocks[-1]
        same = (
            fit["period"] is not None
            and fit["period"] == prev["period"]
            and fit["phase"] is not None
            and prev["phase"] is not None
            and circ_dist(float(fit["phase"]), float(prev["phase"])) <= PHASE_TOL
        )
        if same:
            prev["end"] = max(int(prev["end"]), end)
        else:
            blocks.append(
                {"start": start, "end": end, "period": fit["period"], "phase": fit["phase"]}
            )
    return [(int(block["start"]), int(block["end"])) for block in blocks]


def _prefix(kind: str) -> str:
    return "e" if kind == "star" else "b"


def _round_phase(value: float | None) -> float | None:
    if value is None:
        return None
    rounded = round(float(value) % 1.0, 4)
    return 0.0 if rounded >= 1.0 else rounded


def _round_fit(fit: dict[str, Any]) -> dict[str, Any]:
    out = dict(fit)
    for key in ("phase", "phase2"):
        if key in out:
            out[key] = _round_phase(out[key])
    for key in ("concordance", "lobe_rate", "r"):
        if out.get(key) is not None:
            out[key] = round(float(out[key]), 4)
    for key in ("p", "p_raw"):
        if out.get(key) is not None:
            out[key] = round(float(out[key]), 6)
    return out


def analyze_hits(
    hits: np.ndarray,
    *,
    families: tuple[str, ...] | list[str],
    preset: str,
    dates: list[str],
    kind: str,
    n: int,
    seed: int = 0,
) -> dict[str, Any]:
    """Tranches datées. Les fenêtres longues sont redécoupées si la période change."""
    mask = np.asarray(hits, dtype=float)
    length = int(mask.size)
    if preset in LONG_PRESETS and length >= SLICE_SPAN:
        ranges = merged_ranges(mask)
    else:
        ranges = [(0, length)] if length else []
    slices: list[dict[str, Any]] = []
    anchors: list[dict[str, Any]] = []
    prefix = _prefix(kind)
    for index, (start, end) in enumerate(ranges, start=1):
        fit = _round_fit(fit_one(mask[start:end], families=families, offset=start, seed=seed))
        slice_dates = dates[start:end]
        row = {
            "id": f"{prefix}{int(n)}-{preset}-{index}",
            "preset": preset,
            "from": slice_dates[0] if slice_dates else None,
            "to": slice_dates[-1] if slice_dates else None,
            "start": int(start),
            "end": int(end),
            **fit,
        }
        slices.append(row)
        if fit["period"] is not None:
            anchors.append(
                {
                    "preset": preset,
                    "kind": kind,
                    "n": int(n),
                    "period": int(fit["period"]),
                    "phase": float(fit["phase"]),
                    "r": float(fit["r"]),
                    "p": float(fit["p"]),
                    "hits": int(fit["hits"]),
                    "concordance": float(fit["concordance"]),
                    "hit_times": _hit_times(mask[start:end], start).astype(int).tolist(),
                    "span": int(end - start),
                    "from": row["from"],
                    "to": row["to"],
                }
            )
    anchor = max(anchors, key=lambda item: (item["span"], item["concordance"]), default=None)
    return {"kind": kind, "n": int(n), "preset": preset, "slices": slices, "anchor": anchor}


def wave_samples(fit: dict[str, Any], start: int, end: int) -> tuple[list[float], list[float]]:
    """Onde théorique et phase principale sur les index [start, end)."""
    period = fit.get("period")
    phase = fit.get("phase")
    if period is None or phase is None or end <= start:
        width = max(0, end - start)
        return [0.0] * width, [0.0] * width
    times = np.arange(start, end, dtype=float)
    carrier = np.cos(2.0 * math.pi * (times / float(period) - float(phase)))
    period2 = fit.get("period2")
    phase2 = fit.get("phase2")
    if fit.get("generator") == "double" and period2 and phase2 is not None:
        modulator = np.cos(2.0 * math.pi * (times / float(period2) - float(phase2)))
        samples = carrier * modulator
    else:
        samples = carrier
    turns = np.mod(times / float(period) - float(phase), 1.0)
    return [round(float(value), 4) for value in samples], [round(float(value), 4) for value in turns]


def _phase_at(hit_times: list[int], period: int) -> float | None:
    if len(hit_times) < 2:
        return None
    scored = score_times(np.asarray(hit_times, dtype=float), period, max(hit_times, default=0) + 1)
    return None if scored["period"] is None else float(scored["phase"])


def _period_fits(item: dict[str, Any], period: int) -> bool:
    times = item.get("hit_times") or []
    if len(times) < 2:
        return False
    rescored = score_times(np.asarray(times, dtype=float), period, max(times) + 1)
    if rescored["period"] is None:
        return False
    return float(rescored["r"]) + 1e-9 >= SCORE_RATIO * float(item["r"])


def _common_period(members: list[dict[str, Any]]) -> int | None:
    """Période du membre au plus fort r, si tout le groupe la tient encore."""
    periods = [int(item["period"]) for item in members]
    if not periods or max(periods) - min(periods) > 1:
        return None
    period = int(max(members, key=lambda item: float(item["r"]))["period"])
    if any(not _period_fits(item, period) for item in members):
        return None
    return period


def _compatible_period(left: dict[str, Any], right: dict[str, Any]) -> int | None:
    return _common_period([left, right])


def _member_phase(item: dict[str, Any], period: int) -> float:
    phase = _phase_at(item["hit_times"], period)
    return float(item["phase"] if phase is None else phase)


def _rotation_period(
    members: list[dict[str, Any]],
    period: int,
    phases: list[float],
) -> tuple[int, float, float]:
    """Cherche une rotation secondaire. Sinon la rotation est le cycle commun."""
    baseline = float(np.mean([item["concordance"] for item in members]))
    best_period = period
    best_phase = phases[0]
    best_score = baseline
    cap = min(PERIOD_MAX, max(period_limit(item["span"]) for item in members))
    k = len(members)
    for period2 in range(PERIOD_MIN, cap + 1):
        if period2 == period or period % period2 == 0 or period2 % period == 0:
            continue
        for step in range(period2):
            phase2 = step / float(period2)
            rates = []
            for index, item in enumerate(members):
                times = np.asarray(item["hit_times"], dtype=float)
                if times.size < 2:
                    rates.append(0.0)
                    continue
                locked = (phase2 + index / float(k)) % 1.0
                concordance, _lobe = _product_concordance(
                    times,
                    period,
                    phases[index],
                    period2,
                    locked,
                )
                rates.append(concordance)
            score = float(np.mean(rates))
            if score > best_score + DOUBLE_GAIN:
                best_score = score
                best_period = period2
                best_phase = phase2
    return best_period, best_phase, best_score


def _group_caution(members: list[dict[str, Any]]) -> tuple[float, int]:
    """p la moins petite et le plus petit nombre de sorties : un pic sur deux dates ne suffit pas."""
    probabilities = [float(item.get("p") if item.get("p") is not None else 1.0) for item in members]
    counts = [int(item.get("hits") or 0) for item in members]
    return round(max(probabilities, default=1.0), 6), min(counts, default=0)


def build_groups(
    anchors: list[dict[str, Any]],
    families: tuple[str, ...] | list[str],
) -> list[dict[str, Any]]:
    """Paires et triplets : même période (± 1 tirage), phases en rotation."""
    wanted = set(families)
    groups: list[dict[str, Any]] = []
    by_kind: dict[str, list[dict[str, Any]]] = {"ball": [], "star": []}
    for item in anchors:
        if item.get("period") is None or item.get("kind") not in by_kind:
            continue
        by_kind[item["kind"]].append(item)
    for kind, rows in by_kind.items():
        if "pair" in wanted:
            groups.extend(_pairs(rows, kind))
        if "triplet" in wanted:
            groups.extend(_triplets(rows, kind))
    groups.sort(
        key=lambda item: (float(item["concordance"]), int(item.get("hits") or 0)),
        reverse=True,
    )
    return groups[:24]


def _pairs(rows: list[dict[str, Any]], kind: str) -> list[dict[str, Any]]:
    found: list[dict[str, Any]] = []
    for index, left in enumerate(rows):
        for right in rows[index + 1 :]:
            period = _compatible_period(left, right)
            if period is None:
                continue
            phase_left = _member_phase(left, period)
            phase_right = _member_phase(right, period)
            if not (PAIR_PHASE[0] <= circ_dist(phase_left, phase_right) <= PAIR_PHASE[1]):
                continue
            ordered = sorted(
                ((left, phase_left), (right, phase_right)),
                key=lambda item: item[1],
            )
            members = [item[0] for item in ordered]
            phases = [item[1] for item in ordered]
            period2, phase2, score = _rotation_period(members, period, phases)
            numbers = sorted(int(item["n"]) for item in members)
            preset = str(left["preset"])
            prefix = _prefix(kind)
            caution_p, caution_hits = _group_caution(members)
            found.append(
                {
                    "id": f"pair-{preset}-{prefix}{numbers[0]}-{prefix}{numbers[1]}",
                    "generator": "pair",
                    "preset": preset,
                    "period": period,
                    "period2": period2,
                    "phase2": _round_phase(phase2),
                    "concordance": round(score, 4),
                    "p": caution_p,
                    "hits": caution_hits,
                    "from": left.get("from"),
                    "to": left.get("to"),
                    "members": [
                        {"kind": kind, "n": int(item["n"]), "phase": _round_phase(phase)}
                        for item, phase in zip(members, phases, strict=True)
                    ],
                }
            )
    return found


def _triplet_gaps(phases: list[float]) -> bool:
    ordered = sorted(phase % 1.0 for phase in phases)
    gaps = (
        ordered[1] - ordered[0],
        ordered[2] - ordered[1],
        (ordered[0] + 1.0) - ordered[2],
    )
    return all(abs(gap - (1.0 / 3.0)) <= TRIPLET_GAP for gap in gaps)


def _triplets(rows: list[dict[str, Any]], kind: str) -> list[dict[str, Any]]:
    found: list[dict[str, Any]] = []
    for i, first in enumerate(rows):
        for j, second in enumerate(rows[i + 1 :], start=i + 1):
            for third in rows[j + 1 :]:
                period = _common_period([first, second, third])
                if period is None:
                    continue
                trio = (first, second, third)
                phases = [_member_phase(item, period) for item in trio]
                if not _triplet_gaps(phases):
                    continue
                ordered = sorted(zip(trio, phases, strict=True), key=lambda item: item[1])
                members = [item[0] for item in ordered]
                ordered_phases = [item[1] for item in ordered]
                period2, phase2, score = _rotation_period(members, period, ordered_phases)
                numbers = sorted(int(item["n"]) for item in members)
                preset = str(first["preset"])
                prefix = _prefix(kind)
                tag = "-".join(f"{prefix}{number}" for number in numbers)
                caution_p, caution_hits = _group_caution(members)
                found.append(
                    {
                        "id": f"triplet-{preset}-{tag}",
                        "generator": "triplet",
                        "preset": preset,
                        "period": period,
                        "period2": period2,
                        "phase2": _round_phase(phase2),
                        "concordance": round(score, 4),
                        "p": caution_p,
                        "hits": caution_hits,
                        "from": first.get("from"),
                        "to": first.get("to"),
                        "members": [
                            {"kind": kind, "n": int(item["n"]), "phase": _round_phase(phase)}
                            for item, phase in zip(members, ordered_phases, strict=True)
                        ],
                    }
                )
    return found
