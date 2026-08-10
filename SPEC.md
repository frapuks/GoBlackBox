# BLACKBOX — Spécification V1

App de « caisse noire » pour une équipe de handball. On suit les amendes des
joueurs tout au long de la saison. **Aucun argent n'est géré dans l'app.**

- Nom affiché : **BLACKBOX** — nom du dépôt : `GoBlackBox`
- **Mono-caisse** : une seule caisse, celle de l'équipe. Pas de multi-tenant.
- Mobile-first, dark only.

---

## 1. Stack

| Couche | Choix |
|---|---|
| Front | Vite + React + MUI + TanStack Query + React Router |
| Back | Fastify + Zod + `@fastify/jwt` + `@fastify/cookie` |
| Base | PostgreSQL 16 — **SQL brut** via `pg`, pas d'ORM |
| Repo | Monorepo npm workspaces : `apps/web`, `apps/api`, `packages/shared` |
| Déploiement | 3 services Docker sur Raspberry Pi. Cloudflare + NPM en amont (hors périmètre) |

### Arborescence

```
GoBlackBox/
├─ docker-compose.yml
├─ package.json                 # npm workspaces
├─ packages/shared/
│   └─ src/schemas.ts           # Zod : inputs API + types de rows
├─ apps/api/
│   ├─ Dockerfile
│   ├─ migrations/NNN_*.sql
│   └─ src/
│       ├─ server.ts
│       ├─ db.ts                # pool pg + helper query()
│       ├─ migrate.ts           # runner de migrations
│       ├─ auth.ts              # hash, jwt, hooks preHandler
│       └─ routes/{auth,members,rules,fines,settings}.ts
└─ apps/web/
    ├─ Dockerfile
    ├─ nginx.conf
    └─ src/{pages,components,api,theme}/
```

### Docker

```yaml
services:
  db:   postgres:16-alpine   # volume nommé, AUCUN port exposé sur l'hôte
  api:  node:22-alpine       # Fastify, port 3000
  web:  nginx:alpine         # build Vite statique, port 80
```

- Build context = **racine du repo** (sinon `packages/shared` est invisible).
- `healthcheck` sur `db` + `depends_on: service_healthy` sur `api`.
- Le nginx du conteneur `web` fait uniquement : servir les fichiers + fallback
  SPA vers `index.html`. Pas de TLS, pas de routing métier — c'est le rôle du NPM.
- Front buildé avec `VITE_API_URL=/api` (relatif) → rien à injecter au runtime.
- Images cross-buildées depuis le PC (`docker buildx`), pas sur le Pi.

### Règles SQL brut

1. Toujours des requêtes paramétrées `$1, $2`. **Jamais** de concaténation.
2. Jamais de `SELECT *` — colonnes explicites, sinon les types TS mentent.
3. Migrations : fichiers `NNN_nom.sql` numérotés, **jamais modifiés après commit**.
   Runner minimal (table `_migrations`), lancé par `npm run migrate`,
   **pas** au démarrage du serveur.

---

## 2. Modèle de données

```sql
users     id, email, password_hash, role, created_at
          role ∈ ('ADMIN','MANAGER','PLAYER')

members   id, display_name, user_id (nullable, unique)
          -- user_id NULL = participant « fantôme », créé par un gestionnaire
          -- un participant est défini par son seul nom : pas de poste

rules     id, label, description, amount, archived_at,
          kind ∈ ('FINE','DUES','PENALTY')
          -- FINE    : infraction, donnée à des fautifs choisis
          -- DUES    : cotisation, appliquée à toute l'équipe
          -- PENALTY : pénalité, appliquée aux seuls retardataires
          CHECK (amount >= 0)

fines     id, member_id, rule_id, amount, label,
          created_by, created_at, paid_at

settings  id = 1 (CHECK), invite_code,
          late_after_days INTEGER NOT NULL DEFAULT 7 CHECK (> 0)
          -- pas de notion de saison dans l'app
```

### Décisions structurantes

- **`members` est le pivot, pas `users`.** Un fantôme est un `member` sans
  `user_id`. Quand la personne s'inscrit, on remplit `user_id` — aucune
  migration de données.
- **`users.name` n'existe pas** : `members.display_name` fait foi partout.
- **`fines` copie `amount` et `label`** depuis la règle à la création.
  Modifier une règle ne réécrit jamais l'historique.
- **Les règles s'archivent** (`archived_at`), ne se suppriment jamais.
- **Montants = euros entiers.** Pas de centimes, pas de decimal, pas de float.
- **`amount = 0` est valide** et s'affiche « 0 € ». La sanction réelle
  (tournée, pack de bières) se décrit dans la description de la règle.
- **Une cotisation ou une pénalité est une règle**, pas une seconde table :
  elle produit la même chose au final, une ligne dans `fines` avec son montant
  et son paiement à cocher. Seule sa *nature* diffère, d'où la colonne `kind`.
- **La cible d'une application se déduit de `kind` côté serveur**, elle n'est
  jamais envoyée par le client : un front pas à jour ne peut pas débiter les
  mauvaises personnes.

### Champs calculés (jamais stockés)

```sql
-- amende impayée en retard
paid_at IS NULL
AND (created_at AT TIME ZONE 'Europe/Paris')::date + late_after_days <= CURRENT_DATE
AS is_late
```

Bascule à **minuit** le 7ᵉ jour : amende du lundi → en retard le lundi suivant.
Le `AT TIME ZONE` est nécessaire, sinon une amende saisie à 23 h en été bascule
un jour trop tard. Calculé **côté serveur** — jamais dans le front, sinon le
statut dépend de l'horloge du téléphone.

Changer `late_after_days` reclasse instantanément tout l'historique. C'est voulu.

---

## 3. Rôles

| | ADMIN | MANAGER | PLAYER |
|---|:---:|:---:|:---:|
| Voir amendes, règles, classement | ✅ | ✅ | ✅ |
| Ajouter une amende | ✅ | ✅ | ❌ |
| Cocher payé | ✅ | ✅ | ❌ |
| Supprimer une amende | ✅ | ✅ | ❌ |
| Créer / archiver une règle ou une cotisation | ✅ | ✅ | ❌ |
| Appliquer une cotisation / une pénalité | ✅ | ✅ | ❌ |
| Créer / renommer un membre | ✅ | ✅ | ❌ |
| Modifier `late_after_days` | ✅ | ❌ | ❌ |
| Donner / retirer le rôle MANAGER | ✅ | ❌ | ❌ |
| Régénérer le code d'invitation | ✅ | ❌ | ❌ |

ADMIN est **unique et non transférable** en V1.

Un joueur **ne peut jamais** cocher ses propres amendes comme payées.

```ts
const requireRole = (...roles: Role[]) => async (req) => {
  if (!roles.includes(req.user.role)) throw fastify.httpErrors.forbidden()
}
```

### Amorçage

- Table `users` vide → le premier signup crée l'**ADMIN**, sans code.
- Ensuite → tout signup exige le code d'invitation valide.

⚠️ Créer le compte admin **immédiatement** après le premier `docker compose up`.

Signup en 2 temps : (email + mot de passe + code) → « qui es-tu ? » : liste des
membres non réclamés, ou création d'un nouveau membre.

Auth par JWT en cookie `httpOnly` + `SameSite=Lax`.

---

## 4. API

```
POST   /auth/signup           { email, password, inviteCode? }
POST   /auth/login
POST   /auth/logout
GET    /auth/me
GET    /auth/claimable        membres non réclamés
POST   /auth/claim            { memberId } | { displayName }

GET    /dashboard             classement : membres + totaux
GET    /members
POST   /members               admin/manager
GET    /members/:id           (`/members/me` = même payload)
PATCH  /members/:id           renommer
PATCH  /users/:id/role        admin

GET    /rules
POST   /rules                 admin/manager — { label, description?, amount, kind }
PATCH  /rules/:id             édition / archivage — admin/manager
POST   /rules/:id/apply       admin/manager — DUES : tous les membres
                                              PENALTY : les seuls retardataires
                                              FINE : refusé (400)

GET    /fines                 ?unpaid=1&memberId=
POST   /fines                 admin/manager — { memberIds[], ruleId }, un lot en une transaction
DELETE /fines/:id             admin/manager
PATCH  /fines/:id/paid        admin/manager

PATCH  /me                    displayName, mot de passe
GET    /settings              tous  → { lateAfterDays }
                              admin → + { inviteCode }
PATCH  /settings              admin
```

Le `inviteCode` ne doit **jamais** partir dans une réponse lue par un joueur.

---

## 5. Pages

Barre de navigation basse, 4 onglets : **Classement · Fil · Règles · Moi**
FAB `+` flottant sur Classement et Fil (admin/manager uniquement).

### Hors connexion

| Route | Page |
|---|---|
| `/login` | Connexion — email, mot de passe |
| `/signup` | Inscription — email, mot de passe, code (masqué si premier compte) |
| `/signup/claim` | « Qui es-tu ? » — membres non réclamés en gros boutons |

### Onglets

| Route | Page | Contenu |
|---|---|---|
| `/` | **Classement** | Cagnotte totale en gros. Liste des membres triés par montant dû décroissant : rang, initiales, nom, dû, payé, badge « en retard ». Ligne estompée si tout payé. Tap → fiche membre |
| `/fines` | **Fil d'activité** | Antéchronologique. `Nom · règle · montant · il y a X`. Checkbox payé à droite (admin/manager). Lignes payées grisées et barrées. Filtres : `Impayées` + par joueur |
| `/rules` | **Règles** | Deux sections. **La caisse** : sous-section *Retard* — délai (éditable par l'admin) et pénalités, avec leur bouton « Appliquer aux N retardataires » ; sous-section *Cotisations* — bouton « Appliquer aux N membres ». Chaque carte affiche sa date de dernière application. **Règles** : les infractions, `libellé · description · montant`. Création et archivage pour admin/manager, archivées masquées derrière un toggle |
| `/me` | **Moi** | Mon solde en gros. Mes amendes, impayées d'abord, avec badge de statut **non cliquable**. Lien discret `Réglages` en bas |

### Pages secondaires

| Route | Page |
|---|---|
| `/fines/new` | **Ajouter une amende** — plein écran, 2 étapes. Étape 1 : grille de cartes joueurs, **sélection multiple** + « tout sélectionner », barre d'action fixe en bas. Étape 2 : liste de cartes règles (libellé + description + montant), appliquée à tout le lot. Validation → retour au fil + snackbar « annuler » 10 s qui annule le lot entier. **Zéro clavier.** |
| `/members/:id` | Fiche membre — lecture seule. Même composant que `/me` |
| `/me/settings` | Réglages — nom, mot de passe, déconnexion. Si ADMIN, la même page contient en plus : code d'invitation (+ régénération), création de participants, gestion des rôles |

---

## 6. Design system

Dark only. Pas de mode clair en V1.

### Palette

| Rôle | Hex | Usage |
|---|---|---|
| Accent principal | `#F97316` | FAB, bouton primaire, onglet actif |
| Accent secondaire | `#FACC15` | Montants à payer, 3ᵉ place du podium |
| Danger | `#EF4444` | Montants élevés, 1ʳᵉ place, badge EN RETARD |
| Fond page | `#0B0E11` | |
| Surface carte | `#1C1F24` | |
| Fond dialogue | `#0F172A` | |
| Texte principal | `#F8FAFC` | |
| Texte secondaire | `#94A3B8` | |

### Typographie

Self-hébergée via `@fontsource/*` — pas d'appel à Google Fonts.

| Famille | Rôle |
|---|---|
| **Bebas Neue** | Titres de section en capitales (`CLASSEMENT`, `MES AMENDES`), gros chiffres |
| **Archivo Narrow** | Labels, badges, navigation — en capitales |
| **Inter** | Corps de texte, tout le reste |

### Couleur des montants

La couleur reflète **uniquement l'état de l'amende**, jamais sa valeur.

```
à payer   → jaune   #FACC15
en retard → rouge   #EF4444
payée     → gris    #94A3B8, barré
```

Le tarif d'une règle n'a pas d'état de paiement mais s'affiche en « à payer » :
une seule couleur pour « de l'argent à sortir » dans toute l'app.

### Espacements

Tous les écrans partagent la même marge haute et latérale, zones sûres
comprises (`env(safe-area-inset-*)`), y compris `/fines/new` qui vit hors
du layout à onglets.

---

## 7. Ordre de construction

1. `docker-compose` + `001_init.sql` + `/health` qui ping la base
   → **valider toute la plomberie avant d'écrire du métier**
2. Auth (signup, login, cookie JWT, `/me`, claim)
3. Membres + rôles
4. Règles CRUD
5. **Écran d'ajout d'amende** — le cœur
6. Fil d'activité + checkbox payé + filtres
7. Classement, fiche membre, réglages, admin
8. Dockerfiles de prod + déploiement Pi

---

## 8. Hors périmètre V1 → V2

Amende personnalisée (montant libre) · cotisations **automatiques** (échéancier,
rappels) · poste des joueurs · saisons ·
photos de profil · mot de passe oublié par email · notifications push · export CSV/PDF · contestation d'amende ·
statistiques et graphiques · PWA offline · historique d'audit ·
amendes récurrentes · paiement en ligne · mode clair ·
transfert du rôle ADMIN
