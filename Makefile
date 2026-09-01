.PHONY: install test sync serve export

install:
	python3 -m pip install -r requirements.txt

test:
	python3 -m pytest -q

sync:
	python3 -m synchro sync

export:
	python3 -m synchro export

serve:
	python3 -m synchro serve
