"""Onglet Bouncing : amortissement des arches sur n1…n5 et e1, e2."""

from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def test_bouncing_node() -> None:
    script = ROOT / "tests" / "test_bouncing.ts"
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


def test_bouncing_tab_is_wired() -> None:
    panel = (ROOT / "src/components/evolution-panel.tsx").read_text(encoding="utf-8")
    page = (ROOT / "src/app/evolution/page.tsx").read_text(encoding="utf-8")
    view = (ROOT / "src/components/bouncing-panel.tsx").read_text(encoding="utf-8")
    glossary = (ROOT / "src/lib/copy.ts").read_text(encoding="utf-8")
    pack = (ROOT / "src/lib/capture/pack.ts").read_text(encoding="utf-8")

    assert 'id: "bouncing"' in panel
    assert "BouncingPanel" in panel
    assert "useLabTab" in panel
    assert "Suspense" in page
    assert "Aucun amortissement de rebond sur cette fenêtre." in view
    assert 'term: "Bouncing"' in glossary
    assert "Bouncing ·" in pack
