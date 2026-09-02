"""Laboratoire d’analyse des tirages — fonctions pures sur une liste de tirages."""

from synchro.analysis.bayes import bayes_report
from synchro.analysis.combinatorics import proba_tables
from synchro.analysis.dependence import dependence_report
from synchro.analysis.diagnostics import diagnostics_report
from synchro.analysis.inference import inference_report
from synchro.analysis.lab import lab_report
from synchro.analysis.montecarlo import montecarlo_report
from synchro.analysis.variables import VARIABLE_NAMES, series
from synchro.analysis.windows import heikin_ashi, ohlc_blocks, rolling_stats

__all__ = [
    "VARIABLE_NAMES",
    "bayes_report",
    "dependence_report",
    "diagnostics_report",
    "heikin_ashi",
    "inference_report",
    "lab_report",
    "montecarlo_report",
    "ohlc_blocks",
    "proba_tables",
    "rolling_stats",
    "series",
]
