from __future__ import annotations

from typing import Any

from synchro.analysis.bayes import bayes_report
from synchro.analysis.balls import ball_board, parity_report
from synchro.analysis.combinatorics import proba_tables
from synchro.analysis.common import as_date, ordered_draws
from synchro.analysis.dependence import dependence_report
from synchro.analysis.diagnostics import diagnostics_report
from synchro.analysis.inference import inference_report
from synchro.analysis.montecarlo import montecarlo_report
from synchro.analysis.ta import indicators
from synchro.analysis.tech import tech_pack
from synchro.analysis.variables import series
from synchro.analysis.windowing import compare_windows, resolve_window, rolling_profile
from synchro.analysis.windows import heikin_ashi, ohlc_blocks, rolling_stats


def _window_public(resolved: dict[str, Any]) -> dict[str, Any]:
    compare = resolved.get("compare") or {}
    return {
        "preset": resolved.get("preset"),
        "from_date": resolved.get("from_date"),
        "to_date": resolved.get("to_date"),
        "draw_count": resolved.get("draw_count"),
        "warmup_count": resolved.get("warmup_count"),
        "warmup_from": resolved.get("warmup_from"),
        "star_pools": resolved.get("star_pools"),
        "star_pool_break": resolved.get("star_pool_break"),
        "compare": {
            "from_date": compare.get("from_date"),
            "to_date": compare.get("to_date"),
            "draw_count": compare.get("draw_count"),
        },
    }


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
    preset: str = "all",
    last_n: int | None = None,
    warmup: int = 52,
    from_date: str | None = None,
    to_date: str | None = None,
) -> dict[str, Any]:
    """Tableau de bord : agrégats sur le jeu de travail, indicateurs avec warmup."""
    archive = ordered_draws(draws)
    resolved = resolve_window(
        archive,
        preset=preset,
        from_date=from_date,
        to_date=to_date,
        last_n=last_n,
        warmup=warmup,
    )
    work = resolved["work"]
    with_warmup = resolved["with_warmup"]
    warmup_count = resolved["warmup_count"]
    ball = n if variable in {"delay", "hit"} else None
    var_n = n if variable in {"delay", "hit"} else None
    ohlc = ohlc_blocks(work, name=variable, block=block, window=window, n=var_n)
    variable_series = series(work, variable, n=var_n)
    full_series = series(with_warmup, variable, n=var_n)
    inference = inference_report(work)
    bayes = bayes_report(work)
    dates = [p["date"] for p in full_series["points"]]
    return {
        "draw_count": len(work),
        "from_date": as_date(work[0]["draw_date"]).isoformat() if work else None,
        "to_date": as_date(work[-1]["draw_date"]).isoformat() if work else None,
        "disclaimer": (
            "Chaque tirage est indépendant. Les agrégats portent sur la fenêtre de travail ; "
            "EMA / RSI / Ichimoku utilisent un warmup qui n’entre pas dans χ² ni Bayes."
        ),
        "window": _window_public(resolved),
        "compare": compare_windows(work, resolved["compare"]["work"], variable, n=var_n),
        "profile": rolling_profile(archive, variable=variable, period=window, n=var_n),
        "variable": variable_series,
        "rolling": rolling_stats(work, variable, window=window, n=var_n),
        "ta": indicators(
            [float(v) for v in variable_series["values"]],
            ohlc["candles"],
            sma_period=window,
            ema_period=window,
            bb_period=window,
        ),
        "tech": tech_pack(
            [float(v) for v in full_series["values"]],
            [],
            dates,
            sma_period=window,
            warmup_count=warmup_count,
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
        "dependence": dependence_report(work),
        "diagnostics": diagnostics_report(work, window=window),
        "balls": ball_board(work),
        "parity": parity_report(work),
        "montecarlo": montecarlo_report(work, n_sim=n_sim, seed=seed) if include_mc else None,
        "delay_ball": series(work, "delay", n=ball or 7),
    }
