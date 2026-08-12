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

## La base de données

Les données vivent dans un volume Docker nommé **`blackbox_pgdata`**, figé dans
`docker-compose.yml`. Il ne dépend pas du nom du projet ni du dossier : renommer
l'un ou l'autre ne fait plus repartir sur une base vide.

`docker compose down` conserve le volume. **Seul `down -v` le supprime** — et
`npm run reset` l'appelle. À ne jamais lancer sur le Pi.

### Sauvegarde automatique avant migration

Le runner de migrations fait un `pg_dump` complet **avant** d'appliquer quoi que
ce soit, dans `./backups/` (bind-mount, donc récupérable sans passer par Docker).

```
[migrate] sauvegarde : /backups/blackbox-2026-08-12T17-00-11-avant-007_….sql
[migrate] ✓ 007_fines_rule_id_index.sql
```

Trois comportements à connaître :

- **Rien à migrer, rien à sauvegarder.** Un redémarrage sans migration en
  attente ne produit aucun fichier.
- **Première installation exemptée** : une base neuve n'a rien à protéger.
- **Un `pg_dump` en échec interrompt la migration**, et donc le démarrage de
  l'API. C'est voulu : migrer sans filet est précisément ce qu'on évite. Cause
  la plus probable sur le Pi, un disque plein.

Les **10 dernières** sauvegardes sont conservées, les plus anciennes supprimées
automatiquement. L'horodatage étant en tête du nom, l'ordre alphabétique est
l'ordre chronologique.

Si le conteneur ne peut pas écrire dans `./backups/` :

```bash
sudo chown -R 1000:1000 backups
```

### Sauvegarder à la main

```bash
docker compose exec -T db pg_dump -U blackbox blackbox > blackbox-$(date +%F).sql
```

### Restaurer

```bash
cat backups/blackbox-2026-08-12T17-00-11-avant-007_….sql   | docker compose exec -T db psql -U blackbox -d blackbox
```

Vérifie d'abord sur une base jetable si le doute existe :

```bash
docker compose exec -T db psql -U blackbox -d postgres -c 'CREATE DATABASE verif'
cat backups/….sql | docker compose exec -T db psql -U blackbox -d verif
docker compose exec -T db psql -U blackbox -d verif -c 'SELECT count(*) FROM fines'
docker compose exec -T db psql -U blackbox -d postgres -c 'DROP DATABASE verif'
```

### Identifier le volume qui contient les données

Stack arrêtée — deux Postgres sur le même volume le corrompraient :

```bash
docker compose down

check() {
  docker run --rm -d --name pgcheck -v "$1":/var/lib/postgresql/data \
    -e POSTGRES_PASSWORD=x postgres:16-alpine >/dev/null
  sleep 6
  echo "-- $1"
  docker exec pgcheck psql -U blackbox -d blackbox -c \
    "SELECT (SELECT count(*) FROM users) comptes,
            (SELECT count(*) FROM members) membres,
            (SELECT count(*) FROM rules) regles,
            (SELECT count(*) FROM fines) amendes;"
  docker rm -f pgcheck >/dev/null
}

docker volume ls | grep pgdata      # lister les candidats
check ancien_volume_pgdata
check blackbox_pgdata
```

### Récupérer un volume portant un autre nom

⚠ **Ne jamais copier par-dessus un volume Postgres non vide** : mélanger deux
répertoires de données donne une base corrompue. On repart d'un volume vide, et
rien n'est détruit avant d'en avoir fait une copie.

```bash
docker compose down

# filet de sécurité : l'actuel est mis de côté
docker run --rm -v blackbox_pgdata:/from -v blackbox_pgdata_old:/to \
  alpine sh -c 'cd /from && cp -a . /to'

docker volume rm blackbox_pgdata

# on y recopie les vraies données
docker run --rm -v ANCIEN_VOLUME:/from -v blackbox_pgdata:/to \
  alpine sh -c 'cd /from && cp -a . /to'

docker compose up -d --build
```

Le volume source n'est jamais touché, et l'ancien contenu reste dans
`blackbox_pgdata_old`. Supprimer les deux une fois la vérification faite.

## Déploiement sur le Raspberry Pi

```bash
git pull
docker compose up -d --build
```

⚠ **Avant le premier déploiement suivant une mise à jour du `docker-compose.yml`**,
vérifie que le volume attendu est bien celui qui contient les données :

```bash
docker volume ls | grep pgdata
```

S'il n'affiche pas `blackbox_pgdata`, applique la procédure de récupération
ci-dessus **avant** de démarrer, sinon l'app repartira sur une base vide.

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
