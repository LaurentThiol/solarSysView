"""Traits de fin de mois sur les courbes temporelles d’Évolution."""

from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]

CHARTS = [
    ROOT / "src/components/draw-chart.tsx",
    ROOT / "src/components/evolution-gains.tsx",
    ROOT / "src/components/evolution-delta.tsx",
    ROOT / "src/components/evolution-parity.tsx",
    ROOT / "src/components/evolution-shape.tsx",
    ROOT / "src/components/bouncing-panel.tsx",
    ROOT / "src/components/weekday-synthesis-card.tsx",
]


def test_month_end_node() -> None:
    script = ROOT / "tests" / "test_month_end.ts"
    result = subprocess.run(
        [
            "node",
            "--experimental-strip-types",
            "--import",
            str(ROOT / "tests" / "node-register.mjs"),
            "--test",
            str(script),
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stdout + result.stderr


def test_every_evolution_time_chart_marks_month_ends() -> None:
    for path in CHARTS:
        source = path.read_text(encoding="utf-8")
        assert "MonthEndMarks" in source, path.name
        assert "withMonthEndNote" in source, path.name
    delta = (ROOT / "src/components/evolution-delta.tsx").read_text(encoding="utf-8")
    assert delta.count("<MonthEndMarks") == 2
    assert 'dates={series.map((point) => point.date)} yAxisId="left"' in delta
    assert 'dates={coherence.points.map((point) => point.date)}' in delta
    histogram = delta.split("<BarChart", 1)[1]
    assert "<MonthEndMarks" not in histogram
