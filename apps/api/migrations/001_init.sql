-- BLACKBOX — schéma initial
-- Voir SPEC.md §2 pour les décisions structurantes.

CREATE TYPE user_role AS ENUM ('ADMIN', 'MANAGER', 'PLAYER');

-- Un compte connectable. Ne porte PAS le nom affiché : c'est members.display_name
-- qui fait foi partout, pour n'avoir qu'un seul nom à gérer.
CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  email         TEXT        NOT NULL UNIQUE,
  password_hash TEXT        NOT NULL,
  role          user_role   NOT NULL DEFAULT 'PLAYER',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Le pivot du modèle. Un membre sans user_id est un participant « fantôme »,
-- créé par un gestionnaire ; quand la personne s'inscrit on remplit juste
-- user_id, sans aucune migration de données.
CREATE TABLE members (
  id           SERIAL PRIMARY KEY,
  display_name TEXT        NOT NULL,
  position     TEXT,
  user_id      INTEGER     UNIQUE REFERENCES users (id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- amount = 0 est valide : c'est un gage (tournée, pack de bières).
CREATE TABLE rules (
  id          SERIAL PRIMARY KEY,
  label       TEXT        NOT NULL,
  description TEXT,
  amount      INTEGER     NOT NULL CHECK (amount >= 0),
  archived_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- amount et label sont COPIÉS depuis la règle à la création : modifier le tarif
-- d'une règle en janvier ne doit pas réécrire les amendes de septembre.
-- rule_id n'est qu'un lien de traçabilité, il peut devenir NULL.
CREATE TABLE fines (
  id         SERIAL PRIMARY KEY,
  member_id  INTEGER     NOT NULL REFERENCES members (id) ON DELETE CASCADE,
  rule_id    INTEGER     REFERENCES rules (id) ON DELETE SET NULL,
  amount     INTEGER     NOT NULL CHECK (amount >= 0),
  label      TEXT        NOT NULL,
  created_by INTEGER     REFERENCES members (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at    TIMESTAMPTZ
);

CREATE INDEX fines_created_at_idx ON fines (created_at DESC);
CREATE INDEX fines_member_id_idx  ON fines (member_id);
CREATE INDEX fines_unpaid_idx     ON fines (member_id) WHERE paid_at IS NULL;

-- Table à ligne unique : l'app est mono-caisse.
CREATE TABLE settings (
  id              INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  invite_code     TEXT    NOT NULL,
  season_name     TEXT    NOT NULL DEFAULT 'Saison en cours',
  late_after_days INTEGER NOT NULL DEFAULT 7 CHECK (late_after_days > 0)
);

-- Code d'invitation provisoire : à régénérer depuis /admin dès la connexion.
INSERT INTO settings (id, invite_code) VALUES (1, 'CHANGEME');
