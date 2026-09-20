from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_nav_groups_and_glossary_exist() -> None:
    nav = (ROOT / "src/lib/nav.ts").read_text(encoding="utf-8")
    copy = (ROOT / "src/lib/copy.ts").read_text(encoding="utf-8")
    header = (ROOT / "src/components/startup-status.tsx").read_text(encoding="utf-8")
    assert 'id: "archive"' in nav
    assert 'id: "lecture"' in nav
    assert "/brain/specialistes" in nav
    assert "Fenêtre de travail" in copy
    assert "GlossaryButton" in header
    assert "AddressButton" in header
    assert "Santé" in header
    assert "QuitButton" in header
    assert 'aria-label="Familles"' not in header
    assert 'aria-label="Sections"' in header
    assert "Aller à" not in header
    assert "family.home" not in header
    assert "group.items.map" not in header.split("export function SiteHeader", 1)[1]
    assert "current.label" in header
    assert "createPortal" in header
    assert "site-nav-drawer" in header
    assert "PageShell" in (ROOT / "src/components/page-shell.tsx").read_text(encoding="utf-8")
    pills = (ROOT / "src/components/ui/pill-tabs.tsx").read_text(encoding="utf-8")
    assert "PillTabs" in pills
    assert "compact" in pills
    assert "SITE_HEADER_SLOT_ID" in header
    slot = (ROOT / "src/components/site-header-slot.tsx").read_text(encoding="utf-8")
    assert 'SITE_HEADER_SLOT_ID = "site-header-slot"' in slot
