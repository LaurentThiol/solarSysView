from datetime import date

from synchro.analysis.bayes import bayes_report


def test_bayes_predictive_near_p0():
    draws = []
    for i in range(50):
        nums = [((i + k) % 50) + 1 for k in range(5)]
        draws.append(
            {
                "draw_date": date(2024, 1, 1 + (i % 28)),
                "weekday": "mardi" if i % 2 == 0 else "vendredi",
                "numbers": nums,
                "stars": [1, 2],
                "star_pool": 12,
            }
        )
    report = bayes_report(draws)
    assert report["draw_count"] == 50
    means = [row["uniform"]["predictive"] for row in report["balls"]]
    avg = sum(means) / len(means)
    assert abs(avg - 0.1) < 0.02
