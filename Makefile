.PHONY: help install start stop status update doctor shortcut test sync ensure serve export

help:
	@./launch help

install:
	./launch install

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

# À lancer dans un terminal dédié (bloque) — préférez `make start` / `./launch`
serve: stop
	./.venv/bin/python -m synchro serve
