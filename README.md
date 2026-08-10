# BLACKBOX

Caisse noire d'équipe de handball. Voir [SPEC.md](SPEC.md) pour la spécification V1.

## Lancer en local

```bash
cp .env.example .env      # une seule fois
docker compose up
```

- Front : http://localhost:5173
- API : http://localhost:3000/api/health

Le premier démarrage prend quelques minutes (`npm install` dans les conteneurs).
Les dépendances sont ensuite mises en cache dans des volumes Docker, les
démarrages suivants sont quasi instantanés.

Le hot reload fonctionne : modifier un fichier dans `apps/` recharge
automatiquement l'API (tsx watch) ou le front (Vite HMR).

## Commandes

| Commande | Effet |
|---|---|
| `npm run up` | Démarre les 3 services |
| `npm run down` | Arrête tout (les données sont conservées) |
| `npm run reset` | **Supprime la base** et repart de zéro |
| `npm run migrate` | Applique les migrations en attente |
| `npm run seed` | **Remplace** les amendes et les participants sans compte par un jeu de démo (17 joueurs, 9 règles, 70 amendes). Dev uniquement |
| `npm run deps` | Réinstalle les dépendances après un ajout dans un `package.json` |
| `npm run psql` | Ouvre un psql sur la base |
| `npm run logs` | Suit les logs de l'API |

Les migrations sont aussi appliquées automatiquement au démarrage du conteneur
`api`, donc `npm run migrate` ne sert qu'à les rejouer sans redémarrer.

## Services

| Service | Port | Rôle |
|---|---|---|
| `db` | *(non publié)* | PostgreSQL 16. Joignable uniquement depuis le réseau Docker |
| `api` | 3000 | Fastify, toutes les routes sous `/api` |
| `web` | 5173 | Vite en dev, avec proxy `/api` → `api:3000` |
| `install` | — | Service éphémère : installe les dépendances puis se termine |

`api` et `web` partagent le même `/app/node_modules` (npm workspaces hoiste tout
à la racine). C'est pour ça que l'installation est isolée dans le service
`install` : deux `npm install` concurrents sur le même volume corrompent l'arbre
de dépendances. Après avoir ajouté un paquet dans un `package.json`, lance
`npm run deps`.

Les routes sont sous `/api` en dev **comme** en prod : le proxy Vite et le
Nginx Proxy Manager pointent sur le même chemin, il n'y a rien à réécrire.

## Ajouter une migration

Créer `apps/api/migrations/00N_nom.sql`, puis `npm run migrate`.

Un fichier déjà appliqué n'est jamais rejoué. **Ne jamais modifier une
migration commitée** : pour corriger, ajouter un nouveau fichier.

## Déploiement sur le Raspberry Pi

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

| Service | Port hôte | Rôle |
|---|---|---|
| `web` | **6012** | Front + relais `/api`. **La seule cible à déclarer dans NPM** |
| `api` | 4012 | Accès direct à l'API, pour diagnostiquer |
| `db` | 5012 | PostgreSQL |

Le Nginx du conteneur `web` sert le front **et** relaie `/api` vers l'API : les
deux partagent donc la même origine, et le cookie de session fonctionne sans
configuration CORS. Déclarer le seul port 6012 dans NPM suffit à faire tourner
l'application.

⚠ Les ports 4012 et 5012 sont publiés sur toutes les interfaces : l'API et la
base sont joignables depuis tout le réseau local. Pour les réserver au Pi
lui-même, préfixer par `127.0.0.1:` dans `docker-compose.prod.yml`.

Avant le premier démarrage, dans `.env` :

```bash
POSTGRES_PASSWORD=<un mot de passe long>
JWT_SECRET=$(openssl rand -hex 32)
```

Puis **crée ton compte immédiatement** sur `https://ton-domaine/signup`
(ou `http://<ip-du-pi>:6012/signup`) : tant que
la table `users` est vide, le premier venu devient administrateur sans code.
Ensuite, va dans Réglages → Administration régénérer le code d'invitation
(sa valeur initiale est `CHANGEME`) et distribue-le à l'équipe.

Les images se construisent plus vite sur ton PC que sur le Pi :

```bash
docker buildx build --platform linux/arm/v7 -f apps/api/Dockerfile -t blackbox-api .
docker buildx build --platform linux/arm/v7 -f apps/web/Dockerfile -t blackbox-web .
```

## Avancement

- [x] **1.** Plomberie : Docker, Postgres, migrations, `/api/health`, thème MUI
- [x] **2.** Auth : signup, login, cookie JWT, `/me`, claim d'un membre
- [x] **3.** Membres et rôles
- [x] **4.** Règles (CRUD)
- [x] **5.** Écran d'ajout d'amende
- [x] **6.** Fil d'activité, paiements, filtres
- [x] **7.** Classement, fiche membre, réglages, admin
- [x] **8.** Dockerfiles de prod et déploiement Pi

V1 complète. Les évolutions repoussées sont listées dans [SPEC.md](SPEC.md) §8.
