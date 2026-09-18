"""Noyau rails : contacts, classification, construction à 3 clics."""

from synchro.chartisme.catalog import is_rail_figure, slope_bias_label
from synchro.chartisme.rails import (
    classify_bounds,
    construct_rails,
    fit_rail_pair,
    fit_supporting_line,
    line_at,
    project_rail_target,
    slope_bias_of,
)


def test_supporting_rails_rest_on_contacts() -> None:
    highs = [
        {"index": 0, "price": 20.0},
        {"index": 4, "price": 21.0},
        {"index": 8, "price": 19.4},
    ]
    line = fit_supporting_line(highs, "upper", 0.05, 10.0)
    assert line is not None
    for point in highs:
        assert float(point["price"]) - line_at(line, float(point["index"])) <= 0.5 + 1e-9


def test_parallel_tilted_contacts_classify_as_canal() -> None:
    highs = [
        {"index": 0, "price": 30.0},
        {"index": 5, "price": 35.0},
        {"index": 10, "price": 40.0},
    ]
    lows = [
        {"index": 2, "price": 10.0},
        {"index": 7, "price": 15.0},
        {"index": 12, "price": 20.0},
    ]
    pair = fit_rail_pair(highs, lows, eps=0.05, scale=30.0)
    assert pair is not None
    assert pair["figure"] == "canal"
    assert pair["slope_bias"] == "up"
    assert pair["height"] > 10


def test_flat_envelope_classifies_as_rectangle() -> None:
    highs = [
        {"index": 1, "price": 20.0},
        {"index": 5, "price": 20.2},
        {"index": 9, "price": 19.9},
    ]
    lows = [
        {"index": 3, "price": 8.0},
        {"index": 7, "price": 8.1},
        {"index": 11, "price": 7.9},
    ]
    pair = fit_rail_pair(highs, lows, eps=0.05, scale=20.0)
    assert pair is not None
    assert pair["figure"] == "rectangle"
    assert pair["slope_bias"] == "flat"
    assert pair["upper"][0] == 0
    assert pair["lower"][0] == 0


def test_three_click_canal_is_parallel() -> None:
    dates = [f"2026-06-{i + 1:02d}" for i in range(12)]
    built = construct_rails(
        figure="canal",
        dates=dates,
        a={"index": 1, "actual": 10.0},
        b={"index": 8, "actual": 17.0},
        c={"index": 4, "actual": 4.0},
    )
    assert built is not None
    assert abs(built["upper"][0] - built["lower"][0]) < 1e-9
    assert built["slope_bias"] == "up"


def test_slope_badge_is_not_a_class() -> None:
    assert is_rail_figure("canal")
    assert is_rail_figure("tunnel_droit")
    assert slope_bias_label("canal", "up") == "Canal haussier"
    assert slope_bias_label("canal", "flat") == "Canal"
    assert classify_bounds((0.8, 10.0), (0.8, 0.0), 0, 10) == ("canal", "any")
    assert slope_bias_of((0.8, 10.0), (0.8, 0.0), 0, 10) == "up"


def test_projected_target_reports_height() -> None:
    values = [10, 11, 12, 13, 14, 15, 16, 17, 18, 30]
    target = project_rail_target(values, (0.0, 20.0), (0.0, 10.0), 7, "any")
    assert target is not None
    assert target["direction"] == "up"
    assert target["value"] > 20
