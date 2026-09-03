"""Rendu glyphe : SVG humain (numéros) et PNG VLM (disques muets)."""

from __future__ import annotations

import io
from typing import Any

from synchro.morpho.board import (
    CELL,
    N_COLS,
    N_ROWS,
    STAR_COLS,
    STAR_ROWS,
    canvas_size,
    cell_center,
    cell_number,
    cell_rect,
    cell_star,
    numbers_origin,
    stars_origin,
)

SVG_NS = "http://www.w3.org/2000/svg"


def _svg_board(
    origin: tuple[int, int],
    rows: int,
    cols: int,
    filled: set[int],
    number_fn,
    *,
    show_labels: bool,
) -> list[str]:
    parts: list[str] = []
    for r in range(rows):
        for c in range(cols):
            n = number_fn(r, c)
            x, y, w, h = cell_rect(origin, r, c)
            on = n in filled
            fill = "#d4a017" if on else "#1a1a1e"
            stroke = "#d4a017" if on else "#3f3f46"
            parts.append(
                f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="5" '
                f'fill="{fill}" stroke="{stroke}" stroke-width="1"/>'
            )
            if show_labels:
                cx, cy = cell_center(origin, r, c)
                color = "#111" if on else "#a1a1aa"
                parts.append(
                    f'<text x="{cx:.1f}" y="{cy + 4:.1f}" text-anchor="middle" '
                    f'font-size="11" font-family="ui-sans-serif, system-ui" fill="{color}">{n}</text>'
                )
    return parts


def glyph_svg(
    numbers: list[int],
    stars: list[int],
    *,
    show_labels: bool = True,
    title: str | None = None,
) -> str:
    width, height = canvas_size()
    parts = [
        f'<svg xmlns="{SVG_NS}" viewBox="0 0 {width} {height}" width="{width}" height="{height}" role="img">'
    ]
    if title:
        parts.append(f"<title>{title}</title>")
    parts.append(f'<rect width="{width}" height="{height}" fill="#0c0c0e"/>')
    parts.extend(
        _svg_board(numbers_origin(), N_ROWS, N_COLS, set(numbers), cell_number, show_labels=show_labels)
    )
    parts.extend(
        _svg_board(stars_origin(), STAR_ROWS, STAR_COLS, set(stars), cell_star, show_labels=show_labels)
    )
    parts.append("</svg>")
    return "".join(parts)


def glyph_png(
    numbers: list[int],
    stars: list[int],
    *,
    show_labels: bool = False,
) -> bytes:
    from PIL import Image, ImageDraw

    width, height = canvas_size()
    img = Image.new("RGB", (width, height), (8, 8, 10))
    draw = ImageDraw.Draw(img)

    def paint(origin, rows, cols, filled, number_fn) -> None:
        for r in range(rows):
            for c in range(cols):
                n = number_fn(r, c)
                x, y, w, h = cell_rect(origin, r, c)
                on = n in filled
                cx, cy = x + w / 2, y + h / 2
                radius = CELL // 2 - 2
                if on:
                    draw.ellipse(
                        [cx - radius, cy - radius, cx + radius, cy + radius],
                        fill=(240, 240, 245),
                    )
                else:
                    draw.ellipse(
                        [cx - radius, cy - radius, cx + radius, cy + radius],
                        outline=(50, 50, 56),
                        width=1,
                    )
                if show_labels:
                    draw.text((cx - 4, cy - 5), str(n), fill=(180, 180, 180))

    paint(numbers_origin(), N_ROWS, N_COLS, set(numbers), cell_number)
    paint(stars_origin(), STAR_ROWS, STAR_COLS, set(stars), cell_star)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def montage_png(draws: list[tuple[list[int], list[int]]], *, gap: int = 12) -> bytes:
    from PIL import Image

    tiles = [Image.open(io.BytesIO(glyph_png(n, s))) for n, s in draws]
    if not tiles:
        raise ValueError("montage vide")
    w, h = tiles[0].size
    out = Image.new("RGB", (w * len(tiles) + gap * (len(tiles) - 1), h), (8, 8, 10))
    x = 0
    for tile in tiles:
        out.paste(tile, (x, 0))
        x += w + gap
    buf = io.BytesIO()
    out.save(buf, format="PNG")
    return buf.getvalue()


def side_by_side_png(a: tuple[list[int], list[int]], b: tuple[list[int], list[int]]) -> bytes:
    return montage_png([a, b], gap=20)


def portrait_render(portrait: dict[str, Any], *, labels: bool = True) -> dict[str, Any]:
    return {
        **portrait,
        "svg": glyph_svg(portrait["numbers"], portrait["stars"], show_labels=labels),
    }
