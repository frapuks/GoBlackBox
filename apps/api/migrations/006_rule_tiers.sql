-- Paliers d'une règle.
--
-- Une règle « Retard » porte plusieurs paliers (« 0 à 5 min », « 5 à 10 min »…),
-- chacun avec son montant. Le libellé est libre : le même mécanisme sert aux
-- durées, aux récidives ou à tout autre découpage, sans unité de mesure imposée.
--
-- Les amendes ne référencent PAS le palier : elles copient déjà son montant et
-- son libellé à la création. Réorganiser les paliers ne réécrit donc jamais
-- l'historique, et un palier supprimé ne laisse aucune amende orpheline.
CREATE TABLE rule_tiers (
  id       SERIAL PRIMARY KEY,
  rule_id  INTEGER NOT NULL REFERENCES rules (id) ON DELETE CASCADE,
  label    TEXT    NOT NULL,
  amount   INTEGER NOT NULL CHECK (amount >= 0),
  position INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX rule_tiers_rule_id_idx ON rule_tiers (rule_id, position);
