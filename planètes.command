#!/usr/bin/env bash
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT" || exit 1

"$ROOT/planetes" "$@"
STATUS=$?

if [ "$STATUS" -ne 0 ]; then
  echo ""
  read -r -p "Appuyez sur Entrée pour fermer cette fenêtre…" _
fi
exit "$STATUS"
