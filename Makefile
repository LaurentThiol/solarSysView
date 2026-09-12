.PHONY: help install install-vlm install-chartisme start stop status update doctor shortcut test \
	sync ensure serve export chartisme-export chartisme-scan chartisme-train chartisme-report

help:
	@./launch help

install:
	./launch install

install-vlm:
	./launch install-vlm

# Réseaux du chartisme — optionnels : l'onglet marche sans eux
install-chartisme:
	./launch install-chartisme

# Un seul terminal : install si besoin, API + UI, vérifications /api/alive, Ctrl+C = tout arrêter
start:
	./launch start

shortcut:
	./launch shortcut

stop:
	./launch stop

status:
	@./launch status || true

update:
	./launch update

doctor:
	./launch doctor

test:
	@if [ -x ./.venv/bin/python ]; then ./.venv/bin/python -m pytest -q; else python3 -m pytest -q; fi

sync:
	./.venv/bin/python -m synchro sync

ensure:
	./.venv/bin/python -m synchro ensure

export:
	./.venv/bin/python -m synchro export

# --- Module chartisme ---------------------------------------------------------
# L'export est automatique dès qu'un tirage entre en base (SYNCHRO_CHARTISME_AUTO_EXPORT).
# Ces cibles servent à le forcer, ou à travailler sans interface.

chartisme-export:
	./.venv/bin/python -m synchro chartisme export

chartisme-scan:
	./.venv/bin/python -m synchro chartisme scan

# Quelques minutes sur processeur. Nécessite `make install-chartisme`.
chartisme-train:
	./.venv/bin/python -m synchro chartisme train

chartisme-report:
	./.venv/bin/python -m synchro chartisme report

# À lancer dans un terminal dédié (bloque) — préférez `make start` / `./launch`
serve: stop
	./.venv/bin/python -m synchro serve
