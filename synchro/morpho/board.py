"""Grille EuroMillions : 5×10 (boules 1–50) + 2×6 (étoiles 1–12)."""

from __future__ import annotations

N_ROWS = 5
N_COLS = 10
STAR_ROWS = 2
STAR_COLS = 6
N_POOL = 50
S_POOL = 12

# Canvas VLM (pixels). Cellules carrées, pas de texte.
CELL = 28
GAP = 4
MARGIN = 16
BOARD_GAP = 24


def number_cell(n: int) -> tuple[int, int]:
    if not 1 <= n <= N_POOL:
        raise ValueError(f"numéro hors grille: {n}")
    i = n - 1
    return i // N_COLS, i % N_COLS


def star_cell(s: int) -> tuple[int, int]:
    if not 1 <= s <= S_POOL:
        raise ValueError(f"étoile hors grille: {s}")
    i = s - 1
    return i // STAR_COLS, i % STAR_COLS


def cell_number(row: int, col: int) -> int:
    if not (0 <= row < N_ROWS and 0 <= col < N_COLS):
        raise ValueError(f"cellule hors grille: {(row, col)}")
    return row * N_COLS + col + 1


def cell_star(row: int, col: int) -> int:
    if not (0 <= row < STAR_ROWS and 0 <= col < STAR_COLS):
        raise ValueError(f"étoile hors grille: {(row, col)}")
    return row * STAR_COLS + col + 1


def numbers_board_size() -> tuple[int, int]:
    w = N_COLS * CELL + (N_COLS - 1) * GAP
    h = N_ROWS * CELL + (N_ROWS - 1) * GAP
    return w, h


def stars_board_size() -> tuple[int, int]:
    w = STAR_COLS * CELL + (STAR_COLS - 1) * GAP
    h = STAR_ROWS * CELL + (STAR_ROWS - 1) * GAP
    return w, h


def canvas_size() -> tuple[int, int]:
    nw, nh = numbers_board_size()
    _sw, sh = stars_board_size()
    width = MARGIN * 2 + nw
    height = MARGIN + nh + BOARD_GAP + sh + MARGIN
    return width, height


def numbers_origin() -> tuple[int, int]:
    return MARGIN, MARGIN


def stars_origin() -> tuple[int, int]:
    _nw, nh = numbers_board_size()
    sw, _sh = stars_board_size()
    # étoiles centrées sous la grille des boules
    x = MARGIN + max(0, (numbers_board_size()[0] - sw) // 2)
    y = MARGIN + nh + BOARD_GAP
    return x, y


def cell_rect(origin: tuple[int, int], row: int, col: int) -> tuple[int, int, int, int]:
    ox, oy = origin
    x = ox + col * (CELL + GAP)
    y = oy + row * (CELL + GAP)
    return x, y, CELL, CELL


def cell_center(origin: tuple[int, int], row: int, col: int) -> tuple[float, float]:
    x, y, w, h = cell_rect(origin, row, col)
    return x + w / 2, y + h / 2


def _hit_board(
    px: float,
    py: float,
    origin: tuple[int, int],
    rows: int,
    cols: int,
) -> tuple[int, int] | None:
    ox, oy = origin
    w = cols * CELL + (cols - 1) * GAP
    h = rows * CELL + (rows - 1) * GAP
    if px < ox or py < oy or px > ox + w or py > oy + h:
        return None
    col = int((px - ox) / (CELL + GAP))
    row = int((py - oy) / (CELL + GAP))
    col = max(0, min(cols - 1, col))
    row = max(0, min(rows - 1, row))
    rx, ry, rw, rh = cell_rect(origin, row, col)
    if rx - GAP / 2 <= px <= rx + rw + GAP / 2 and ry - GAP / 2 <= py <= ry + rh + GAP / 2:
        return row, col
    return row, col


def norm_to_pixel(x: float, y: float) -> tuple[float, float]:
    width, height = canvas_size()
    return x * width, y * height


def pixel_to_norm(px: float, py: float) -> tuple[float, float]:
    width, height = canvas_size()
    return px / width, py / height


def point_to_number(x_norm: float, y_norm: float) -> int | None:
    px, py = norm_to_pixel(x_norm, y_norm)
    hit = _hit_board(px, py, numbers_origin(), N_ROWS, N_COLS)
    if hit is None:
        return None
    return cell_number(*hit)


def point_to_star(x_norm: float, y_norm: float) -> int | None:
    px, py = norm_to_pixel(x_norm, y_norm)
    hit = _hit_board(px, py, stars_origin(), STAR_ROWS, STAR_COLS)
    if hit is None:
        return None
    return cell_star(*hit)


def occupancy(numbers: list[int], stars: list[int]) -> list[int]:
    bits = [0] * (N_POOL + S_POOL)
    for n in numbers:
        if 1 <= n <= N_POOL:
            bits[n - 1] = 1
    for s in stars:
        if 1 <= s <= S_POOL:
            bits[N_POOL + s - 1] = 1
    return bits
