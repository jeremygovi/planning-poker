# Poker Express

Poker Express est une application de planning poker temps réel, bilingue et auto-hébergée. Elle fournit plusieurs jeux d’estimation, des salles indépendantes, un historique SQLite, des rôles votant/observateur et des réactions en direct.

![Aperçu d’une salle Poker Express avec quatre participants](./docs/poker-express-preview.png)

## Choisir un déploiement

| Cible | Méthode | Stockage |
| --- | --- | --- |
| Serveur Linux, VM ou NAS | Docker Compose | Répertoire local `./data` |
| Kubernetes | Chart Helm | PVC `ReadWriteOnce` |
| AWS | Terraform + EC2 `t3.micro` | Volume gp3 chiffré |
| Poste développeur | Compose de développement | Répertoire local `./data` |

L’image officielle est `jeremygovi/planning-poker`. Utilisez un tag de version, par exemple `1.2.3`, pour un déploiement reproductible. Le tag `latest` suit la dernière release.

## Docker Compose

Prérequis : Docker avec le plugin Compose.

```sh
cp .env.sample .env
mkdir -p data
# Sous Linux, le conteneur non-root (UID 1000) doit pouvoir écrire dans ce dossier.
sudo chown -R 1000:1000 data
docker compose up -d
```

L’application écoute par défaut sur <http://127.0.0.1:3000>. Pour l’exposer derrière un reverse proxy, configurez `.env` :

```dotenv
BIND_ADDRESS=0.0.0.0
PORT=3000
DOCKER_TAG=1.2.3
PUBLIC_ORIGIN=https://poker.example.com
```

Commandes utiles :

```sh
docker compose logs -f
docker compose pull && docker compose up -d
docker compose down
make backup
```

La base SQLite se trouve dans `./data/poker-express.db`. La suppression ou le remplacement du conteneur ne supprime pas ce répertoire.

## Kubernetes avec Helm

Avec une StorageClass par défaut, le PVC créé par le chart provisionne automatiquement son PV :

```sh
helm upgrade --install poker-express ./charts/poker-express \
  --namespace poker-express \
  --create-namespace \
  --set image.tag=1.2.3 \
  --set publicOrigin=https://poker.example.com \
  --set ingress.enabled=true \
  --set ingress.className=nginx \
  --set ingress.hosts[0].host=poker.example.com
```

Le chart crée par défaut un PVC de `1Gi` en `ReadWriteOnce`. Pour réutiliser un claim existant :

```sh
--set persistence.existingClaim=poker-express-data
```

Sur un cluster sans provisionnement dynamique, l’administrateur crée d’abord un PV adapté à l’infrastructure, puis le chart peut lier son PVC à ce volume :

```sh
--set persistence.storageClass=- \
--set persistence.volumeName=poker-express-pv
```

Le chart ne crée pas lui-même de PV : cette ressource est propre au cluster et à son fournisseur de stockage. Un `persistence.selector` peut aussi être fourni dans un fichier de valeurs pour sélectionner un PV statique par labels.

Poker Express doit rester à **un replica** : les sessions et la présence WebSocket sont locales au processus, tandis que SQLite ne doit être monté en écriture que par une instance. Le chart impose cette contrainte et utilise une stratégie de mise à jour `Recreate`. Un HPA ne serait donc pas sûr actuellement ; il faudra d’abord externaliser la base et l’état temps réel partagé.

Un PDB est disponible en option :

```sh
--set podDisruptionBudget.enabled=true
```

Avec `minAvailable: 1`, il protège l’unique pod contre les évictions volontaires, mais ne crée aucune haute disponibilité et peut bloquer un drain de nœud. Il est donc désactivé par défaut. Le chart désactive également le montage automatique du token Kubernetes dans le pod et laisse 30 secondes pour un arrêt propre.

## AWS EC2 avec Terraform

Le module [`terraform`](./terraform) déploie une instance Amazon Linux 2023, installe Docker et exécute l’image comme service `systemd`. Il ne clone pas le dépôt et n’installe pas Node.js. L’administration passe par AWS Systems Manager Session Manager ; aucun port SSH n’est ouvert.

```sh
cd terraform
cp terraform.tfvars.example terraform.tfvars
# Renseigner allowed_cidrs avec les adresses de votre entreprise ou VPN.
terraform init
terraform plan
terraform apply
```

`terraform output application_url` affiche l’URL et `terraform output ssm_start_session_command` la commande d’administration. Les données sont conservées dans `/opt/poker-express/data` sur le volume racine chiffré.

`t3.micro` est la valeur par défaut, mais sa gratuité dépend de l’ancienneté, des crédits et de la région du compte AWS. L’IPv4 publique, le stockage et le trafic peuvent également être facturés : vérifiez le plan Terraform et la tarification AWS avant l’application.

## Développement

Toutes les commandes de développement utilisent [`docker-compose-dev.yaml`](./docker-compose-dev.yaml) :

```sh
cp .env.sample .env
make dev        # Fastify et Vite avec rechargement automatique
make test       # tests unitaires, API, WebSocket et React
make e2e        # parcours Playwright multi-utilisateurs
make lint
make typecheck
make build      # image locale de production
```

Le serveur nécessite Node.js 24 uniquement si les commandes npm sont lancées directement sur l’hôte.

## CI, commits et releases

Chaque pull request exécute :

- Commitlint sur le titre et les commits de la PR ;
- TypeScript, ESLint, tests et build applicatif ;
- tests Playwright ;
- build de l’image de production ;
- validation des fichiers Compose, du chart Helm et de Terraform.

Les messages suivent [Conventional Commits](https://www.conventionalcommits.org/) :

```text
feat: add a new voting deck
fix: preserve room settings after restart
docs: clarify Kubernetes installation
```

Après merge sur `master`, Semantic Release détermine la prochaine version à partir des commits, crée le tag et la GitHub Release, puis publie une image multi-architecture `linux/amd64` et `linux/arm64` sur Docker Hub. Renovate est configuré dans [`renovate.json`](./renovate.json) pour maintenir npm, les images Docker, les GitHub Actions, Helm et Terraform.

## Authentification et sécurité

| Variable | Défaut | Description |
| --- | --- | --- |
| `PORT` | `3000` | Port publié par Compose |
| `BIND_ADDRESS` | `127.0.0.1` | Interface publiée par Compose |
| `DOCKER_IMAGE` | `jeremygovi/planning-poker` | Image à exécuter |
| `DOCKER_TAG` | `latest` | Tag de l’image |
| `PUBLIC_ORIGIN` | vide | Origine publique exacte autorisée |

Poker Express ne gère pas lui-même les identités d’entreprise. Une session applicative associe un navigateur à ses participations, mais **elle n’authentifie pas la personne**. Une instance exposée directement sur Internet serait donc publique.

En production :

- gardez le port applicatif inaccessible depuis Internet ;
- placez l’application derrière HTTPS et un contrôle d’accès (Cloudflare Access, proxy OIDC ou VPN) ;
- transmettez les requêtes HTTP **et** les WebSockets par le même hostname ;
- définissez `PUBLIC_ORIGIN` avec l’origine publique exacte, sans chemin, par exemple `https://poker.example.com`.

Le conteneur s’exécute sans privilèges, avec un système de fichiers racine en lecture seule. Les photos de profil sont redimensionnées côté navigateur, conservées comme Data URL dans le profil local puis dans SQLite pour chaque participation à une salle.

### Solution recommandée : Cloudflare Tunnel et Access

Un [Cloudflare Tunnel](https://developers.cloudflare.com/tunnel/get-started/) publie l’application sans ouvrir de port entrant sur le serveur, tandis que Cloudflare Access contrôle les identités en amont. Le plan Zero Trust Free convient aux équipes de moins de 50 personnes au moment de la rédaction de cette documentation.

1. Dans le tableau de bord Cloudflare, ouvrez **Zero Trust**, créez l’organisation et sélectionnez le plan Free.
2. Dans **Settings → Authentication → Login methods**, ajoutez **One-time PIN**. Cette méthode envoie un code temporaire à l’adresse saisie et ne demande aucun accès administrateur à Azure AD ou Google Workspace.
3. Dans **Access controls → Applications**, ajoutez une application **Self-hosted** couvrant le hostname complet de Poker Express, par exemple `poker.example.com`.
4. Ajoutez une règle **Allow** dont **Include → Emails** contient les adresses exactes des collègues autorisés. Pour une petite équipe connue, cette liste est plus restrictive qu’une règle portant sur tout le domaine de messagerie.
5. Ajoutez **Require → Login methods → One-time PIN** à cette règle et choisissez une durée de session adaptée, par exemple sept jours.
6. Dans **Networking → Tunnels**, créez un tunnel nommé puis une route **Published application** reliant le hostname à `http://127.0.0.1:3000`, ou au nom du service Docker si `cloudflared` partage son réseau. Activez **Protect with Access** sur la route lorsque cette option est proposée. Ne publiez pas en parallèle le port applicatif sur une interface publique.
7. Définissez `PUBLIC_ORIGIN=https://poker.example.com` dans `.env`, redémarrez l’application, puis testez en navigation privée avec une adresse autorisée et une adresse refusée. Vérifiez aussi qu’une salle reçoit bien les mises à jour en temps réel dans deux fenêtres : cela valide le passage des WebSockets.

Une règle **Allow** contenant seulement **Login methods → One-time PIN**, sans liste d’emails ni domaine contrôlé, accepterait n’importe quelle adresse valide : elle ne doit pas être utilisée. Cloudflare documente explicitement cette [configuration dangereuse](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/#common-cloudflare-access-misconfigurations).

Si les emails Cloudflare sont filtrés par la messagerie d’entreprise, autorisez l’expéditeur `noreply@notify.cloudflare.com` ou le domaine `notify.cloudflare.com` selon les procédures internes. Le projet n’embarque pas `cloudflared` et ne stocke pas les identifiants du tunnel.

### Autres architectures possibles

- **Nginx, Traefik ou Caddy + OIDC** : terminez TLS dans le reverse proxy et déléguez l’authentification à un composant tel que `oauth2-proxy`, Authelia ou authentik, connecté à votre fournisseur d’identité. Un reverse proxy HTTPS seul chiffre le trafic mais ne limite pas l’accès.
- **VPN privé** : Tailscale, WireGuard ou le VPN de l’entreprise peuvent réserver l’application aux appareils ou utilisateurs autorisés. Le service ne doit alors écouter que sur l’interface privée ou rester derrière le proxy du VPN.
- **Ingress Kubernetes** : associez l’Ingress à un mécanisme OIDC ou à un proxy d’authentification ; le simple fait d’activer TLS sur l’Ingress ne remplace pas l’authentification.

Quelle que soit la solution, conservez une seule autorité d’accès devant l’application, désactivez tout chemin de contournement vers le port `3000`, protégez les sauvegardes SQLite et testez régulièrement l’accès refusé après révocation d’un utilisateur.

## Structure

- `src/client` : interface React/Vite ;
- `src/server` : API Fastify, WebSocket et SQLite ;
- `migrations` : migrations SQL ;
- `charts/poker-express` : chart Helm et PVC ;
- `terraform` : déploiement EC2 ;
- `.github/workflows` : contrôles de PR et releases ;
- `tests` : tests applicatifs et end-to-end.
