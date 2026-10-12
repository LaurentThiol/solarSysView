from datetime import date

from synchro.morpho.anticipation import anticipate


DRAWS = [
    {
        "draw_date": date(2026, 8, 4),
        "weekday": "mardi",
        "numbers": [1, 2, 3, 4, 5],
        "stars": [1, 2],
    },
    {
        "draw_date": date(2026, 8, 7),
        "weekday": "vendredi",
        "numbers": [1, 2, 3, 14, 15],
        "stars": [1, 2],
    },
    {
        "draw_date": date(2026, 8, 11),
        "weekday": "mardi",
        "numbers": [1, 2, 3, 4, 5],
        "stars": [1, 2],
    },
    {
        "draw_date": date(2026, 8, 14),
        "weekday": "vendredi",
        "numbers": [6, 7, 8, 9, 10],
        "stars": [3, 4],
    },
]


def test_anticipate_returns_classes_vs_null() -> None:
    report = anticipate(DRAWS, n_sim=80, seed=1, min_jaccard=0.4)
    assert report["ok"] is True
    assert report["current"]["date"] == "2026-08-14"
    assert report["n_sim"] == 80
    ids = {row["id"] for row in report["classes"]}
    assert "align_h" in ids
    assert report["fdr_rejections"] >= 0
    assert all("p_value" in row for row in report["classes"])
    for row in report["classes"]:
        assert 0 <= row["null"] <= 1
        if row["n"]:
            assert row["empirical"] is not None
