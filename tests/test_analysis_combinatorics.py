from synchro.analysis.combinatorics import (
    TOTAL_GRIDS,
    consecutive_distribution,
    coupon_collector,
    p_grid_match,
    parity_distribution,
    proba_tables,
    spread_distribution,
    sum_distribution,
    sum_ways,
)


def test_combinatorics_invariants():
    tables = proba_tables()
    assert tables["total_grids"] == TOTAL_GRIDS == 139_838_160
    p_sum = sum(row["p"] for row in tables["ranks"])
    assert abs(p_sum - 1.0) < 1e-12
    ways = sum_ways()
    assert sum(ways) == 2_118_760
    dens = sum_distribution()["density"]
    assert abs(sum(row["p"] for row in dens) - 1.0) < 1e-12
    spreads = spread_distribution()
    assert sum(row["ways"] for row in spreads["density"]) == 2_118_760
    consec = consecutive_distribution()
    assert sum(row["ways"] for row in consec["density"]) == 2_118_760
    parity = parity_distribution()
    assert sum(row["ways"] for row in parity["density"]) == 2_118_760
    assert "parity" in tables
    assert p_grid_match(5, 2) == tables["ranks"][0]["p"]
    coupon = coupon_collector()
    assert coupon["expected_draws"] > 50 / 5
