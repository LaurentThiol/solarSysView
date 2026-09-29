"""Ligne « 1er rang » aussi sur Somme des numéros (Évolution)."""

from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def test_rank1_overlay_node() -> None:
    script = ROOT / "tests" / "test_draw_chart_rank.ts"
    result = subprocess.run(
        [
            "node",
            "--experimental-strip-types",
            "--test",
            str(script),
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stdout + result.stderr


def test_sum_numbers_wires_rank1_like_each_number() -> None:
    chart = (ROOT / "src/components/draw-chart.tsx").read_text(encoding="utf-8")
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    lib = (ROOT / "src/lib/draw-chart-rank.ts").read_text(encoding="utf-8")

    assert 'from "@/lib/draw-chart-rank"' in chart
    assert "appendRank1Key" in chart
    assert "weekdaySplitKeys(visibleKeys)" in chart
    assert "splitKeys.length > 0" in chart
    assert "WeekdaySeriesLines" in chart
    assert 'keys.find((key) => key !== "rank1")' not in chart
    assert 'keys.includes("rank1")' in chart
    assert 'mode === "eachNumber" || mode === "sumNumbers"' in lib
    assert "sur « Somme des numéros » et « Chaque numéro »" in readme
    assert (
        "« Somme des numéros » et « Chaque numéro » superposent la ligne 1er rang"
        in chart
    )


def test_weekday_lines_follow_every_visible_series() -> None:
    chart = (ROOT / "src/components/draw-chart.tsx").read_text(encoding="utf-8")
    delta = (ROOT / "src/components/evolution-delta.tsx").read_text(encoding="utf-8")
    shape = (ROOT / "src/components/evolution-shape.tsx").read_text(encoding="utf-8")
    parity = (ROOT / "src/components/evolution-parity.tsx").read_text(encoding="utf-8")
    gains = (ROOT / "src/components/evolution-gains.tsx").read_text(encoding="utf-8")
    for source in (chart, delta, shape, parity):
        assert "WeekdaySeriesLines" in source
        assert "weekdayOverlayFieldsFor" in source
        assert 'dataKey="overlayMardi"' not in source
    assert 'dataKey="overlayMardi"' in gains
