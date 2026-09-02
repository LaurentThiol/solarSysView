from __future__ import annotations

import argparse
import sys

import uvicorn

from synchro import db
from synchro.app import export_snapshot, sync_draws
from synchro.config import get_settings


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="synchro",
        description="Synchro des tirages EuroMillions (FDJ → Neon).",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("init-db", help="Créer les tables Neon")
    sub.add_parser("sync", help="Télécharger l'historique FDJ et l'écrire dans Neon")
    sub.add_parser("export", help="Exporter un snapshot JSON pour Netlify (site statique)")
    serve = sub.add_parser("serve", help="Lancer l'interface locale")
    serve.add_argument("--host", default=None)
    serve.add_argument("--port", type=int, default=None)

    args = parser.parse_args(argv)

    if args.command == "init-db":
        db.init_db()
        print(f"Tables prêtes. Tirages en base: {db.count_draws()}")
        return 0

    if args.command == "sync":
        result = sync_draws()
        latest = result.get("latest") or {}
        print(
            f"Synchro OK — {result['fetched']} tirages FDJ, "
            f"{result['upserted']} lignes écrites. "
            f"Dernier: {latest.get('draw_date')} "
            f"{latest.get('numbers')} ★ {latest.get('stars')}"
        )
        return 0

    if args.command == "export":
        path = export_snapshot()
        print(f"Snapshot écrit: {path}")
        return 0

    if args.command == "serve":
        settings = get_settings()
        uvicorn.run(
            "synchro.app:create_app",
            factory=True,
            host=args.host or settings.host,
            port=args.port or settings.port,
            log_level="info",
        )
        return 0

    parser.print_help()
    return 1


if __name__ == "__main__":
    sys.exit(main())
