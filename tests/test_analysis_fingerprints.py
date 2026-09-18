from datetime import date

from synchro.analysis.fingerprints import (
    FINGERPRINT_AXES,
    analogs_report,
    cosine,
    is_fingerprint_axis,
    parse_axes,
    z_score,
)


SAMPLE = [
    {"draw_date": date(2026, 1, 1), "numbers": [1, 2, 3, 4, 5], "stars": [1, 2]},
    {"draw_date": date(2026, 1, 2), "numbers": [1, 2, 3, 4, 6], "stars": [1, 2]},
    {"draw_date": date(2026, 1, 3), "numbers": [1, 2, 3, 4, 5], "stars": [8, 9]},
]


def test_axes_exclude_delay_and_hit():
    assert "delay" not in FINGERPRINT_AXES
    assert "hit" not in FINGERPRINT_AXES
    assert is_fingerprint_axis("sum")
    assert not is_fingerprint_axis("delay")
    assert parse_axes(["sum", "parity", "sum", "delay"]) == ["sum", "parity"]


def test_cosine_and_zscore():
    assert abs(cosine([1.0, 0.0], [1.0, 0.0]) - 1.0) < 1e-9
    assert cosine([1.0, 0.0], [0.0, 1.0]) == 0.0
    assert z_score(12, 12, 0) == 0.0


def test_mask_changes_neighbors():
    numbers = analogs_report(SAMPLE, query_date="2026-01-01", axes=["sum", "parity", "spread"], k=2)
    stars = analogs_report(SAMPLE, query_date="2026-01-01", axes=["star_sum", "e1", "e2"], k=2)
    assert numbers["query"]["params"]["sum"] == 15
    assert numbers["items"][0]["date"] == "2026-01-03"
    assert numbers["items"][0]["score"] == 1.0
    assert numbers["items"][0]["delta"]["sum"] == 0
    assert stars["items"][0]["date"] == "2026-01-02"
    assert stars["items"][0]["score"] == 1.0
    assert numbers["items"][0]["date"] != stars["items"][0]["date"]


def test_self_is_excluded_and_default_query_is_last():
    report = analogs_report(SAMPLE)
    assert report["query"]["date"] == "2026-01-03"
    assert all(item["date"] != report["query"]["date"] for item in report["items"])
    assert report["draw_count"] == 3
