"""Bloc Persist : reprise 0 / +1 sous DeltaEvol."""

from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def test_persist_series_node() -> None:
    script = ROOT / "tests" / "test_persist_evol.ts"
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


def test_persist_block_follows_delta_evol() -> None:
    panel = (ROOT / "src/components/evolution-panel.tsx").read_text(encoding="utf-8")
    block = (ROOT / "src/components/evolution-persist.tsx").read_text(encoding="utf-8")
    page = (ROOT / "src/app/evolution/page.tsx").read_text(encoding="utf-8")
    readme = (ROOT / "README.md").read_text(encoding="utf-8")

    assert 'from "@/components/evolution-persist"' in panel
    assert "<EvolutionPersist draws={filtered} />" in panel
    body = panel.split("function EvolutionContent", 1)[1]
    assert body.index("<EvolutionDelta") < body.index("<EvolutionPersist")
    assert body.index("<EvolutionPersist") < body.index("<EvolutionGains")
    assert "la reprise 0 / +1" in body
    assert "Persist" in block
    assert 'type="stepAfter"' in block
    assert "Numéros n−2" in block
    assert "Étoiles n−2" in block
    assert "aucune" in block
    assert "paires n, n+1" in block
    assert "Persist (reprise 0 / +1, n−1 et n−2)" in page
    assert "**Persist**, juste sous DeltaEvol" in readme
    assert "n−2 : la même règle deux tirages plus tôt" in readme
