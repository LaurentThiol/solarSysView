"""Laboratoire d’analyse des tirages — fonctions pures sur une liste de tirages."""

from synchro.analysis.bayes import bayes_report
from synchro.analysis.combinatorics import proba_tables
from synchro.analysis.dependence import dependence_report
from synchro.analysis.diagnostics import diagnostics_report
from synchro.analysis.inference import inference_report
from synchro.analysis.lab import lab_report
from synchro.analysis.montecarlo import montecarlo_report
from synchro.analysis.ta import atr, bollinger, ema, indicators, macd, rsi, sma
from synchro.analysis.tech import tech_pack
from synchro.analysis.variables import VARIABLE_NAMES, series
from synchro.analysis.windowing import compare_windows, resolve_window, rolling_profile
from synchro.analysis.windows import heikin_ashi, ohlc_blocks, rolling_stats

__all__ = [
    "VARIABLE_NAMES",
    "atr",
    "bayes_report",
    "bollinger",
    "compare_windows",
    "dependence_report",
    "diagnostics_report",
    "ema",
    "heikin_ashi",
    "indicators",
    "inference_report",
    "lab_report",
    "macd",
    "montecarlo_report",
    "ohlc_blocks",
    "proba_tables",
    "resolve_window",
    "rolling_profile",
    "rolling_stats",
    "rsi",
    "series",
    "sma",
    "tech_pack",
]
