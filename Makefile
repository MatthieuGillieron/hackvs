# FlexRadar — raccourcis. `make help` pour la liste.
PY ?= python3
RUFF ?= uvx ruff   # ou RUFF=ruff si ruff est installé

.PHONY: help install dev data data-offline build test lint check

help:  ## Affiche cette aide
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  make %-13s %s\n", $$1, $$2}'

install:  ## Installe les dépendances du frontend
	cd frontend && npm ci

dev: install  ## Lance l'interface sur http://localhost:5173
	cd frontend && npm run dev

data:  ## Rafraîchit tous les snapshots depuis les sources publiques (réseau)
	cd backend && $(PY) -m sources fetch all

data-offline:  ## Reconstruit les snapshots depuis le cache local, sans réseau
	cd backend && $(PY) -m sources fetch all --offline

build:  ## Régénère frontend/public/data/ (alertes, emails, fiches d'appel)
	cd backend && $(PY) -m engine build

test:  ## Tests du moteur et des snapshots
	cd backend && $(PY) -m unittest discover -s tests -t .

lint:  ## Lint backend (ruff) et frontend (tsc + oxlint)
	cd backend && $(RUFF) check .
	cd frontend && npm run check

check: lint test  ## Tout vérifier avant un commit
