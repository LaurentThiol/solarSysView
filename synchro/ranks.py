"""Rangs de gains EuroMillions (formule actuelle, 5/50 + 2/12)."""

from __future__ import annotations

RANK_TABLE: dict[tuple[int, int], int] = {
    (5, 2): 1,
    (5, 1): 2,
    (5, 0): 3,
    (4, 2): 4,
    (4, 1): 5,
    (3, 2): 6,
    (4, 0): 7,
    (2, 2): 8,
    (3, 1): 9,
    (3, 0): 10,
    (1, 2): 11,
    (2, 1): 12,
    (2, 0): 13,
}

RANK_LABELS = {
    1: "5 numéros + 2 étoiles",
    2: "5 numéros + 1 étoile",
    3: "5 numéros",
    4: "4 numéros + 2 étoiles",
    5: "4 numéros + 1 étoile",
    6: "3 numéros + 2 étoiles",
    7: "4 numéros",
    8: "2 numéros + 2 étoiles",
    9: "3 numéros + 1 étoile",
    10: "3 numéros",
    11: "1 numéro + 2 étoiles",
    12: "2 numéros + 1 étoile",
    13: "2 numéros",
}


def match_counts(grid_numbers: list[int], grid_stars: list[int], draw_numbers: list[int], draw_stars: list[int]) -> tuple[int, int]:
    n = len(set(grid_numbers) & set(draw_numbers))
    s = len(set(grid_stars) & set(draw_stars))
    return n, s


def prize_rank(matched_numbers: int, matched_stars: int) -> int | None:
    return RANK_TABLE.get((matched_numbers, matched_stars))


def evaluate_grid(
    grid_numbers: list[int],
    grid_stars: list[int],
    draw_numbers: list[int],
    draw_stars: list[int],
) -> dict:
    matched_n, matched_s = match_counts(grid_numbers, grid_stars, draw_numbers, draw_stars)
    rank = prize_rank(matched_n, matched_s)
    return {
        "matched_numbers": matched_n,
        "matched_stars": matched_s,
        "rank": rank,
        "label": RANK_LABELS.get(rank) if rank else "Pas de gain",
        "winning_numbers": sorted(set(grid_numbers) & set(draw_numbers)),
        "winning_stars": sorted(set(grid_stars) & set(draw_stars)),
    }


def validate_grid(numbers: list[int], stars: list[int], star_max: int = 12) -> None:
    if len(numbers) != 5 or len(set(numbers)) != 5:
        raise ValueError("Il faut exactement 5 numéros distincts.")
    if any(n < 1 or n > 50 for n in numbers):
        raise ValueError("Les numéros doivent être compris entre 1 et 50.")
    if len(stars) != 2 or len(set(stars)) != 2:
        raise ValueError("Il faut exactement 2 étoiles distinctes.")
    if any(s < 1 or s > star_max for s in stars):
        raise ValueError(f"Les étoiles doivent être comprises entre 1 et {star_max}.")
