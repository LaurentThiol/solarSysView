from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STARTUP = (ROOT / "src/components/startup-status.tsx").read_text(encoding="utf-8")


def test_site_header_uses_a_burger_menu_everywhere() -> None:
    header = STARTUP.split("export function SiteHeader", 1)[1]
    assert 'aria-label={menuOpen ? "Fermer le menu" : "Ouvrir le menu"}' in header
    assert "lg:hidden" not in header
    assert "lg:flex" not in header
    assert "createPortal" in header
    assert "<StartupStatus />" in header
    assert "<QuitButton />" in header
    assert "<CaptureButton />" in header
    assert "current.label" in header


def test_nav_items_are_grouped_in_the_drawer() -> None:
    assert 'group: "Archives"' in STARTUP
    assert 'group: "Laboratoires"' in STARTUP
    assert 'group: "Assistants"' in STARTUP
    assert 'group: "Système"' in STARTUP
    assert 'NAV_GROUP_ORDER = ["Archives", "Laboratoires", "Assistants", "Système"]' in STARTUP
    assert "/brain/specialistes" in STARTUP
    nav = STARTUP.split("function NavLinks", 1)[1].split("export function SiteHeader", 1)[0]
    assert "whitespace-nowrap text-xs" not in nav
    assert "NAV_GROUP_ORDER.map" in nav
