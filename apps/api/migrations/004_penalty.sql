-- Pénalité de retard.
--
-- Troisième nature de règle. Comme la cotisation elle s'applique en un clic,
-- mais à un sous-ensemble : uniquement les membres ayant au moins une amende
-- impayée au-delà du délai. La cible se déduit de `kind`, elle n'est jamais
-- envoyée par le client — un front pas à jour ne peut pas viser tout le monde.
ALTER TABLE rules DROP CONSTRAINT rules_kind_check;
ALTER TABLE rules ADD CONSTRAINT rules_kind_check
  CHECK (kind IN ('FINE', 'DUES', 'PENALTY'));
