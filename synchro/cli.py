from __future__ import annotations

import argparse
import sys
from typing import Any

import uvicorn

from synchro import db
from synchro.sync import ensure_draws, sync_draws
from synchro.app import export_snapshot
from synchro.config import get_settings


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="synchro",
        description="Synchro des tirages EuroMillions (FDJ → Neon).",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("init-db", help="Créer les tables Neon")
    sub.add_parser("sync", help="Télécharger l'historique FDJ et l'écrire dans Neon")
    sub.add_parser(
        "ensure",
        help="Rattraper les derniers tirages FDJ si Neon est en retard (archive récente)",
    )
    sub.add_parser("export", help="Exporter un snapshot JSON pour Netlify (site statique)")
    serve = sub.add_parser("serve", help="Lancer l'interface locale")
    serve.add_argument("--host", default=None)
    serve.add_argument("--port", type=int, default=None)

    chartisme = sub.add_parser(
        "chartisme",
        help="Module chartisme : export des courbes, figures, entraînement, rétro-test",
    )
    chartisme.add_argument(
        "action",
        choices=("export", "scan", "train", "report", "auto"),
    )
    chartisme.add_argument("--era", default="all", choices=("current", "all"))
    chartisme.add_argument("--curve", default=None, help="Limiter à une courbe (ex. delay:7)")
    chartisme.add_argument("--epochs", type=int, default=None)
    chartisme.add_argument("--per-class", type=int, default=300)
    chartisme.add_argument("--min-confidence", type=float, default=0.6)
    chartisme.add_argument("--max-curves", type=int, default=12)

    specialist = sub.add_parser(
        "specialist",
        help="Spécialistes Brain : entraîner / lister / inférer un réseau par série",
    )
    specialist.add_argument("action", choices=("train", "list", "infer", "delete"))
    specialist.add_argument("--name", default="Paire impair")
    specialist.add_argument("--target", default="parity")
    specialist.add_argument("--indicators", default="lag1,lag2,rsi,macd,bollinger")
    specialist.add_argument(
        "--instructions",
        default="Forecast de la parité (nombre de pairs 0–5) à t+1. Pas une grille.",
    )
    specialist.add_argument("--task", default=None, choices=("regression", "classes", "binary"))
    specialist.add_argument("--horizon", default="value", choices=("value", "delta"))
    specialist.add_argument("--era", default="current", choices=("current", "all"))
    specialist.add_argument("--force", action="store_true")
    specialist.add_argument("--slug", default=None)
    specialist.add_argument("--epochs", type=int, default=80)
    specialist.add_argument("--hidden", type=int, default=16)

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

    if args.command == "ensure":
        result = ensure_draws()
        latest = result.get("latest") or {}
        if result.get("skipped"):
            print(
                f"Tirages déjà à jour — dernier {latest.get('draw_date')} "
                f"(attendu {result.get('expected_draw_date')})."
            )
            return 0
        archive = "archive récente" if result.get("latest_only") else "historique complet"
        print(
            f"Synchro OK ({archive}) — {result['fetched']} tirages FDJ, "
            f"{result['upserted']} lignes écrites. "
            f"Dernier: {latest.get('draw_date')} "
            f"{latest.get('numbers')} ★ {latest.get('stars')}"
        )
        return 0

    if args.command == "export":
        path = export_snapshot()
        print(f"Snapshot écrit: {path}")
        return 0

    if args.command == "chartisme":
        return run_chartisme(args)

    if args.command == "specialist":
        return run_specialist(args)

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


def run_chartisme(args: argparse.Namespace) -> int:
    """Module chartisme en ligne de commande — usage cron, sans interface."""
    from synchro.chartisme.auto import run_cycle, status
    from synchro.chartisme.backtest import run as backtest_run
    from synchro.chartisme.export import export_curves, manifest, read_bundle, write_bundle
    from synchro.chartisme.scan import outcome_stats, scan_curve

    def draws_of() -> list[dict[str, Any]]:
        db.init_db()
        return [db.serialize_draw(row) for row in db.all_draws(era=args.era)]

    def bundle_of() -> dict[str, Any]:
        cached = read_bundle()
        if cached:
            return cached
        bundle = export_curves(draws_of())
        write_bundle(bundle)
        return bundle

    if args.action == "export":
        bundle = export_curves(draws_of())
        path = write_bundle(bundle)
        info = manifest(bundle)
        print(
            f"Courbes exportées: {info['curve_count']} "
            f"({info['draw_count']} tirages) → {path}"
        )
        return 0

    if args.action == "scan":
        bundle = bundle_of()
        curves = bundle.get("curves") or []
        if args.curve:
            curves = [c for c in curves if c.get("id") == args.curve]
            if not curves:
                print(f"Courbe introuvable: {args.curve}", file=sys.stderr)
                return 1
        chosen = curves[: args.max_curves]
        hits: list[dict[str, Any]] = []
        for curve in chosen:
            hits.extend(scan_curve(curve, min_confidence=args.min_confidence))
        print(f"{len(hits)} figures sur {len(chosen)} courbes")
        stats = outcome_stats(hits)
        for figure, row in sorted(stats.items(), key=lambda kv: -(kv[1]["settled"] or 0)):
            rate = row["hit_rate"]
            share = "—" if rate is None else f"{rate:.1%}"
            print(
                f"  {figure:<16} {row['settled']:>4} tranchées, "
                f"objectif atteint {share}"
            )
        return 0

    if args.action == "train":
        from synchro.chartisme.dataset import build_dataset
        from synchro.chartisme.models import torch_available
        from synchro.chartisme.models.train import DEFAULT_EPOCHS
        from synchro.chartisme.models.train import run as train_run

        if not torch_available():
            print(
                "torch absent — ./launch install-chartisme. Les détecteurs "
                "géométriques et la recherche DTW fonctionnent sans.",
                file=sys.stderr,
            )
            return 1
        dataset = build_dataset(per_class=args.per_class)
        report = train_run(dataset, epochs=args.epochs or DEFAULT_EPOCHS)
        for name, row in report["models"].items():
            if "unavailable" in row:
                print(f"  {name:<12} indisponible ({row['unavailable']})")
                continue
            print(
                f"  {name:<12} justesse {row.get('accuracy')} "
                f"F1 macro {row.get('macro_f1')}"
            )
        verdict = report["verdict"]
        print(
            "Les réseaux gagnent leur place."
            if verdict["networks_earn_their_place"]
            else f"Meilleur classifieur: {verdict['best']} — les réseaux ne battent "
            "pas encore la référence."
        )
        return 0

    if args.action == "report":
        bundle = bundle_of()
        curves = bundle.get("curves") or []
        if args.curve:
            curves = [c for c in curves if c.get("id") == args.curve]
        chosen = curves[: args.max_curves]
        hits: list[dict[str, Any]] = []
        for curve in chosen:
            hits.extend(scan_curve(curve, min_confidence=args.min_confidence))
        report = backtest_run(
            {str(c.get("id")): c for c in chosen},
            hits,
            draws=draws_of(),
            base_rate_trials=120,
        )
        print(f"{report['figure_count']} figures sur {report['curve_count']} courbes")
        for row in report["targets"]["figures"][:12]:
            print(
                f"  {row['figure']:<16} atteint {row['hit_rate']} "
                f"contre {row['null_rate']} au hasard "
                f"(n={row['settled']})"
            )
        print("  " + report["targets"]["verdict"]["note"])
        base = report["base_rates"]
        print(
            f"  Taux de base : {base['windows_with_any_figure']:.0%} des marches "
            "aléatoires portent au moins une figure."
        )
        if report.get("numbers"):
            print("  " + report["numbers"]["verdict"])
        print("  " + report["disclaimer"])
        return 0

    if args.action == "auto":
        state = run_cycle(draws_of(), reason="cli")
        print(
            f"Cycle terminé en {state['seconds']}s — "
            f"{state['curves']['curve_count']} courbes, "
            f"{state['figures']['count']} figures, "
            f"{state['firings']['count']} déclenchements"
        )
        current = status()
        models = current["models"]
        print(f"  Réseaux disponibles: {', '.join(models['available']) or 'aucun'}")
        return 0

    return 1


def run_specialist(args: argparse.Namespace) -> int:
    from synchro.brain_specialists import (
        delete_specialist,
        infer_specialist,
        list_specialists,
        train_specialist,
    )

    def draws_of() -> list[dict[str, Any]]:
        db.init_db()
        return [db.serialize_draw(row) for row in db.all_draws(era=args.era)]

    if args.action == "list":
        items = list_specialists()
        if not items:
            print("Aucun spécialiste sauvé dans .brain/specialists/")
            return 0
        for item in items:
            print(
                f"  @{item['handle']:<28} {item['target']:<12} "
                f"skill {item.get('skill')} · {item.get('verdict')}"
            )
        return 0

    if args.action == "delete":
        slug = args.slug
        if not slug:
            print("--slug obligatoire pour delete", file=sys.stderr)
            return 1
        if not delete_specialist(slug):
            print(f"Introuvable: {slug}", file=sys.stderr)
            return 1
        print(f"Supprimé: {slug}")
        return 0

    if args.action == "infer":
        slug = args.slug
        if not slug:
            print("--slug obligatoire pour infer", file=sys.stderr)
            return 1
        payload = infer_specialist(draws_of(), slug)
        forecast = payload.get("forecast") or {}
        print(
            f"@{payload['handle']} → {forecast.get('value')} "
            f"(σ {forecast.get('sigma')}, skill {payload.get('skill')})"
        )
        if forecast.get("abstain"):
            print("  abstention (confiance trop basse)")
        return 0

    indicators = [part.strip() for part in str(args.indicators).split(",") if part.strip()]
    record = train_specialist(
        draws_of(),
        name=args.name,
        target=args.target,
        indicators=indicators,
        instructions=args.instructions,
        task=args.task,
        horizon=args.horizon,
        epochs=args.epochs,
        hidden=args.hidden,
        force=args.force,
    )
    print(
        f"{record['name']} @{record['handle']} skill {record['skill']} "
        f"({record.get('verdict')}) saved={record['saved']}"
    )
    if record.get("reason"):
        print(f"  {record['reason']}")
    return 0 if record.get("saved") or record.get("reason") else 1


if __name__ == "__main__":
    sys.exit(main())
