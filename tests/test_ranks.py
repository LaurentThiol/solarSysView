import pytest

from synchro.ranks import evaluate_grid, prize_rank, validate_grid


def test_jackpot_rank():
    result = evaluate_grid([1, 2, 3, 4, 5], [1, 2], [5, 4, 3, 2, 1], [2, 1])
    assert result["rank"] == 1
    assert result["matched_numbers"] == 5
    assert result["matched_stars"] == 2


def test_rank_two_numbers_no_star():
    assert prize_rank(2, 0) == 13
    assert prize_rank(1, 1) is None


def test_validate_grid():
    validate_grid([1, 2, 3, 4, 5], [1, 12])
    with pytest.raises(ValueError):
        validate_grid([1, 2, 3, 4], [1, 2])
    with pytest.raises(ValueError):
        validate_grid([1, 2, 3, 4, 5], [1, 1])
    with pytest.raises(ValueError):
        validate_grid([1, 2, 3, 4, 50], [1, 13])
