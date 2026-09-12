"""Contrat du suivi pair/impair (Évolution) : pair = +1, impair = −1.

La courbe UI (`src/lib/draws.ts`) additionne ces scores dans la fenêtre.
"""

from math import sqrt


def parity_score(values: list[int]) -> int:
    return sum(1 if n % 2 == 0 else -1 for n in values)


def cumulative_sum(values: list[int]) -> list[int]:
    acc = 0
    out: list[int] = []
    for value in values:
        acc += value
        out.append(acc)
    return out


def signed_streak(values: list[int]) -> tuple[int, int]:
    i = len(values) - 1
    while i >= 0 and values[i] == 0:
        i -= 1
    if i < 0:
        return (0, 0)
    sign = 1 if values[i] > 0 else -1
    length = 0
    for j in range(i, -1, -1):
        value = values[j]
        if value == 0 or (1 if value > 0 else -1) != sign:
            break
        length += 1
    return (sign, length)


def test_five_evens_score_plus_five():
    assert parity_score([2, 4, 6, 8, 10]) == 5


def test_five_odds_score_minus_five():
    assert parity_score([1, 3, 5, 7, 9]) == -5


def test_mixed_numbers_two_even_three_odd():
    assert parity_score([1, 2, 3, 4, 5]) == -1


def test_stars_split_is_zero():
    assert parity_score([2, 11]) == 0


def test_stars_both_even():
    assert parity_score([2, 12]) == 2


def test_stars_both_odd():
    assert parity_score([1, 11]) == -2


def test_score_equals_even_minus_odd():
    balls = [7, 12, 19, 28, 41]
    even = sum(1 for n in balls if n % 2 == 0)
    odd = 5 - even
    assert parity_score(balls) == even - odd == 2 * even - 5


def test_walk_accumulates_and_can_return_to_zero():
    steps = [
        parity_score([2, 4, 6, 8, 10]),
        parity_score([1, 3, 5, 7, 9]),
    ]
    assert steps == [5, -5]
    assert cumulative_sum(steps) == [5, 0]


def test_walk_is_chronological_prefix_sum():
    draws = [
        [1, 2, 3, 4, 5],  # -1
        [2, 4, 6, 8, 10],  # +5
        [1, 3, 5, 7, 9],  # -5
    ]
    assert cumulative_sum([parity_score(d) for d in draws]) == [-1, 4, -1]


def test_streak_ignores_trailing_ties_then_counts_majority():
    assert signed_streak([1, 1, 1]) == (1, 3)
    assert signed_streak([-1, -1, 0]) == (-1, 2)
    assert signed_streak([1, -2, 2]) == (1, 1)
    assert signed_streak([0, 0]) == (0, 0)


def test_five_ball_score_is_always_odd():
    assert parity_score([1, 2, 3, 4, 5]) % 2 != 0
    assert parity_score([2, 4, 6, 8, 10]) % 2 != 0
    assert parity_score([1, 3, 5, 7, 9]) % 2 != 0


def test_two_star_score_is_always_even():
    assert parity_score([1, 2]) % 2 == 0
    assert parity_score([2, 12]) % 2 == 0
    assert parity_score([1, 11]) % 2 == 0


def test_hypergeometric_sigma_matches_ui_constants():
    # 5/50, 25 pairs : Var(score) = 225/49, σ = 15/7
    var_n = 4 * 5 * (25 / 50) * (25 / 50) * (45 / 49)
    assert var_n == 225 / 49
    assert sqrt(var_n) == 15 / 7
    # 2/12, 6 pairs : Var(score) = 20/11
    var_s = 4 * 2 * (6 / 12) * (6 / 12) * (10 / 11)
    assert var_s == 20 / 11
    assert abs(sqrt(var_s) - sqrt(20 / 11)) < 1e-12
