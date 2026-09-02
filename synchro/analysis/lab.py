from __future__ import annotations

from typing import Any

from synchro.analysis.bayes import bayes_report
from synchro.analysis.combinatorics import proba_tables
from synchro.analysis.common import as_date, ordered_draws
from synchro.analysis.dependence import dependence_report
from synchro.analysis.diagnostics import diagnostics_report
from synchro.analysis.inference import inference_report
from synchro.analysis.montecarlo import montecarlo_report
from synchro.analysis.ta import indicators
from synchro.analysis.variables import series
from synchro.analysis.windows import heikin_ashi, ohlc_blocks, rolling_stats


def lab_report(
    draws: list[dict[str, Any]],
    *,
    variable: str = "sum",
    window: int = 20,
    block: str = "month",
    n: int | None = 7,
    n_sim: int = 400,
    seed: int = 0,
    include_mc: bool = True,
) -> dict[str, Any]:
    """Tableau de bord compact : les outils lisent les mêmes tirages."""
    ordered = ordered_draws(draws)
    ball = n if variable in {"delay", "hit"} else None
    var_n = n if variable in {"delay", "hit"} else None
    ohlc = ohlc_blocks(ordered, name=variable, block=block, window=window, n=var_n)
    variable_series = series(ordered, variable, n=var_n)
    inference = inference_report(ordered)
    bayes = bayes_report(ordered)
    return {
        "draw_count": len(ordered),
        "from_date": as_date(ordered[0]["draw_date"]).isoformat() if ordered else None,
        "to_date": as_date(ordered[-1]["draw_date"]).isoformat() if ordered else None,
        "disclaimer": "Chaque tirage est indépendant. Ces outils décrivent l’archive, ils ne prédisent pas le prochain.",
        "variable": variable_series,
        "rolling": rolling_stats(ordered, variable, window=window, n=var_n),
        "ta": indicators(
            [float(v) for v in variable_series["values"]],
            ohlc["candles"],
            sma_period=window,
            ema_period=window,
            bb_period=window,
        ),
        "ohlc": ohlc,
        "heikin_ashi": heikin_ashi(ohlc["candles"]),
        "proba": proba_tables(),
        "inference": {
            "chi_square": inference["chi_square"],
            "ks_sum": inference["ks_sum"],
            "weekday_sum": inference["weekday_sum"],
            "fdr_rejections": inference["fdr_rejections"],
            "balls": inference["balls"],
        },
        "bayes": {
            "p0": bayes["p0"],
            "balls": bayes["balls"],
            "disclaimer": bayes["disclaimer"],
        },
        "dependence": dependence_report(ordered),
        "diagnostics": diagnostics_report(ordered, window=window),
        "montecarlo": montecarlo_report(ordered, n_sim=n_sim, seed=seed) if include_mc else None,
        "delay_ball": series(ordered, "delay", n=ball or 7),
    }
