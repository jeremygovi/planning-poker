.DEFAULT_GOAL := help

BACKUP_FILE ?= backups/poker-express-$(shell date +%Y-%m-%d-%H%M%S).db

.PHONY: help install dev test e2e lint typecheck build up down restart logs shell prod backup clean

help: ## Afficher cette aide
	@awk 'BEGIN {FS = ":.*## "; printf "Poker Express — commandes disponibles\n\n"} /^[a-zA-Z_-]+:.*## / {printf "  %-12s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: ## Installer les dépendances Node.js
	docker compose --profile tools build poker-express-tools

dev: ## Lancer le serveur et l'interface avec rechargement automatique
	docker compose --profile dev up --build poker-express-dev

test: ## Exécuter les tests unitaires et API
	docker compose --profile tools build poker-express-tools
	docker compose --profile tools run --rm poker-express-tools npm test

e2e: ## Exécuter le parcours Playwright
	docker compose --profile e2e build poker-express-e2e
	docker compose --profile e2e run --rm poker-express-e2e

lint: ## Vérifier la qualité du code
	docker compose --profile tools build poker-express-tools
	docker compose --profile tools run --rm poker-express-tools npm run lint

typecheck: ## Vérifier les types TypeScript
	docker compose --profile tools build poker-express-tools
	docker compose --profile tools run --rm poker-express-tools npm run typecheck

build: ## Construire l'application complète
	docker compose build  --no-cache poker-express

up: ## Démarrer Poker Express au premier plan
	docker compose up

down: ## Arrêter Poker Express
	docker compose down

restart: ## Redémarrer Poker Express
	docker compose restart

logs: ## Suivre les logs
	docker compose logs -f

shell: ## Ouvrir un shell dans le conteneur
	docker compose exec poker-express sh

prod: ## Construire et lancer l'application en arrière-plan
	docker compose build --no-cache && docker compose up -d

backup: ## Créer une sauvegarde SQLite cohérente
	docker run --rm -v "$(CURDIR):/workspace" alpine:3.20 mkdir -p /workspace/backups
	docker compose exec -T poker-express node dist/backend/server/backup.js /data/poker-express.backup.db
	@docker compose cp poker-express:/data/poker-express.backup.db "$(BACKUP_FILE)"
	@docker compose exec -T poker-express rm -f /data/poker-express.backup.db
	@echo "Sauvegarde créée : $(BACKUP_FILE)"

clean: ## Supprimer les artefacts générés sans toucher aux données
	docker compose --profile dev --profile tools --profile e2e down --remove-orphans
