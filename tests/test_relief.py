from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_relief_rank_time_offers_optional_surface_fill() -> None:
    lab = (ROOT / "src/components/relief/relief-lab.tsx").read_text(encoding="utf-8")
    canvas = (ROOT / "src/components/relief/relief-canvas.tsx").read_text(encoding="utf-8")
    profiles = (ROOT / "src/lib/relief/profiles.ts").read_text(encoding="utf-8")
    pack = (ROOT / "src/lib/capture/pack.ts").read_text(encoding="utf-8")
    assert 'label="Surfaces"' in lab
    assert "rankFill" in lab
    assert "rankTimePatches" in canvas
    assert "paintRankTimeFill" in canvas
    assert "export function rankTimePatches" in profiles
    assert "rankFill" in pack
