"""Demande de lecture 20 / 50 / 100, puis la fenêtre précédente de même longueur."""

from __future__ import annotations

from typing import Any, Sequence

from synchro.analysis.common import filter_draws_by_weekday, ordered_draws
from synchro.analysis.diagnostics import acf
from synchro.analysis.variables import series as extract_series
from synchro.lexicon.episode import close_outcome, episode_from_window, reference_sigma
from synchro.lexicon.refcmp import compare_clocks, measured_lines, slow_stamps
from synchro.lexicon.skill import sense_skill
from synchro.lexicon.verdicts import (
    DEFAULT_FIELDS,
    LENGTHS,
    free_oppositions,
    horizon_verdict,
    reread_verdict,
    shape_verdict,
)

LINK = {
    "within_draw": "Cinq numéros sans remise. spread = n5 − n1, les écarts g1–g4 découpent cette étendue.",
    "across_draws": "Retard, présence, lags 1 à 3, activité MM20 et occupation chartiste se lisent avec le passé.",
    "weekday": "En Mardi le prédécesseur est le mardi précédent ; en Vendredi, le vendredi précédent.",
    "era": "La formule actuelle (depuis 2016-09-27) n'est pas le régime d'avant.",
    "ref": "Deux tirages voisins partagent la même horloge Réf, avancée d'un pas.",
}


def _slice(draws: Sequence[dict[str, Any]], length: int) -> tuple[list[dict[str, Any]], list[dict[str, Any]] | None]:
    rows = list(draws)
    if len(rows) < length:
        return rows, None
    study = rows[-length:]
    previous = rows[-2 * length : -length] if len(rows) >= 2 * length else None
    return study, previous


def _values(draws: Sequence[dict[str, Any]], name: str) -> tuple[list[float], list[str]]:
    payload = extract_series(list(draws), name)
    points = payload["points"]
    return [float(point["value"]) for point in points], [str(point["date"]) for point in points]


def _z_residual(values: Sequence[float]) -> float | None:
    count = len(values)
    if count < 2:
        return None
    mean = sum(values) / count
    var = sum((value - mean) ** 2 for value in values) / count
    if var <= 0:
        return 0.0
    return (values[-1] - mean) / (var ** 0.5)


def _harmo_hint(values: Sequence[float]) -> dict[str, Any] | None:
    """Lag d'autocorrélation le plus marqué. Ce n'est pas un spectre Welch."""
    limit = min(40, max(0, len(values) // 3))
    best_lag = None
    best_abs = 0.0
    for lag in range(2, limit + 1):
        coef = acf(list(values), lag)
        if coef is None:
            continue
        if abs(coef) > best_abs:
            best_abs = abs(coef)
            best_lag = lag
    if best_lag is None:
        return None
    return {"period_draws": best_lag, "acf": best_abs, "kind": "acf"}


def _specialist_rows(specialists: Sequence[dict[str, Any]] | None, field: str, sense_name: str | None) -> list[dict[str, Any]]:
    rows = []
    for item in specialists or []:
        if item.get("target") != field:
            continue
        skill_20 = item.get("skill_20")
        skill_50 = item.get("skill_50")
        skill_100 = item.get("skill_100")
        forecast = item.get("last_forecast") if isinstance(item.get("last_forecast"), dict) else {}
        forecast_value = forecast.get("value")
        previous_value = forecast.get("previous")
        opposes = False
        if (
            isinstance(skill_100, (int, float))
            and skill_100 > 0
            and isinstance(forecast_value, (int, float))
            and isinstance(previous_value, (int, float))
            and sense_name in {"monte", "baisse"}
        ):
            delta = float(forecast_value) - float(previous_value)
            opposes = (sense_name == "monte" and delta < 0) or (sense_name == "baisse" and delta > 0)
        rows.append(
            {
                "slug": item.get("slug"),
                "handle": item.get("handle"),
                "skill_20": skill_20,
                "skill_50": skill_50,
                "skill_100": skill_100,
                "opposes": opposes,
            }
        )
    return rows


def build_reading(
    draws: Sequence[dict[str, Any]],
    *,
    weekday: str | None = None,
    fields: Sequence[str] = DEFAULT_FIELDS,
    shuffles: int = 24,
    seed: int = 0,
    specialists: Sequence[dict[str, Any]] | None = None,
    measured: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Une demande. Le jour filtre avant les fenêtres. Le σ est celui de toute la courbe filtrée."""
    ordered = ordered_draws(filter_draws_by_weekday(draws, weekday))
    field_list = [field for field in fields if field in DEFAULT_FIELDS] or list(DEFAULT_FIELDS)
    curves = {name: _values(ordered, name) for name in field_list}
    habit = {name: reference_sigma(values) for name, (values, _dates) in curves.items()}

    columns: dict[str, dict[str, Any]] = {}
    episodes: list[dict[str, Any]] = []
    oppositions: list[dict[str, Any]] = []

    for length in LENGTHS:
        study, previous = _slice(ordered, length)
        named_study: dict[str, dict[str, Any] | None] = {}
        cell: dict[str, Any] = {}
        long_enough = len(ordered) >= length
        for name in field_list:
            if not long_enough:
                cell[name] = {"sense": None, "previous": None, "reread": None}
                named_study[name] = None
                continue
            full_values, _full_dates = curves[name]
            offset = len(ordered) - len(study)
            study_values = full_values[offset:]
            study_dates = [str(draw["draw_date"])[:10] for draw in study]
            named = None
            if len(study_values) >= 16:
                episode = episode_from_window(
                    study_values,
                    study_dates,
                    habit[name],
                    module="analyse",
                    series=name,
                    from_index=offset,
                    facts={"length": length, "weekday": weekday or "tous"},
                )
                named = episode["sense"]
                if named and len(full_values) > episode["to_index"]:
                    episode["outcome"] = close_outcome(
                        full_values,
                        episode["to_index"],
                        named["sense"],
                        sigma=named.get("sigma"),
                    )
                episode["facts"]["skill"] = sense_skill(
                    study_values,
                    habit[name],
                    n=shuffles,
                    seed=seed + length,
                )
                if name == "sum":
                    episode["facts"]["pronostic_z"] = _z_residual(study_values)
                    episode["facts"]["harmo"] = _harmo_hint(study_values)
                if length == 100:
                    episode["facts"]["specialists"] = _specialist_rows(
                        specialists,
                        name,
                        named["sense"] if named else None,
                    )
                episodes.append(episode)
            previous_named = None
            if previous is not None:
                prev_offset = len(ordered) - len(study) - len(previous)
                prev_values = full_values[prev_offset : prev_offset + len(previous)]
                from synchro.chartisme.sense import name_sense

                previous_named = name_sense(prev_values, habit[name]) if len(prev_values) >= 16 else None
            reread = reread_verdict(named, previous_named)
            if reread == "opposé":
                oppositions.append(
                    {
                        "kind": "relecture",
                        "field": name,
                        "length": length,
                        "study": named["sense"] if named else None,
                        "previous": previous_named["sense"] if previous_named else None,
                    }
                )
            named_study[name] = named
            cell[name] = {
                "sense": named,
                "previous": previous_named,
                "reread": reread,
            }
        for pair in free_oppositions(named_study):
            oppositions.append({"kind": "libre", "length": length, **pair})
        shape = shape_verdict(named_study)
        if shape == "opposé":
            oppositions.append({"kind": "forme", "length": length})
        cell["shape"] = shape
        columns[str(length)] = cell

    horizons = {}
    for name in field_list:
        verdict = horizon_verdict(
            (columns.get("20") or {}).get(name, {}).get("sense"),
            (columns.get("50") or {}).get(name, {}).get("sense"),
            (columns.get("100") or {}).get(name, {}).get("sense"),
        )
        horizons[name] = verdict
        if verdict == "opposé":
            oppositions.append({"kind": "horizon", "field": name})

    ref_windows = {}
    for length in LENGTHS:
        study, _previous = _slice(ordered, length)
        if len(study) < 16:
            continue
        offset = len(ordered) - len(study)
        if len(ordered) < length:
            continue
        ref_windows[length] = {
            "draws": study,
            "series": {name: curves[name][0][offset:] for name in ("sum", "parity", "star_sum") if name in curves},
        }
    ref_rows = compare_clocks(ref_windows) if ref_windows else []
    for row in ref_rows:
        if row["verdict"] == "opposé":
            oppositions.append(
                {"kind": "ref", "clock": row["clock"], "field": row["field"]}
            )

    for episode in episodes:
        if episode.get("facts", {}).get("length") != 100:
            continue
        for row in episode["facts"].get("specialists") or []:
            if row.get("opposes"):
                oppositions.append(
                    {"kind": "specialiste", "field": episode["series"], "slug": row.get("slug")}
                )

    for episode in episodes:
        skill = (episode.get("facts") or {}).get("skill") or {}
        if isinstance(skill.get("skill"), (int, float)) and skill["skill"] <= 0:
            episode["facts"]["abstain"] = True

    return {
        "weekday": weekday or "tous",
        "draw_count": len(ordered),
        "from_date": str(ordered[0]["draw_date"])[:10] if ordered else None,
        "to_date": str(ordered[-1]["draw_date"])[:10] if ordered else None,
        "fields": list(field_list),
        "habit_sigma": habit,
        "columns": columns,
        "horizons": horizons,
        "ref": ref_rows,
        "stamps": slow_stamps(ordered[-100:] if len(ordered) >= 100 else ordered),
        "measured": measured_lines(measured),
        "link": LINK,
        "cycles": {
            "role": "jointure",
            "draw_date": str(ordered[-1]["draw_date"])[:10] if ordered else None,
        },
        "episodes": episodes,
        "oppositions": oppositions,
        "opens_llm": any(item.get("kind") for item in oppositions),
    }
