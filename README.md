# BLACKBOX

Caisse noire d'équipe de handball. Voir [SPEC.md](SPEC.md) pour la spécification V1.

## Lancer

Une seule stack, identique en local et sur le Raspberry Pi.

```bash
cp .env.example .env      # une seule fois
docker compose up -d --build
```

- Front : http://localhost:6012
- API : http://localhost:6012/api/health

| Service | Port | Rôle |
|---|---|---|
| `web` | **6012** | Front + relais `/api`. **La seule cible à déclarer dans NPM** |
| `api` | 4012 | Accès direct à l'API, pour diagnostiquer |
| `db` | 5012 | PostgreSQL |

Le Nginx du conteneur `web` sert le front **et** relaie `/api` vers l'API : les
deux partagent la même origine, donc le cookie de session fonctionne sans
configuration CORS. Déclarer le seul port 6012 dans NPM suffit.

⚠ Les ports 4012 et 5012 sont publiés sur toutes les interfaces : l'API et la
base sont joignables depuis tout le réseau local. Pour les réserver à la machine
elle-même, préfixer par `127.0.0.1:` dans `docker-compose.yml`.

### La seule différence entre local et Pi

`NODE_ENV`, dans `.env` :

| | `development` (local) | `production` (Pi) |
|---|---|---|
| Cookie de session | non-`Secure` | `Secure` |
| Logs | lisibles | JSON |
| `npm run seed` | autorisé | refusé |

En local l'app est servie en `http://localhost:6012`, sans TLS : avec
`NODE_ENV=production` le navigateur **refuse** le cookie `Secure` et la
connexion échoue sans message d'erreur. Sur le Pi, NPM termine le TLS et le
navigateur voit du HTTPS, donc `Secure` est correct — et nécessaire.

### Pendant le développement

Il n'y a pas de rechargement à chaud : les images embarquent le code compilé.
Après une modification, reconstruire le service concerné.

```bash
docker compose up -d --build web    # après une modif du front
docker compose up -d --build api    # après une modif de l'API
npm run typecheck                   # sans passer par Docker, instantané
```

## Commandes

| Commande | Effet |
|---|---|
| `npm run up` | Construit et démarre les 3 services |
| `npm run down` | Arrête tout (les données sont conservées) |
| `npm run reset` | **Supprime la base** et repart de zéro |
| `npm run migrate` | Applique les migrations en attente |
| `npm run seed` | **Remplace** les amendes et les participants sans compte par un jeu de démo (17 joueurs, 9 règles, 70 amendes). `NODE_ENV=development` uniquement |
| `npm run psql` | Ouvre un psql sur la base |
| `npm run logs` | Suit les logs des 3 services |
| `npm run typecheck` | Vérifie les types de l'API et du front |

Les migrations sont appliquées automatiquement au démarrage du conteneur `api`.

## Ajouter une migration

Créer `apps/api/migrations/00N_nom.sql`, puis `npm run migrate`.

Un fichier déjà appliqué n'est jamais rejoué. **Ne jamais modifier une
migration commitée** : pour corriger, ajouter un nouveau fichier.

## Déploiement sur le Raspberry Pi

```bash
git pull
docker compose up -d --build
```

Avant le tout premier démarrage, dans `.env` :

```bash
POSTGRES_PASSWORD=<un mot de passe long>
JWT_SECRET=$(openssl rand -hex 32)
NODE_ENV=production
```

Puis **crée ton compte immédiatement** sur `https://ton-domaine/signup` : tant
que la table `users` est vide, le premier venu devient administrateur sans code.
Ensuite, Réglages → Administration pour régénérer le code d'invitation (sa
valeur initiale est `CHANGEME`) et le distribuer à l'équipe.

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
