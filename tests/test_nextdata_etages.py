"""Deux étages : sommes, puis rangs projetés. TimesFM reste éteint."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from synchro.nextdata.covariates import CHAIN
from synchro.nextdata.models import (
    STAGE1_SERIES,
    context_before,
    future_rank_covariate,
    pas_du_decalage,
    reject_stage1,
    timesfm_point,
)
from synchro.nextdata.project import project_under_sums


def test_stage1_rejects_a_rank() -> None:
    with pytest.raises(ValueError, match="étage 1"):
        reject_stage1({"sum": 1, "n1": 2})
    with pytest.raises(ValueError, match="étage 1"):
        reject_stage1({"star_sum": 1, "n2": 3})
    with pytest.raises(ValueError, match="étage 1"):
        reject_stage1({"sum": 1, "e1": 4})
    reject_stage1({"sum": {"mid": 120}, "star_sum": {"mid": 10}})
    assert STAGE1_SERIES == ("sum", "star_sum")
    assert CHAIN[0][0] == "n1" and CHAIN[0][1] == ("sum",)
    assert all(lowers for _name, lowers in CHAIN)


def test_projection_repairs_a_broken_order_and_a_bound() -> None:
    numbers, stars = project_under_sums([60, -3, 40, 10, 80], [15, 0], 100, 10, 12)
    assert numbers == sorted(numbers)
    assert all(left < right for left, right in zip(numbers, numbers[1:]))
    assert all(1 <= value <= 50 for value in numbers)
    assert sum(numbers) == 100
    assert stars == sorted(stars)
    assert stars[0] < stars[1]
    assert all(1 <= value <= 12 for value in stars)
    assert sum(stars) == 10


def test_a_draw_after_the_cutoff_stays_out_of_the_context() -> None:
    rows = [
        {"sum": 100, "star_sum": 8, "n1": 4},
        {"sum": 110, "star_sum": 9, "n1": 5},
        {"sum": 999, "star_sum": 99, "n1": 49},
        {"sum": 888, "star_sum": 88, "n1": 48},
    ]
    context = context_before(rows, 2)
    assert [row["sum"] for row in context] == [100, 110]
    assert all(row["sum"] < 200 for row in context)
    hidden = rows[2]
    assert future_rank_covariate("sum", 120.0, [hidden]) == 120.0
    assert future_rank_covariate("sum", 120.0, [hidden]) != hidden["sum"]
    assert future_rank_covariate("star_sum", 11.0, [hidden, rows[3]]) == 11.0


def test_rank_weight_is_refused() -> None:
    from synchro.nextdata.backtest import assert_no_rank_weight, sum_weights

    with pytest.raises(ValueError, match="rang"):
        assert_no_rank_weight({"sum": 1.0, "n1": 0.2})
    short = sum_weights({"lightgbm": 3.0, "chronos": 1.0, "timesfm": 0.1}, 4)
    assert short["timesfm"] == 0.0
    assert short["lightgbm"] == 0.5
    assert short["chronos"] == 0.5
    ready = sum_weights({"lightgbm": 4.0, "chronos": 4.0, "timesfm": 2.0}, 10)
    assert ready == {"lightgbm": 0.0, "chronos": 0.0, "timesfm": 1.0}
    tied = sum_weights({"lightgbm": 2.0, "chronos": 2.0}, 10)
    assert tied["lightgbm"] == 1.0
    assert tied["chronos"] == 0.0


def test_timesfm_calls_sums_then_ranks_and_stays_off(monkeypatch) -> None:
    import numpy as np

    from synchro.nextdata.forecast import run_forecast
    from synchro.nextdata.models import TIMESFM_HORIZON, StepSettings, _timesfm_part, timesfm_error
    from synchro.nextdata.panel import build_frame
    from synchro.nextdata.steps import parts_needed

    seen: list[str] = []

    class Output:
        def __init__(self, context: np.ndarray) -> None:
            width = 1 if context.ndim == 1 else context.shape[0]
            self.forecast = np.zeros((width, TIMESFM_HORIZON))
            self.quantiles = np.zeros((width, TIMESFM_HORIZON, 9))
            self.quantiles[:, :, 4] = 40
            self.quantiles[:, :, 0] = 18
            self.quantiles[:, :, 8] = 60

    def fake(context, horizon=10, past_future=None):
        seen.append("rangs" if past_future is not None else "sommes")
        assert horizon == 10
        return Output(np.asarray(context))

    monkeypatch.setattr("synchro.nextdata.models.timesfm_predict", fake)
    monkeypatch.setattr("synchro.nextdata.models._TIMESFM_ERROR", None)
    from tests.test_nextdata import _draws

    frame = build_frame(_draws(40, seed=3), focus=24)
    settings = StepSettings(focus=24, families=("forme",), estimators=2)
    part = _timesfm_part(frame.rows, frame.horizon, settings)
    assert seen == ["sommes", "rangs", "sommes", "rangs"]
    assert part["schema"] == "two-stage"
    assert set(part["corpus"]) >= {"sum", "star_sum", "stage2", "horizon"}
    assert "n1" not in {key for key in part["corpus"] if key in ("n1", "n2", "e1")}
    assert len(part["corpus"]["horizon"]) == 10
    calls = len(seen)
    assert timesfm_point(part["corpus"]["horizon"], 1)["sum"]["mid"] == part["corpus"]["sum"]["mid"]
    assert timesfm_point(part["corpus"]["horizon"], 10)["sum"]["lo"] == 18
    assert pas_du_decalage(1) == 10
    assert pas_du_decalage(10) == 1
    assert len(seen) == calls
    assert timesfm_error() is None
    monkeypatch.setattr("synchro.nextdata.steps._installed", lambda name: name == "timesfm")
    monkeypatch.setattr("synchro.nextdata.steps.timesfm_error", lambda: None)
    monkeypatch.setattr("synchro.nextdata.steps.catboost_import_error", lambda: "absent")
    monkeypatch.setattr("synchro.nextdata.steps.darts_error", lambda: "absent")
    assert "timesfm" not in parts_needed(False)
    assert "timesfm" not in parts_needed(True, False)
    assert parts_needed(False, True) == ("lightgbm", "timesfm")
    assert run_forecast.__defaults__ is None or True
    import inspect

    assert inspect.signature(run_forecast).parameters["with_timesfm"].default is False


def test_an_old_step_is_not_reread_as_two_stages() -> None:
    from synchro.nextdata.steps import is_two_stage_part, stale_part, step_key
    from synchro.nextdata.models import StepSettings

    old = {"corpus": {"moments": {"sum": {"mid": 1}, "n1": {"mid": 2}}}}
    assert stale_part(old) is True
    assert is_two_stage_part(old) is False
    fresh = {"schema": "two-stage", "corpus": {"stage1": {"sum": {}, "star_sum": {}}}}
    assert is_two_stage_part(fresh) is True
    assert stale_part({"error": "OSError: poids"}) is False
    settings = StepSettings(focus=20, families=("forme",), estimators=2)
    left = step_key("abc", [{"date": "2024-01-01"}], settings, "lightgbm")
    right = step_key("abc", [{"date": "2024-01-01"}], settings, "lightgbm")
    assert left == right
    assert len(left) == 64


def test_nodered_flow_follows_the_two_stages_and_ignores_a_stopped_server() -> None:
    from synchro.nextdata.forecast import nodered_summary, publish_nodered

    flow = json.loads(Path("flows/nextdata.json").read_text(encoding="utf-8"))
    names = [node.get("name") for node in flow if node.get("type") == "function"]
    assert names == ["Étage 1", "Mélange", "Étage 2", "Projection", "Décalages −1 à −10"]
    text = Path("flows/nextdata.json").read_text(encoding="utf-8")
    assert "from_pretrained" not in text
    assert "import " not in text
    assert "lightgbm" not in text.lower()
    summary = nodered_summary(
        {
            "covariates": ["forme"],
            "next_date": "2026-11-13",
            "modes": {"corpus": {"quantiles": {"sum": {"mid": 120}}, "grid": {"numbers": [1, 2, 3, 4, 5], "stars": [1, 2]}}},
            "shifts": [{"x": k, "date": "2026-01-01"} for k in range(1, 11)],
        }
    )
    assert "tensor" not in json.dumps(summary)
    assert [item["k"] for item in summary["decalages"]] == list(range(1, 11))
    assert publish_nodered(summary) is False
