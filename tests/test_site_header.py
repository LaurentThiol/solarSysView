import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STARTUP = (ROOT / "src/components/startup-status.tsx").read_text(encoding="utf-8")
NAV = (ROOT / "src/lib/nav.ts").read_text(encoding="utf-8")


def test_site_header_uses_a_burger_menu_everywhere() -> None:
    header = STARTUP.split("export function SiteHeader", 1)[1]
    assert 'aria-label={menuOpen ? "Fermer le menu" : "Ouvrir le menu"}' in header
    assert "lg:hidden" not in header
    assert "lg:flex" not in header
    assert "createPortal" in header
    assert "<StartupStatus />" in header
    assert "<QuitButton />" in header
    assert "<CaptureButton />" in header
    assert "<GlossaryButton />" in header
    assert "current.label" in header


def test_nav_items_are_grouped_in_the_drawer() -> None:
    assert 'id: "archive"' in NAV
    assert 'id: "lecture"' in NAV
    assert 'id: "grilles"' in NAV
    assert 'id: "assistants"' in NAV
    assert 'id: "systeme"' in NAV
    assert "NAV_GROUPS" in STARTUP
    assert "/brain/specialistes" in NAV
    assert NAV.count('href: "/evolution"') == 1
    hrefs = re.findall(r'href: "([^"]+)"', NAV)
    assert hrefs, "nav items must declare hrefs"
    assert len(hrefs) == len(set(hrefs))
    nav = STARTUP.split("function FamilyLinks", 1)[1].split("export function SiteHeader", 1)[0]
    header = STARTUP.split("export function SiteHeader", 1)[1]
    assert "whitespace-nowrap text-xs" not in nav
    assert "NAV_GROUPS.map" in nav
    assert "family.items.map" in nav
    assert 'aria-label="Sections"' in nav
    assert "group.items.map" not in header
    assert "family.home" not in header
    assert 'aria-label="Familles"' not in header
    assert "NAV_GROUPS.map" not in header
    assert "current.label" in header
    assert 'aria-current="page"' in header
