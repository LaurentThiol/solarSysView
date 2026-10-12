"""P(classe_{t+1} | état_t) vs null uniforme."""

from __future__ import annotations

from typing import Any

from synchro.analysis.inference import bh_fdr, binom_two_sided, wilson_interval
from synchro.analysis.montecarlo import simulate_draw
from synchro.morpho.geometry import analyze_draw, detect, jaccard
from synchro.morpho.lexicon import MOTIF_IDS, label_of


def _motif_set(portrait: dict[str, Any]) -> frozenset[str]:
    return frozenset(portrait.get("motifs") or [])


def _null_rates(n_sim: int, seed: int) -> dict[str, float]:
    rng = __import__("random").Random(seed)
    counts = {m: 0 for m in MOTIF_IDS}
    for _ in range(n_sim):
        numbers, stars = simulate_draw(rng)
        for motif in detect(numbers, stars)["motifs"]:
            counts[motif] += 1
    return {m: counts[m] / n_sim for m in MOTIF_IDS}


def anticipate(
    draws: list[dict[str, Any]],
    *,
    n_sim: int = 400,
    seed: int = 0,
    min_jaccard: float = 0.5,
) -> dict[str, Any]:
    portraits = [analyze_draw(d) for d in draws]
    if len(portraits) < 2:
        return {
            "ok": False,
            "error": "il faut au moins deux tirages",
            "current": portraits[0] if portraits else None,
        }
    current = portraits[-1]
    matches: list[frozenset[str]] = []
    for i in range(len(portraits) - 1):
        if jaccard(portraits[i]["motifs"], current["motifs"]) >= min_jaccard:
            matches.append(_motif_set(portraits[i + 1]))

    n = len(matches)
    null = _null_rates(n_sim, seed)
    rows: list[dict[str, Any]] = []
    pvalues: list[float] = []
    for motif in MOTIF_IDS:
        observed = sum(1 for nxt in matches if motif in nxt)
        p0 = null[motif]
        p_hat, lo, hi = wilson_interval(observed, n) if n else (None, None, None)
        p_value = binom_two_sided(observed, n, p0) if n and 0 < p0 < 1 else 1.0
        pvalues.append(p_value)
        rows.append(
            {
                "id": motif,
                "label": label_of(motif),
                "empirical": None if p_hat is None else round(p_hat, 4),
                "wilson_lo": None if lo is None else round(lo, 4),
                "wilson_hi": None if hi is None else round(hi, 4),
                "null": round(p0, 4),
                "observed": observed,
                "n": n,
                "p_value": round(p_value, 4),
                "current": motif in current["motifs"],
            }
        )
    # Les motifs se cumulent : un χ² sur leur somme n'a pas de loi du χ².
    # Chaque forme a son test exact, et le FDR tient les comparaisons ensemble.
    flags = bh_fdr(pvalues, q=0.05) if n else [False] * len(rows)
    for row, flag in zip(rows, flags):
        row["fdr_reject"] = bool(flag)
    rows.sort(key=lambda r: (0 if r["empirical"] is None else -abs((r["empirical"] or 0) - r["null"])))
    return {
        "ok": True,
        "current": {
            "date": current.get("date"),
            "motifs": current["motifs"],
            "caption": current["caption"],
            "weekday": current.get("weekday"),
        },
        "matches": n,
        "min_jaccard": min_jaccard,
        "n_sim": n_sim,
        "fdr_q": 0.05,
        "fdr_rejections": sum(1 for flag in flags if flag),
        "classes": rows,
    }
