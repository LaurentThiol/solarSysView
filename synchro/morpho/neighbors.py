"""kNN visuel sur signature géométrique (occupancy + motifs + descripteurs)."""

from __future__ import annotations

from typing import Any

from synchro.morpho.geometry import analyze_draw, cosine, detect, jaccard, signature_vector


def neighbor_score(a: dict[str, Any], b: dict[str, Any]) -> float:
    vis = cosine(signature_vector(a), signature_vector(b))
    jac = jaccard(a.get("motifs") or [], b.get("motifs") or [])
    return 0.7 * vis + 0.3 * jac


def neighbors_for(
    query: dict[str, Any],
    draws: list[dict[str, Any]],
    *,
    k: int = 8,
    exclude_date: str | None = None,
) -> list[dict[str, Any]]:
    scored: list[dict[str, Any]] = []
    q_date = exclude_date or query.get("date")
    for draw in draws:
        portrait = analyze_draw(draw)
        if q_date and portrait.get("date") == q_date:
            continue
        scored.append(
            {
                **portrait,
                "score": round(neighbor_score(query, portrait), 4),
            }
        )
    scored.sort(key=lambda row: row["score"], reverse=True)
    return scored[:k]


def neighbors_of_grid(
    numbers: list[int],
    stars: list[int],
    draws: list[dict[str, Any]],
    *,
    k: int = 8,
    date: str | None = None,
) -> list[dict[str, Any]]:
    query = detect(numbers, stars)
    query["date"] = date
    return neighbors_for(query, draws, k=k, exclude_date=date)
