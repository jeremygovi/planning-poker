.DEFAULT_GOAL := help

BACKUP_FILE ?= backups/poker-express-$(shell date +%Y-%m-%d-%H%M%S).db
DEV_COMPOSE := docker compose -f docker-compose-dev.yaml
PROD_COMPOSE := docker compose -f docker-compose.yaml

.PHONY: help install dev test e2e lint typecheck build up down restart logs shell prod backup clean

help: ## Afficher cette aide
	@awk 'BEGIN {FS = ":.*## "; printf "Poker Express — commandes disponibles\n\n"} /^[a-zA-Z_-]+:.*## / {printf "  %-12s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: ## Installer les dépendances Node.js
	$(DEV_COMPOSE) --profile tools build poker-express-tools

dev: ## Lancer le serveur et l'interface avec rechargement automatique
	$(DEV_COMPOSE) --profile dev up --build poker-express-dev

test: ## Exécuter les tests unitaires et API
	$(DEV_COMPOSE) --profile tools build poker-express-tools
	$(DEV_COMPOSE) --profile tools run --rm poker-express-tools npm test

e2e: ## Exécuter le parcours Playwright
	$(DEV_COMPOSE) --profile e2e build poker-express-e2e
	$(DEV_COMPOSE) --profile e2e run --rm poker-express-e2e

lint: ## Vérifier la qualité du code
	$(DEV_COMPOSE) --profile tools build poker-express-tools
	$(DEV_COMPOSE) --profile tools run --rm poker-express-tools npm run lint

typecheck: ## Vérifier les types TypeScript
	$(DEV_COMPOSE) --profile tools build poker-express-tools
	$(DEV_COMPOSE) --profile tools run --rm poker-express-tools npm run typecheck

build: ## Construire l'application complète
	$(DEV_COMPOSE) build --no-cache poker-express

up: ## Démarrer Poker Express au premier plan
	$(PROD_COMPOSE) up

down: ## Arrêter Poker Express
	$(PROD_COMPOSE) down

restart: ## Redémarrer Poker Express
	$(PROD_COMPOSE) restart

logs: ## Suivre les logs
	$(PROD_COMPOSE) logs -f

shell: ## Ouvrir un shell dans le conteneur
	$(PROD_COMPOSE) exec poker-express sh

prod: ## Télécharger et lancer la dernière image publiée
	$(PROD_COMPOSE) pull
	$(PROD_COMPOSE) up -d

backup: ## Créer une sauvegarde SQLite cohérente
	docker run --rm -v "$(CURDIR):/workspace" alpine:3.20 mkdir -p /workspace/backups
	$(PROD_COMPOSE) exec -T poker-express node dist/backend/server/backup.js /data/poker-express.backup.db
	@$(PROD_COMPOSE) cp poker-express:/data/poker-express.backup.db "$(BACKUP_FILE)"
	@$(PROD_COMPOSE) exec -T poker-express rm -f /data/poker-express.backup.db
	@echo "Sauvegarde créée : $(BACKUP_FILE)"

clean: ## Supprimer les artefacts générés sans toucher aux données
	$(DEV_COMPOSE) --profile dev --profile tools --profile e2e down --remove-orphans
