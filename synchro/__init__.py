"""Synchro — historique et analyse des tirages EuroMillions."""

from __future__ import annotations

import os

# Avant NumPy, scikit-learn, LightGBM et torch. Sur Mac, chacun peut charger
# son propre libomp. Un fork OpenMP mélange alors les runtimes et SIGSEGV
# dans __kmp_suspend_initialize_thread (vu sur nextDataTraining).
os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")
os.environ.setdefault("NUMEXPR_NUM_THREADS", "1")
os.environ.setdefault("VECLIB_MAXIMUM_THREADS", "1")
os.environ.setdefault("KMP_DUPLICATE_LIB_OK", "TRUE")

__version__ = "0.1.0"
