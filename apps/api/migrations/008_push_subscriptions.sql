-- Abonnements aux notifications push.
--
-- Un compte peut avoir plusieurs appareils : on stocke donc des abonnements,
-- pas un jeton par utilisateur. L'endpoint identifie l'appareil et sert de clé
-- naturelle — c'est lui que le navigateur renvoie à chaque réabonnement.
--
-- Il n'y a PAS de colonne « notifications activées » : couper l'interrupteur
-- supprime la ligne. Pas d'abonnement, pas de notification, aucun état à
-- maintenir en double.
CREATE TABLE push_subscriptions (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER     NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  endpoint     TEXT        NOT NULL UNIQUE,
  p256dh       TEXT        NOT NULL,
  auth         TEXT        NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);

CREATE INDEX push_subscriptions_user_id_idx ON push_subscriptions (user_id);
