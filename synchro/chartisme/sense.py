"""Nommer le sens d'une fenêtre : monte, baisse, stable.

Le symbole de jambe (`up:moderate:2`) classe un segment. Ici le nom porte sur
la fenêtre entière, et il ne le remplace pas.

La droite passe par les deux bouts — le même choix que les pivots, pour que
le jumeau TypeScript retombe sur les mêmes bits. L'écart-type est celui des
résidus autour de cette droite : une hausse nette et propre ne gonfle pas le
nuage. On le rapporte à l'écart-type de la courbe entière, pas à celui de la
fenêtre, sinon la somme serait toujours `sup` et une présence toujours `05`.

Registres exclusifs : `05` si le rapport ≤ 0,5, `1` s'il ≤ 1, `sup` au-delà.
Le sens est `stable` quand le déplacement net ne dépasse pas ce nuage.

La corde de la fenêtre reste un résumé. Le découpage, lui, cherche le plus
court tronçon d'au moins trois tirages dont le déplacement dépasse le σ
habituel et dont le nuage tient dans ce σ, puis le prolonge. Il le ferme
aussi quand les trois derniers tirages forment une autre droite, dont le
coefficient directeur s'écarte de plus que l'habitude des pentes. Cette
habitude est l'écart-type des pentes à trois tirages sur toute la courbe.
"""

from __future__ import annotations

import math
from typing import Any, Sequence

from synchro.short_cycle import SHORT_CYCLE_MAX, SHORT_CYCLE_MIN

# Même plancher que la plus courte fenêtre lisible du chartisme (`MIN_WINDOW`).
MIN_SENSE_LENGTH = 16

# Un tronçon confirme une tendance à partir de trois tirages.
MIN_SEGMENT_LENGTH = 3

# Rapport σ résiduel / σ habituel.
TIGHT = 0.5
USUAL = 1.0

SENSES = ("monte", "baisse", "stable")
REGISTERS = ("05", "1", "sup")
SLOPE_SHIFTS = ("tourne", "accélère", "fatigue", "tient")
SLOPE_HABITS = ("vive", "ordinaire")

_SENSE_GLOSS = {
    "monte": "la fenêtre monte",
    "baisse": "la fenêtre baisse",
    "stable": "la fenêtre reste stable",
}
_SLOPE_SHIFT_GLOSS = {
    "tourne": "la pente tourne",
    "accélère": "la pente accélère",
    "fatigue": "la pente fatigue",
    "tient": "la pente tient",
}
_SLOPE_HABIT_GLOSS = {
    "vive": "vive pour cette courbe",
    "ordinaire": "ordinaire pour cette courbe",
}
_REGISTER_GLOSS = {
    "05": "le nuage autour de la droite tient dans la moitié de l'écart-type habituel",
    "1": "le nuage autour de la droite est de l'ordre de l'écart-type habituel",
    "sup": "le nuage autour de la droite dépasse l'écart-type habituel",
}
_REGISTER_GLOSS_RANGE = {
    "05": "le nuage autour de la droite tient dans la moitié de l'étendue habituelle",
    "1": "le nuage autour de la droite est de l'ordre de l'étendue habituelle",
    "sup": "le nuage autour de la droite dépasse l'étendue habituelle",
}


def _extent(values: Sequence[float]) -> float:
    if not values:
        return 0.0
    return max(values) - min(values)


def series_sigma(values: Sequence[float]) -> float:
    """Écart-type de la série, divisé par n. Description du nuage, pas une estimation."""
    ys = [float(v) for v in values]
    count = len(ys)
    if count == 0:
        return 0.0
    mean = sum(ys) / count
    var = sum((value - mean) ** 2 for value in ys) / count
    return math.sqrt(var)


def _scale(value: float | None) -> float | None:
    """Écart-type fini et positif ou nul, sinon on s'abstient."""
    if value is None:
        return None
    try:
        scale = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(scale) or scale < 0:
        return None
    return scale


def _chord(values: Sequence[float]) -> tuple[float, float, float]:
    """Déplacement, coefficient directeur et σ des résidus de la droite des bouts."""
    count = len(values)
    if count == 0:
        return 0.0, 0.0, 0.0
    if count == 1:
        return 0.0, 0.0, 0.0
    delta = float(values[-1]) - float(values[0])
    slope = delta / (count - 1)
    residuals = [float(values[index]) - (float(values[0]) + slope * index) for index in range(count)]
    return delta, slope, series_sigma(residuals)


def _cloud_holds(sigma: float, reference: float) -> bool:
    """Le nuage tient dans le σ habituel. Une habitude nulle n'accepte qu'une droite parfaite."""
    if reference == 0:
        return sigma == 0
    return sigma <= reference


def series_slope_sigma(values: Sequence[float]) -> float:
    """Écart-type des coefficients directeurs à trois tirages.

    Pour chaque indice `i`, `m = (y[i + 2] - y[i]) / 2`. Moins de trois tirages :
    aucune pente, l'écart-type est nul.
    """
    ys = [float(v) for v in values]
    if len(ys) < MIN_SEGMENT_LENGTH:
        return 0.0
    slopes = [(ys[index + 2] - ys[index]) / 2 for index in range(len(ys) - 2)]
    return series_sigma(slopes)


def format_slope(value: float) -> str:
    """Coefficient directeur signé, quatre décimales au plus."""
    if not math.isfinite(value):
        return "∞"
    rounded = round(float(value), 4)
    if rounded == 0:
        return "0"
    magnitude = abs(rounded)
    if magnitude == int(magnitude):
        text = str(int(magnitude))
    else:
        text = f"{magnitude:.4f}".rstrip("0").rstrip(".")
    if rounded < 0:
        return f"-{text}"
    return f"+{text}"


def register_of(ratio: float) -> str:
    """`05` ≤ 0,5, `1` ≤ 1, `sup` au-delà. Les bornes sont inclusives."""
    if ratio <= TIGHT:
        return "05"
    if ratio <= USUAL:
        return "1"
    return "sup"


def name_sense(values: Sequence[float], reference_sigma: float | None) -> dict[str, Any] | None:
    """Symbole `monte:05` / `baisse:1` / `stable:sup`, ou `None` si on s'abstient.

    On s'abstient sous `MIN_SENSE_LENGTH` points, ou si la référence n'est pas
    un écart-type (absente, négative, non finie). Une référence nulle nomme
    quand même : un nuage vide reste `05`, un nuage non nul est `sup`.
    """
    ys = [float(v) for v in values]
    count = len(ys)
    if count < MIN_SENSE_LENGTH:
        return None
    if reference_sigma is None:
        return None
    try:
        reference = float(reference_sigma)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(reference) or reference < 0:
        return None

    delta = ys[-1] - ys[0]
    slope = delta / (count - 1)
    residuals = [ys[index] - (ys[0] + slope * index) for index in range(count)]
    sigma = series_sigma(residuals)
    if reference == 0:
        ratio = 0.0 if sigma == 0 else math.inf
    else:
        ratio = sigma / reference
    sense = "stable" if abs(delta) <= sigma else ("monte" if delta > 0 else "baisse")
    register = register_of(ratio)
    return {
        "symbol": f"{sense}:{register}",
        "sense": sense,
        "register": register,
        "sigma": sigma,
        "reference": reference,
        "ratio": ratio if math.isfinite(ratio) else None,
        "delta": delta,
    }


def _is_trend(chunk: Sequence[float], reference: float) -> bool:
    """Au moins trois tirages, déplacement au-delà du σ habituel, nuage dans ce σ."""
    if len(chunk) < MIN_SEGMENT_LENGTH:
        return False
    delta, _slope, sigma = _chord(chunk)
    if reference == 0:
        return delta != 0 and sigma == 0
    return abs(delta) > reference and _cloud_holds(sigma, reference)


def _trend_end(values: Sequence[float], start: int, reference: float) -> int | None:
    """Plus petite fin qui confirme une tendance depuis `start`, ou rien."""
    count = len(values)
    for end in range(start + MIN_SEGMENT_LENGTH - 1, count):
        if _is_trend(values[start : end + 1], reference):
            return end
    return None


def _tail_breaks(chunk: Sequence[float], reference: float, slope_sigma: float) -> bool:
    """Les trois derniers tirages forment une autre droite, plus écartée que l'habitude.

    Un seul tirage aberrant ne coupe pas : sa queue n'est pas une droite au sens
    du σ habituel. À trois tirages la queue est le tronçon, l'écart est nul.
    """
    if len(chunk) < MIN_SEGMENT_LENGTH + 1:
        return False
    _delta, slope, _sigma = _chord(chunk)
    _tail_delta, tail_slope, tail_sigma = _chord(chunk[-MIN_SEGMENT_LENGTH:])
    if not _cloud_holds(tail_sigma, reference):
        return False
    return abs(tail_slope - slope) > slope_sigma


def _slope_habit(slope: float, slope_sigma: float | None) -> str | None:
    """`vive` si la pente dépasse l'habitude, `ordinaire` sinon. Absent sans habitude."""
    if slope_sigma is None:
        return None
    if slope_sigma == 0:
        return "vive" if slope != 0 else "ordinaire"
    return "vive" if abs(slope) > slope_sigma else "ordinaire"


def _slope_shift(slope: float, previous: float | None, slope_sigma: float | None) -> str | None:
    """Compare le coefficient à celui du tronçon précédent.

    `tourne` si les signes s'opposent. Sinon `accélère` ou `fatigue` quand la
    valeur absolue s'écarte de plus que l'habitude des pentes, `tient` autrement.
    """
    if previous is None or slope_sigma is None:
        return None
    opposite = (previous > 0 and slope < 0) or (previous < 0 and slope > 0)
    if opposite:
        return "tourne"
    gap = abs(slope) - abs(previous)
    if gap > slope_sigma:
        return "accélère"
    if -gap > slope_sigma:
        return "fatigue"
    return "tient"


def _segment(
    values: Sequence[float],
    start: int,
    end: int,
    *,
    reference: float,
    slope_sigma: float | None,
    previous_slope: float | None,
    stable: bool,
) -> dict[str, Any]:
    chunk = values[start : end + 1]
    delta, slope, sigma = _chord(chunk)
    if reference == 0:
        ratio = 0.0 if sigma == 0 else math.inf
    else:
        ratio = sigma / reference
    if stable or delta == 0:
        sense = "stable"
    elif delta > 0:
        sense = "monte"
    else:
        sense = "baisse"
    register = register_of(ratio)
    return {
        "from_index": start,
        "to_index": end,
        "symbol": f"{sense}:{register}",
        "sense": sense,
        "register": register,
        "sigma": sigma,
        "reference": reference,
        "ratio": ratio if math.isfinite(ratio) else None,
        "delta": delta,
        "slope": slope,
        "slope_habit": _slope_habit(slope, slope_sigma),
        "slope_shift": _slope_shift(slope, previous_slope, slope_sigma),
    }


def sense_segments(
    values: Sequence[float],
    reference_sigma: float | None,
    slope_sigma: float | None = None,
) -> list[dict[str, Any]] | None:
    """Chaîne de tronçons. Le dernier point de l'un est le premier du suivant.

    On s'abstient si le σ habituel des prix manque ou n'est pas un écart-type.
    Sans σ des pentes, le nuage découpe quand même, et la comparaison des
    coefficients s'abstient. Un σ de pentes nul coupe au moindre écart et
    nomme `vive` toute pente non nulle.
    """
    reference = _scale(reference_sigma)
    if reference is None:
        return None
    slope_scale = _scale(slope_sigma)
    ys = [float(v) for v in values]
    count = len(ys)
    if count == 0:
        return []

    segments: list[dict[str, Any]] = []
    start = 0
    while start < count:
        trend_end = _trend_end(ys, start, reference)
        if trend_end is None:
            stable_end = count - 1
            for cursor in range(start + 1, count - MIN_SEGMENT_LENGTH + 1):
                if _trend_end(ys, cursor, reference) is not None:
                    stable_end = cursor
                    break
            segments.append(
                _segment(
                    ys,
                    start,
                    stable_end,
                    reference=reference,
                    slope_sigma=slope_scale,
                    previous_slope=segments[-1]["slope"] if segments else None,
                    stable=True,
                )
            )
            if stable_end >= count - 1:
                break
            start = stable_end
            continue

        end = trend_end
        while end + 1 < count:
            grown = ys[start : end + 2]
            _delta, _slope, sigma = _chord(grown)
            if not _cloud_holds(sigma, reference):
                break
            if slope_scale is not None and _tail_breaks(grown, reference, slope_scale):
                break
            end += 1
        segments.append(
            _segment(
                ys,
                start,
                end,
                reference=reference,
                slope_sigma=slope_scale,
                previous_slope=segments[-1]["slope"] if segments else None,
                stable=False,
            )
        )
        if end >= count - 1:
            break
        start = end
    return segments


def segment_clause(segment: dict[str, Any]) -> str:
    """Un tronçon : symbole, pente, rapport au précédent, rapport à l'habitude."""
    text = f"{segment['symbol']}, pente {format_slope(float(segment['slope']))}"
    shift = segment.get("slope_shift")
    habit = segment.get("slope_habit")
    if shift in _SLOPE_SHIFT_GLOSS:
        text += f", {_SLOPE_SHIFT_GLOSS[str(shift)]}"
    if habit in _SLOPE_HABIT_GLOSS:
        text += f", {_SLOPE_HABIT_GLOSS[str(habit)]}"
    return text


def segments_sentence(segments: Sequence[dict[str, Any]] | None) -> str:
    """La chaîne lue sous le tracé. L'ordre est celui des tirages."""
    if segments is None:
        return "L'écart-type habituel manque pour découper le sens."
    rows = list(segments)
    if not rows:
        return "Pas de tirage à découper."
    clauses = [segment_clause(row) for row in rows]
    if len(clauses) == 1:
        return f"{clauses[0]}."
    return f"{clauses[0]}" + "".join(f" ; puis {clause}" for clause in clauses[1:]) + "."


def _readable(named: dict[str, Any] | None) -> dict[str, str] | None:
    """Symbole, sens et registre, ou rien si le dict ne nomme pas une fenêtre."""
    if not named:
        return None
    sense = str(named.get("sense") or "")
    register = str(named.get("register") or "")
    symbol = str(named.get("symbol") or "")
    if sense not in _SENSE_GLOSS or register not in _REGISTER_GLOSS or not symbol:
        return None
    return {"sense": sense, "register": register, "symbol": symbol}


def name_short_sense(values: Sequence[float], reference_range: float | None) -> dict[str, Any] | None:
    """Sens d'une arche de 4 à 8 tirages.

    Le nuage est l'étendue des résidus, rapportée à l'étendue de référence
    (médiane des arches courtes passées). Les registres restent 0,5 et 1.
    Le σ de toute la courbe n'entre pas dans le rapport.
    """
    ys = [float(value) for value in values]
    count = len(ys)
    if count < SHORT_CYCLE_MIN or count > SHORT_CYCLE_MAX:
        return None
    if reference_range is None:
        return None
    try:
        reference = float(reference_range)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(reference) or reference < 0:
        return None

    delta = ys[-1] - ys[0]
    slope = delta / (count - 1)
    residuals = [ys[index] - (ys[0] + slope * index) for index in range(count)]
    cloud = _extent(residuals)
    if reference == 0:
        ratio = 0.0 if cloud == 0 else math.inf
    else:
        ratio = cloud / reference
    sense = "stable" if abs(delta) <= cloud else ("monte" if delta > 0 else "baisse")
    register = register_of(ratio)
    return {
        "symbol": f"{sense}:{register}",
        "sense": sense,
        "register": register,
        "sigma": cloud,
        "extent": cloud,
        "reference": reference,
        "ratio": ratio if math.isfinite(ratio) else None,
        "delta": delta,
        "band": "court",
    }


def sense_sentence(named: dict[str, Any] | None) -> str:
    """Phrase lue à côté du tracé. Le symbole reste en tête."""
    read = _readable(named)
    if not read:
        return "Fenêtre trop courte pour nommer le sens."
    gloss = _REGISTER_GLOSS_RANGE if named and named.get("band") == "court" else _REGISTER_GLOSS
    return (
        f"{read['symbol']} — {_SENSE_GLOSS[read['sense']]}, "
        f"et {gloss[read['register']]}."
    )


def sense_shift_sentence(
    current: dict[str, Any] | None,
    previous: dict[str, Any] | None,
    has_previous: bool,
) -> str:
    """Ce que devient le sens entre la fenêtre précédente et celle qu'on étudie.

    L'ordre est chronologique : la précédente d'abord. Le registre qui change
    sans le sens reste un maintien. Sans fenêtre antérieure de même longueur,
    la comparaison s'abstient.
    """
    if not has_previous:
        return "Pas de fenêtre antérieure de même longueur."
    now = _readable(current)
    before = _readable(previous)
    if now is None and before is None:
        return "Les deux fenêtres sont trop courtes pour comparer le sens."
    if now is None or before is None:
        return "L'une des deux fenêtres est trop courte pour comparer le sens."
    if now["sense"] == before["sense"] and now["register"] == before["register"]:
        return f"Le sens tient : les deux fenêtres sont {now['symbol']}."
    if now["sense"] == before["sense"]:
        return (
            f"Le sens tient ({now['sense']}), le registre passe de "
            f"{before['register']} à {now['register']}."
        )
    return f"Le sens change : {before['symbol']}, puis {now['symbol']}."
