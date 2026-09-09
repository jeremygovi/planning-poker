# Poker Express

Poker Express est un planning poker temps réel, auto-hébergé et ferroviaire. Les votes restent secrets jusqu’au signal de révélation, les résultats et leurs votes nominatifs sont conservés dans SQLite, et plusieurs salles peuvent circuler en parallèle sans partager leur état.

L’application propose un thème clair et bleu par défaut — **Table Agile** — ainsi que trois univers originaux : **Train du Sprint**, **Quai 8** et **Turbo TGV**. Tous les visuels sont originaux, sans logo ni personnage propriétaire. L’interface est responsive, bilingue français/anglais, utilisable au clavier et respecte `prefers-reduced-motion`.

![Aperçu d’une salle Poker Express avec quatre participants](./docs/poker-express-preview.png)

## Démarrage rapide

Il faut uniquement Docker avec Docker Compose, et éventuellement `make`. **Aucune installation de Node.js ou commande npm sur l’hôte n’est nécessaire.**

1. Créez la configuration locale :

   ```sh
   cp .env.sample .env
   ```

2. Remplacez le jeton d’exemple par un secret aléatoire d’au moins 16 caractères (32 ou plus recommandés) :

   ```dotenv
   ACCESS_TOKEN=un-jeton-equipe-aleatoire-de-32-caracteres
   PORT=3000
   ```

3. Construisez et démarrez :

   ```sh
   make prod
   ```

4. Ouvrez <http://127.0.0.1:3000>.

Sans jeton dans l’URL, l’application le demande à l’arrivée. Toute personne authentifiée peut créer une salle. Chaque personne configure ensuite une seule fois son profil dans son navigateur : nom, avatar illustré ou photo personnelle. Ce profil est réutilisé dans toutes les salles et reste modifiable depuis l’en-tête.

Chaque participant d’une salle peut en modifier les réglages, piloter les manches, la partager, l’archiver et la restaurer. Le rôle choisi à l’entrée sert uniquement à participer au vote ou à observer. L’invitation mène directement à la salle et embarque le jeton dans le fragment `#token=…`, puis l’application l’efface de la barre d’adresse dès qu’il a été consommé. Le navigateur mémorise aussi localement un jeton de reprise propre au participant afin de retrouver son appartenance après un redémarrage du serveur.

## Commandes Docker

Toutes les commandes Node sont exécutées dans un conteneur :

| Commande | Usage |
| --- | --- |
| `make install` | Construit l’image d’outillage et ses dépendances verrouillées |
| `make dev` | Lance Fastify et Vite avec rechargement automatique |
| `make test` | Lance les tests unitaires, API, WebSocket et React |
| `make e2e` | Lance le parcours Playwright multi-utilisateurs dans Chromium |
| `make lint` | Lance ESLint |
| `make typecheck` | Vérifie le client et le serveur TypeScript |
| `make build` | Construit l’image de production |
| `make up` / `make down` | Démarre / arrête la production |
| `make logs` | Suit les journaux du conteneur |
| `make shell` | Ouvre un shell dans le conteneur applicatif |
| `make backup` | Produit une sauvegarde SQLite cohérente dans `./backups` |
| `make clean` | Arrête les conteneurs de travail sans toucher à `./data` |

Les équivalents `docker compose` sont visibles dans le [Makefile](./Makefile). Le lockfile est consommé avec `npm ci` uniquement pendant la construction des images.

## Déroulement d’une estimation

Une salle contient au plus une user story active. N’importe quel participant peut choisir pour la salle le jeu Fibonacci, Scrum, puissances de deux ou T-shirt ; ce réglage persiste entre les estimations et reste modifiable lorsqu’aucune manche n’est en cours. Pour lancer une manche, il suffit de saisir un titre libre. Si ce titre contient une URL HTTP(S), l’application la détecte et la rend cliquable.

Les participants et leurs cartes restent visibles autour d’une table de poker pendant tout le vote. Une carte grise passe au vert dès qu’un votant a choisi ; au reveal, les mêmes cartes se retournent pour afficher uniquement leur valeur. Les spectateurs ne sont ni comptés parmi les votants, ni autorisés à poser une carte, et leur emplacement porte explicitement la mention `SPEC.`. Avant la révélation, le serveur ne diffuse que l’état « a voté » — jamais la valeur.

Le profil propose douze avatars SVG originaux ou une photo personnelle. La photo est recadrée, redimensionnée et compressée côté navigateur avant d’être partagée dans les salles ; aucun média externe n’est chargé. Lorsque le son global est activé, des signaux Web Audio procéduraux accompagnent la nouvelle story, la pose d’une carte, la révélation, le départ et la fin du minuteur, la décision finale et le consensus.

La carte neutre est toujours stockée comme `abstain`, mais devient Banane, Café ou Joker selon le thème. Elle est exclue du consensus et des calculs. À la révélation :

- une valeur strictement majoritaire est suggérée ;
- une égalité numérique produit une moyenne à deux décimales ;
- T-shirt utilise la médiane ordonnée, taille supérieure pour une paire centrale ;
- uniquement des cartes neutres ne produit aucune suggestion ;
- au moins deux votes non neutres identiques déclenchent l’animation de consensus si le son de la salle est actif.

La suggestion reste indicative : n’importe quel participant peut valider une valeur finale libre. Titre, instantané du jeu de la salle, votes révélés, suggestion, valeur finale et horodatages rejoignent alors l’historique.

## Persistance et sauvegarde

Compose monte `./data:/data`. La base se trouve dans `./data/poker-express.db` et utilise WAL, les clés étrangères et un délai d’attente en cas de concurrence. Remplacer ou reconstruire le conteneur ne supprime donc ni les salles ni les estimations.

`make backup` utilise l’API de sauvegarde SQLite depuis le conteneur avant de copier le fichier dans `./backups`. Le nettoyage ne supprime jamais `./data`.

Pour vérifier manuellement la persistance :

```sh
make prod
# créer une salle et finaliser une estimation
docker compose down
docker compose up -d
```

## Sécurité et exposition

- sessions aléatoires en mémoire, cookies `HttpOnly`, `SameSite=Strict`, durée de sept jours ;
- un seul `ACCESS_TOKEN` partagé, comparé en temps constant, et limitation des échecs de connexion par IP ;
- jetons de reprise individuels aléatoires, stockés hachés dans SQLite et conservés dans le navigateur ;
- attribut `Secure` automatiquement ajouté lorsque Fastify voit HTTPS ou `X-Forwarded-Proto: https` ;
- contrôle d’origine sur les mutations REST et les WebSockets ;
- validation TypeBox, CSP restrictive, HSTS derrière HTTPS et en-têtes de durcissement ;
- processus Node non-root, `no-new-privileges`, `init` et healthcheck ;
- publication Compose limitée par défaut à `127.0.0.1`.

Le lien d’invitation est un lien porteur : toute personne qui le possède peut accéder à l’application. Le fragment `#token` n’est pas envoyé au serveur avec la requête HTTP et évite donc les journaux HTTP ou l’en-tête `Referer`, mais il reste visible dans les presse-papiers et historiques locaux. Partagez-le sur un canal de confiance et renouvelez `ACCESS_TOKEN` s’il a fuité. Pour une exposition Internet, ajoutez une couche d’accès comme Cloudflare Access.

Pour une origine publique fixe, ajoutez par exemple `PUBLIC_ORIGIN=https://poker.example.com` dans `.env`. Elle doit correspondre exactement à l’origine vue par le navigateur.

## Cloudflare Tunnel et Access

Le projet n’embarque ni `cloudflared`, ni token. Un tunnel ponctuel peut être lancé dans un conteneur séparé, sur un réseau capable d’atteindre Poker Express :

```sh
docker run --rm --network host cloudflare/cloudflared:latest tunnel --no-autoupdate --url http://127.0.0.1:3000
```

Sur Docker Desktop, remplacez l’URL par `http://host.docker.internal:3000` si le mode réseau hôte n’est pas disponible. Pour un tunnel nommé, créez-le dans le tableau de bord Cloudflare, protégez son hostname avec Cloudflare Access et conservez le token hors du dépôt. Les WebSockets sont pris en charge par Tunnel ; configurez ensuite `PUBLIC_ORIGIN` avec l’URL HTTPS exacte.

## Architecture

- `src/shared` : contrats métier, jeux et schémas partagés ;
- `src/server` : serveur Fastify autoritaire, sessions, SQLite, commandes REST et diffusion WebSocket ;
- `src/client` : SPA React/Vite, thèmes, SVG originaux, animations et sons Web Audio procéduraux ;
- `migrations` : migrations SQL versionnées, appliquées transactionnellement ;
- `tests` : règles d’estimation, API, temps réel, React et Playwright ;
- `data` : montage persistant, ignoré par Git à l’exception de `.gitkeep`.

La V1 vise une seule instance applicative. Les sessions et la présence sont en mémoire ; les salles, participants, manches, votes et historiques sont persistants. Il n’y a ni jeu personnalisé, ni récupération du contenu de la user story, ni intégration Jira/GitLab, ni suppression définitive depuis l’interface.
