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

**Un seul `docker-compose.yml`**, identique en local et sur le Pi.

```yaml
services:
  db:   postgres:16-alpine   # volume nommé, publié sur 5012
  api:  build apps/api       # Fastify, publié sur 4012
  web:  build apps/web       # nginx + build Vite, publié sur 6012
```

Seule différence entre les deux environnements : `NODE_ENV`, dans `.env`.
Il pilote le drapeau `Secure` du cookie de session (impossible en
`http://localhost`), le format des logs et l'autorisation du seed.

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
users     id, email, password_hash, role, created_at,
          must_change_password, token_version   -- voir § 14
          role ∈ ('ADMIN','MANAGER','PLAYER')

members   id, display_name, user_id (nullable, unique), receives_fines
          -- user_id NULL = participant « fantôme », créé par un gestionnaire
          -- un participant est défini par son seul nom : pas de poste
          -- receives_fines FALSE = non amendable (voir § 13). Axe distinct du
          -- rôle : un gestionnaire qui joue reste amendable

rules     id, label, description, amount, archived_at,
          context ∈ ('MATCH','TRAINING','OTHER')  -- où la règle s'applique
          kind ∈ ('FINE','DUES','PENALTY')
          -- FINE    : infraction, donnée à des fautifs choisis
          -- DUES    : cotisation, appliquée à toute l'équipe
          -- PENALTY : pénalité, appliquée aux seuls retardataires
          CHECK (amount >= 0)

fines     id, member_id, rule_id, amount, label,
          created_by, created_at, paid_at

settings  id = 1 (CHECK), invite_code,
          allow_player_reports, enable_penalties, enable_dues,
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
- **Les paliers portent le montant à la place de la règle.** Une règle a soit
  un montant unique, soit des paliers — jamais les deux. L'amende exige alors
  un `tierId`, et son libellé devient `Retard · 5 à 10 min`.
- **Les amendes ne référencent pas le palier**, elles en copient le montant et
  le libellé. Réorganiser ou supprimer des paliers ne réécrit donc jamais
  l'historique et ne laisse aucune amende orpheline.
- **Le contexte est porté par la règle, pas par l'amende.** Une règle
  appartient à exactement un contexte ; l'amende créée n'en garde pas trace, au
  même titre qu'elle ne garde pas la description. Changer le contexte d'une
  règle ne réécrit donc rien.
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
| Modifier `late_after_days` | ✅ | ✅ | ❌ |
| Voir et copier le code d invitation | ✅ | ✅ | ❌ |
| **Ajouter** un participant | ✅ | ❌ | ❌ |
| **Régénérer** le code d invitation | ✅ | ❌ | ❌ |
| Donner / retirer le rôle MANAGER | ✅ | ❌ | ❌ |
| Renommer un participant | ✅ | ❌ | ❌ |
| Rendre un participant amendable ou non | ✅ | ❌ | ❌ |
| Détacher un compte de son participant | ✅ | ❌ | ❌ |
| Réinitialiser le mot de passe d un autre compte | ✅ | ❌ | ❌ |
| Activer une fonctionnalité (pénalités, cotisations, signalements) | ✅ | ❌ | ❌ |

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
POST   /members               admin
GET    /members/:id           (`/members/me` = même payload)
PATCH  /members/:id           renommer, amendable ou non — admin
POST   /members/:id/unlink    admin — détache le compte du participant
PATCH  /users/:id/role        admin
POST   /users/:id/reset-password  admin — renvoie le mot de passe temporaire

GET    /rules
POST   /rules                 admin/manager — { label, description?, amount, kind }
PATCH  /rules/:id             édition / archivage — admin/manager
POST   /rules/:id/apply       admin/manager — DUES : tous les membres
                                              PENALTY : les seuls retardataires
                                              FINE : refusé (400)

GET    /fines                 ?unpaid=1&memberId=
POST   /fines                 admin/manager — { memberIds[], ruleId, tierId? }
                              un lot en une transaction. tierId obligatoire si
                              la règle a des paliers, refusé sinon
DELETE /fines/:id             admin/manager
PATCH  /fines/:id/paid        admin/manager

PATCH  /me                    displayName, mot de passe
GET    /settings              tous  → { lateAfterDays }
                              admin → + { inviteCode }
PATCH  /settings              admin/manager — lateAfterDays
PATCH  /settings/features     admin — pénalités, cotisations, signalements
POST   /settings/invite-code  admin — renouvelle le code
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
| `/rules` | **Règles** | Deux sections. Trois sections, chacune avec son bouton « Ajouter » à droite du titre. **Retard de paiement** : le délai en jours (éditable par l'admin) puis les pénalités, avec leur bouton « Appliquer aux N retardataires ». **Cotisation** : bouton « Appliquer aux N membres ». **Règles** : les infractions, regroupées par contexte (Match / Entraînement / Autres). Le formulaire permet d'ajouter des paliers ; le champ « montant » disparaît dès qu'il y en a un. Les cartes d'application affichent leur date de dernière application. **Règles** : les infractions, `libellé · description · montant`. Création et archivage pour admin/manager, archivées masquées derrière un toggle |
| `/me` | **Moi** | Mon solde en gros. Mes amendes, impayées d'abord, avec badge de statut **non cliquable**. Lien discret `Réglages` en bas |

### Pages secondaires

| Route | Page |
|---|---|
| `/fines/new` | **Ajouter une amende** — plein écran, 3 étapes. Étape 1 : grille de cartes joueurs, **sélection multiple** + « tout sélectionner », barre d'action fixe en bas. Étape 2 : le **contexte** (Match / Entraînement / Autres), qui détermine les règles proposées. Étape 3 : les règles du contexte choisi, appliquées à tout le lot. Une règle à paliers s'affiche comme **une carte unique** portant la fourchette (« Retard 2 – 15 € ») et se déplie sur ses paliers. Validation → retour au fil + snackbar « annuler » 10 s qui annule le lot entier. **Zéro clavier.** |
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

Amende personnalisée (montant libre) · cotisations **automatiques** (échéancier)
· poste des joueurs · saisons · photos de profil · mot de passe oublié par
email · export CSV/PDF · contestation d'amende · statistiques et graphiques ·
historique d'audit · paiement en ligne · mode clair · transfert du rôle ADMIN

---

## 9. V2 — PWA et notifications

Les deux sujets ne sont pas indépendants : **les notifications exigent un
service worker**, donc la PWA est un prérequis, pas une option parallèle.

### 9.1 Vraie PWA

L'app est aujourd'hui *installable* (manifeste + métadonnées Apple) mais pas
une PWA : sans service worker, aucun fonctionnement hors ligne et, sur Android,
Chrome peut se contenter d'un raccourci au lieu d'un WebAPK.

À faire :

- **Service worker en `network-first`** pour le HTML et les appels `/api`,
  `cache-first` pour `/assets/` (noms de fichiers empreintés, donc immuables).
- **Écran hors-ligne** plutôt que le dinosaure de Chrome quand le Pi ne répond
  pas. Les données restent en lecture seule depuis le cache TanStack Query.
- **Flux de mise à jour explicite** : `skipWaiting` + bandeau « nouvelle version
  disponible, recharger ». C'est le point le plus risqué du chantier — un cache
  mal réglé sert une version périmée pendant des jours après un déploiement, et
  se répare mal à distance.
- Vérifier l'installation en WebAPK sur Android (tiroir d'applications, absence
  de barre d'adresse).

### 9.2 Notifications push

Web Push standard (VAPID), pas de service tiers : le Pi envoie directement aux
serveurs de push de Google et Apple.

**Contraintes à connaître**

- **iOS ≥ 16.4 uniquement**, et **seulement si l'app est installée** sur
  l'écran d'accueil. Un joueur qui consulte dans Safari ne recevra rien.
- La permission doit être demandée **depuis un geste utilisateur** (un bouton
  dans les réglages), jamais au chargement — sinon iOS refuse en silence.
- Un utilisateur = plusieurs appareils. On stocke des abonnements, pas un jeton
  par compte.

**Schéma**

```sql
push_subscriptions
  id, user_id → users(id) ON DELETE CASCADE,
  endpoint TEXT UNIQUE,      -- identifie l'appareil
  p256dh   TEXT,             -- clés de chiffrement du payload
  auth     TEXT,
  created_at, last_seen_at
```

Un endpoint qui répond 404/410 est supprimé automatiquement : c'est ainsi qu'on
nettoie les appareils désinstallés, il n'y a pas d'autre signal.

**Nouvelles variables d'environnement** : `VAPID_PUBLIC_KEY`,
`VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`. Générées une fois, à ne jamais changer —
tout changement invalide l'ensemble des abonnements existants.

**Événements déclencheurs** — à arbitrer :

| Événement | Destinataire |
|---|---|
| Une amende m'est donnée | le joueur concerné |
| Mon amende passe « en retard » | le joueur concerné |
| Une cotisation est appliquée | toute l'équipe |
| Mon amende est cochée payée | le joueur concerné |
| Récapitulatif hebdomadaire des impayés | admin / gestionnaires |

Les deux dernières lignes du tableau supposent un **déclencheur planifié** : le
passage « en retard » n'est aujourd'hui qu'un calcul à la volée, personne ne
« l'observe ». Il faudra une tâche périodique (un `setInterval` dans l'API, ou
un service `cron` à part) — c'est une brique nouvelle, pas une simple route.

**Préférences** : au minimum un interrupteur global par compte dans les
réglages. Un réglage par type d'événement est possible, mais alourdit le
schéma et l'écran.


---

### 9.3 Plein écran sur iPhone — le piège de la barre d'état

`apple-mobile-web-app-status-bar-style` doit valoir **`black`**, surtout pas
`black-translucent`.

Avec la valeur translucide, iOS place le web view en haut de l'écran mais lui
donne la **hauteur d'une mise en page non translucide**. Position et hauteur se
contredisent, et l'écart tombe en bas. Mesuré sur iPhone 13 :

```
screen = 844    inner = 797    safe-area-inset-top = 47
```

Les 47 points manquants — exactement l'encoche du haut — sont peints par la page
mais **hors du viewport de mise en page**. Aucune unité CSS ne les atteint :
`100vh`, `100dvh` et `inset: 0` valent tous 797. La barre du bas flotte donc
au-dessus du vide, quoi qu'on fasse dans la feuille de style.

Symptôme caractéristique : en tirant sur la page, la barre descend jusqu'au bord
puis remonte au relâchement. C'est le rebond du document, et il prouve que la
bande est accessible au rendu, pas à la mise en page.

En `black`, hauteur et position redeviennent cohérentes, sans une ligne de
JavaScript. Contrepartie : la barre d'état est noire opaque au lieu de laisser
voir le fond de page — invisible sur cette palette — et `safe-area-inset-top`
retombe à 0.

⚠️ Cette balise n'est lue **qu'à l'installation** du raccourci. La modifier exige
de supprimer puis réinstaller l'app sur l'écran d'accueil.

Le rebond du document est par ailleurs coupé par `overscroll-behavior-y: none`
sur le `body` : le défilement réel se passe dans le conteneur interne de
`AppLayout`.

---

## 10. Signalements par les joueurs

Activable par l'**admin seul**, désactivé par défaut : élargir qui peut créer
des amendes est une décision, pas un comportement qu'on découvre après une
mise à jour.

Une amende porte désormais un état de **validation**, distinct de son état de
paiement : `fines.status ∈ ('PENDING','CONFIRMED')`.

| | Gestionnaire | Joueur |
|---|---|---|
| Crée une amende | directement `CONFIRMED` | `PENDING` si l'admin l'a autorisé |
| Valide un signalement | ✅ | ❌ |
| Supprime | ✅ toutes | ✅ son propre signalement, tant qu il est en attente |

### Ce qu'implique l'état « en attente »

- **Ne compte dans aucun total** — ni dû, ni payé, ni retard. La cagnotte
  n'affiche jamais d'argent qu'un gestionnaire n'a pas entériné.
- **Ne notifie personne.** Le joueur concerné est prévenu à la validation,
  et seulement là.
- **Visible de tous dans le fil**, remonté en tête : un signalement demande une
  action, pas une consultation.
- Ne peut pas être coché « payé » : le gestionnaire voit un bouton de
  validation à la place de la case.

`PATCH /fines/:id/confirm` est idempotent — le `WHERE status = 'PENDING'`
garantit qu'une double validation ne déclenche qu'une notification.

Désactiver le réglage n'efface rien : les signalements déjà déposés restent à
valider, seule la création de nouveaux est bloquée.

---

## 11. Fonctionnalités activables

Trois interrupteurs, **réservés à l'admin**, dans Réglages → Fonctionnalités :

| Réglage | Défaut | Effet |
|---|---|---|
| Pénalités de retard | activé | masque la section *Retard de paiement* **et éteint toute la notion de retard** |
| Cotisations | activé | masque la section *Cotisation* |
| Signalements par les joueurs | désactivé | ouvre la saisie aux joueurs |

Les deux premiers sont activés par défaut : c'est le comportement existant, une
mise à jour ne doit rien faire disparaître.

Couper une fonctionnalité **ne supprime rien** — les règles restent en base et
réapparaissent telles quelles si on la réactive. Ce qui change :

- la section disparaît de l'écran Règles ;
- ses règles ne sont plus proposées à l'écran d'ajout d'amende ;
- le serveur **refuse** d'en créer une nouvelle ou d'appliquer une existante.

Ce dernier point compte : le masquage côté front n'est qu'un confort, et un
appel forgé ne doit pas pouvoir alimenter une fonctionnalité éteinte.

### Couper les pénalités éteint tout le retard

Plus aucun badge « en retard » nulle part — fil, classement, fiches membres — et
le délai en jours disparaît avec la section.

La condition vit dans **`IS_LATE_SQL`**, le fragment SQL partagé par toutes les
requêtes :

```sql
s.enable_penalties
AND f.status = 'CONFIRMED'
AND f.paid_at IS NULL
AND (f.created_at AT TIME ZONE 'Europe/Paris')::date + s.late_after_days
    <= (NOW() AT TIME ZONE 'Europe/Paris')::date
```

Aucun écran n'a donc à s'en soucier, et surtout aucun ne peut l'oublier : le
serveur renvoie simplement `isLate: false` partout.

---

## 12. Détacher un compte de son participant

Cas visé : un joueur s'inscrit et **réclame le mauvais nom** dans la liste.

Depuis Réglages → Membres, l'admin ouvre un participant et choisit
« Détacher le compte ». Concrètement, `members.user_id` repasse à `NULL`.

Ce que ça produit, sans rien supprimer :

- le participant redevient **fantôme**, avec tout son historique d'amendes ;
- il réapparaît dans la liste « Qui es-tu ? » ;
- le compte se retrouve sans membre, donc l'app le renvoie vers cet écran à sa
  prochaine ouverture, où il choisit correctement.

C'est le pivot `members` / `users` qui rend l'opération triviale : l'identité et
les amendes vivent sur le participant, l'accès vit sur le compte. Les délier ne
touche ni à l'un ni à l'autre.

**L'admin ne peut pas se détacher lui-même.** L'opération serait récupérable —
il suffirait de réclamer à nouveau — mais il perdrait entre-temps l'accès à
toutes les routes exigeant un membre.

La même boîte permet de renommer le participant et de changer son rôle. Chaque
action part sur sa propre requête : renommer quelqu'un ne peut pas modifier son
rôle par effet de bord.

---

## 13. Participants non amendables

Cas visé : quelqu'un tient la caisse **sans jouer**. Il valide les paiements,
mais ne doit jamais devoir un centime.

Le rôle ne suffit pas à l'exprimer — un gestionnaire qui joue reste amendable,
et un joueur ordinaire pourrait être exempté. C'est un second axe, porté par
`members.receives_fines` (`TRUE` par défaut).

Désactivé, le participant :

- n'apparaît plus dans le sélecteur de l'écran d'ajout d'amende, et n'est pas
  emporté par « Tout sélectionner » ;
- sort de la cible des **cotisations** ;
- sort de la cible des **pénalités**, même s'il a une amende impayée en retard.

Les trois sortes de règles finissent en ligne dans `fines` : une seule colonne
les filtre toutes.

**Ses amendes déjà posées sont conservées** et restent dues, exactement comme
couper une fonctionnalité ne supprime pas ce qu'elle a produit (§ 11). Seule la
création de nouvelles est bloquée.

La garde est côté serveur, pas seulement dans l'interface : `POST /fines`
intègre `receives_fines` à son contrôle d'existence, donc un lot contenant un
exempté est refusé **en entier** — jamais à moitié appliqué.

Le classement n'en tient pas encore compte : un exempté y figure comme tout le
monde. À traiter avec le calcul de la cagnotte, qui somme la liste des membres
et perdrait leurs anciennes amendes si on les filtrait naïvement.

---

## 14. Mot de passe oublié

Pas d'envoi d'email — donc ni fournisseur SMTP, ni jeton, ni table de jetons,
ni secret supplémentaire à sauvegarder. **L'admin réinitialise, et transmet
lui-même.**

Le parcours :

1. Réglages → Membres → un participant rattaché à un compte → « Réinitialiser
   le mot de passe », avec confirmation.
2. `POST /users/:id/reset-password` (admin). Le serveur tire un mot de passe
   temporaire, le hache, lève `must_change_password` et incrémente
   `token_version`.
3. La réponse le renvoie **en clair, une seule fois**. Il n'est stocké que
   haché : aucune route ne permet de le relire.
4. La personne se connecte avec, et l'app la bloque sur `/password` tant
   qu'elle n'en a pas choisi un autre. `PATCH /me` fait retomber le drapeau.

Le mot de passe temporaire est fait pour être **dicté au téléphone** : dix
caractères d'un alphabet sans ambiguïté (ni `O`/`0`, ni `I`/`1`), en groupes de
quatre — `UNZE-CDYH-5X`. 2⁵⁰ combinaisons pour un secret à usage unique.

### Pourquoi `token_version`

Le cookie de session vit trente jours et **survivrait** au changement de mot de
passe : une session ouverte ailleurs continuerait de fonctionner, et la
réinitialisation ne fermerait rien.

Le compteur voyage dans le JWT et est comparé à celui de la base à chaque
requête. L'incrémenter périme d'un coup tous les jetons émis avant. Le contrôle
**ne coûte aucune requête** : `requireAuth` relit déjà l'utilisateur à chaque
appel, la colonne rejoint ce `SELECT`.

Les jetons émis avant cette version ne portent pas le champ et sont lus comme
version 0 : la mise à jour ne déconnecte donc personne.

Un changement volontaire depuis les Réglages n'incrémente **pas** le compteur —
l'utilisateur se déconnecterait lui-même dans la foulée.

### Limites assumées

- **Personne ne peut réinitialiser l'admin.** Il n'y a personne au-dessus de
  lui. Le recours est l'accès à la base sur le Pi.
- **Le blocage est côté front seulement.** Un compte en mot de passe temporaire
  peut encore appeler l'API directement. C'est une mesure d'hygiène — s'assurer
  que le mot de passe transmis par WhatsApp ne reste pas en place —, pas une
  frontière de sécurité : la personne est bien elle-même.
- **`PATCH /me` n'exige pas de membre**, contrairement au reste des routes
  métier : un compte réinitialisé avant d'avoir réclamé son nom doit pouvoir
  sortir de l'écran de changement.
- **Aucune notification** n'est envoyée. La déconnexion de ses appareils est le
  signal, et l'admin est en train de lui parler.
