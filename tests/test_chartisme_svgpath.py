"""Représentation partagée : carré unité, PIP, Bézier, tokens DeepSVG."""

import math

from synchro.chartisme.pivots import swing_pivots, swing_threshold
from synchro.chartisme.svgpath import (
    ARG_BINS,
    ARG_NONE,
    CMD_CLOSE,
    CMD_CUBIC,
    CMD_EOS,
    CMD_LINE,
    CMD_MOVE,
    CMD_PAD,
    CMD_SOS,
    MAX_CMDS,
    MAX_PATHS,
    N_ARGS,
    PATH_ROLES,
    build_group,
    build_path,
    dequantize,
    fit_cubic,
    group_to_svg,
    normalize_window,
    parse_svg_d,
    pips,
    quantize,
    resample_values,
    sample_commands,
    to_svg_d,
    tokenize_group,
)

WAVE = [100.0 + 20.0 * math.sin(i / 6.0) + i * 0.3 for i in range(72)]


def test_normalize_is_resolution_free() -> None:
    """Même forme à deux échelles : mêmes coordonnées normalisées.

    C'est la propriété qui justifie tout le module : la topologie ne doit pas
    dépendre de la grille de pixels ni de l'unité de la variable.
    """
    small = normalize_window(WAVE)
    big = normalize_window([v * 37.0 - 1234.0 for v in WAVE])
    for (xa, ya), (xb, yb) in zip(small, big):
        assert xa == xb
        assert abs(ya - yb) < 1e-9
    assert small[0][0] == 0.0
    assert small[-1][0] == 1.0
    assert min(y for _, y in small) == 0.0
    assert max(y for _, y in small) == 1.0


def test_normalize_flat_window() -> None:
    """Une fenêtre plate n'a pas d'amplitude : on la centre plutôt que diviser par zéro."""
    points = normalize_window([7.0] * 12)
    assert all(y == 0.5 for _, y in points)


def test_pips_keep_the_extremes_first() -> None:
    """Les points perceptuellement importants commencent par les bouts."""
    points = normalize_window(WAVE)
    assert pips(points, 2) == [0, len(points) - 1]
    chosen = pips(points, 12)
    assert chosen[0] == 0
    assert chosen[-1] == len(points) - 1
    assert chosen == sorted(chosen)
    assert len(set(chosen)) == len(chosen)
    # Monotone en k : ajouter un point ne retire jamais les précédents.
    assert set(pips(points, 8)) <= set(chosen)


def test_pips_clamped_to_available_points() -> None:
    points = normalize_window([1.0, 2.0, 3.0])
    assert len(pips(points, 50)) == 3


def test_fit_cubic_passes_through_the_ends() -> None:
    points = normalize_window(WAVE[:20])
    c1, c2 = fit_cubic(points)
    for control in (c1, c2):
        assert 0.0 <= control[0] <= 1.0
    # Le segment ajusté doit rester plus proche que la corde brute.
    start, end = points[0], points[-1]
    chord = sum(
        abs(
            y
            - (start[1] + (end[1] - start[1]) * (x - start[0]) / (end[0] - start[0]))
        )
        for x, y in points
    )
    assert chord > 0


def test_quantize_round_trip_stays_within_one_bin() -> None:
    width = 1.0 / ARG_BINS
    for value in (0.0, 0.1, 1 / 3, 0.5, 0.75, 1.0):
        token = quantize(value)
        assert 1 <= token <= ARG_BINS + 1
        assert abs(dequantize(token) - value) <= width
    # Un argument absent a son propre jeton, distinct de la valeur 0.
    assert quantize(None) == ARG_NONE
    assert dequantize(ARG_NONE) is None
    assert quantize(0.0) != ARG_NONE


def test_quantize_clamps_out_of_range() -> None:
    assert quantize(-5.0) == quantize(0.0)
    assert quantize(9.0) == quantize(1.0)


def test_command_vocabulary_is_the_deepsvg_one() -> None:
    """m / l / c / z plus les trois jetons de service, six arguments chacun."""
    assert (CMD_PAD, CMD_SOS, CMD_EOS) == (0, 1, 2)
    assert (CMD_MOVE, CMD_LINE, CMD_CUBIC, CMD_CLOSE) == (3, 4, 5, 6)
    assert N_ARGS == 6


def test_build_path_starts_with_a_move() -> None:
    points = normalize_window(WAVE)
    commands = build_path(points, pips(points, 10), cubic=True)
    assert commands[0].cmd == CMD_MOVE
    assert all(cmd.cmd in (CMD_MOVE, CMD_LINE, CMD_CUBIC, CMD_CLOSE) for cmd in commands)
    assert all(len(cmd.args) == N_ARGS for cmd in commands)
    linear = build_path(points, pips(points, 10), cubic=False)
    assert {cmd.cmd for cmd in linear[1:]} == {CMD_LINE}


def test_group_has_four_paths_with_stable_roles() -> None:
    """Courbe, enveloppe haute, enveloppe basse, activité — dans cet ordre."""
    activity = [abs(WAVE[i] - WAVE[i - 1]) if i else 0.0 for i in range(len(WAVE))]
    pivots = swing_pivots(WAVE, [str(i) for i in range(len(WAVE))])
    group = build_group(WAVE, activity=activity, pivots=pivots, k=12, cubic=True)
    assert group["roles"] == list(PATH_ROLES)
    assert len(group["paths"]) == MAX_PATHS
    # Les enveloppes demandent des pivots : sans eux les chemins restent vides.
    assert all(len(path) > 0 for path in group["paths"])


def test_group_without_pivots_leaves_envelopes_empty() -> None:
    group = build_group(WAVE, activity=None, pivots=[], k=12, cubic=False)
    tokens = tokenize_group(group)
    assert tokens["path_mask"][0] == 1
    assert tokens["path_mask"][1:3] == [0, 0]


def test_tokenize_group_shapes_are_fixed() -> None:
    """Le transformer attend un tenseur de taille constante."""
    pivots = swing_pivots(WAVE, None)
    group = build_group(WAVE, activity=None, pivots=pivots, k=12, cubic=True)
    tokens = tokenize_group(group)
    assert len(tokens["commands"]) == MAX_PATHS
    assert len(tokens["args"]) == MAX_PATHS
    assert len(tokens["path_mask"]) == MAX_PATHS
    for commands, args in zip(tokens["commands"], tokens["args"]):
        assert len(commands) == MAX_CMDS
        assert len(args) == MAX_CMDS
        assert all(len(row) == N_ARGS for row in args)
    # Chaque chemin non vide est encadré par SOS … EOS puis rempli de PAD.
    first = tokens["commands"][0]
    assert first[0] == CMD_SOS
    assert CMD_EOS in first
    assert first[first.index(CMD_EOS) + 1 :] == [CMD_PAD] * (
        MAX_CMDS - first.index(CMD_EOS) - 1
    )


def test_svg_round_trip_preserves_commands() -> None:
    points = normalize_window(WAVE)
    commands = build_path(points, pips(points, 10), cubic=True)
    reparsed = parse_svg_d(to_svg_d(commands))
    assert [c.cmd for c in reparsed] == [c.cmd for c in commands]
    assert group_to_svg(
        build_group(WAVE, activity=None, pivots=swing_pivots(WAVE, None))
    )


def test_sample_commands_walks_the_path() -> None:
    points = normalize_window(WAVE)
    commands = build_path(points, pips(points, 10), cubic=True)
    sampled = sample_commands(commands, 40)
    assert len(sampled) == 40
    xs = [x for x, _ in sampled]
    assert xs == sorted(xs)


def test_resample_values_keeps_the_ends() -> None:
    for count in (2, 7, 48, 200):
        out = resample_values(WAVE, count)
        assert len(out) == count
        assert out[0] == WAVE[0]
        assert abs(out[-1] - WAVE[-1]) < 1e-9
    assert resample_values(WAVE, 0) == []
    assert resample_values([], 10) == []


def test_swing_pivots_alternate() -> None:
    """Un zigzag ne peut pas enchaîner deux sommets sans creux entre eux."""
    pivots = swing_pivots(WAVE, [str(i) for i in range(len(WAVE))])
    kinds = [p["type"] for p in pivots]
    assert len(pivots) >= 4
    for left, right in zip(kinds, kinds[1:]):
        assert left != right
    indices = [p["index"] for p in pivots]
    assert indices == sorted(indices)
    assert swing_threshold(WAVE) > 0
