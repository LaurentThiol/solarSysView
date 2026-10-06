from synchro.db import _draw_filter_clauses
from synchro.weekday import (
    filter_draws_by_weekday,
    normalize_weekday_filter,
    weekday_of,
)


def test_normalize_weekday_filter_is_case_insensitive():
    assert normalize_weekday_filter("MARDI") == "mardi"
    assert normalize_weekday_filter("Vendredi") == "vendredi"
    assert normalize_weekday_filter("lundi") is None
    assert normalize_weekday_filter("synthese") is None
    assert normalize_weekday_filter("") is None


def test_filter_draws_by_weekday_keeps_only_that_day():
    rows = [
        {"weekday": "MARDI", "n": 1},
        {"weekday": "vendredi", "n": 2},
        {"weekday": "mardi", "n": 3},
    ]
    assert [r["n"] for r in filter_draws_by_weekday(rows, "Mardi")] == [1, 3]
    assert [r["n"] for r in filter_draws_by_weekday(rows, None)] == [1, 2, 3]
    assert weekday_of(rows[0]) == "mardi"


def test_draw_weekday_clause_lowercases_param():
    params: dict[str, object] = {}
    sql = None
    from synchro.weekday import draw_weekday_clause

    sql = draw_weekday_clause("VENDREDI", params)
    assert sql == "LOWER(COALESCE(weekday, '')) = %(weekday)s"
    assert params["weekday"] == "vendredi"
    clauses, extra = _draw_filter_clauses(weekday="MARDI")
    assert any("weekday" in clause for clause in clauses)
    assert extra["weekday"] == "mardi"
