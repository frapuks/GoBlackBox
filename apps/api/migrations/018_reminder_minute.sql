-- Les minutes du rappel, en complément de l'heure.
--
-- 0 à 59. NULL vaut zéro — une heure pile —, ce qui garde le comportement des
-- rappels déjà configurés : ils partaient à l'heure ronde, ils continueront.
--
-- Colonne à part et non ajoutée à la 016 : celle-ci est déjà jouée, et une
-- migration appliquée ne se modifie plus. La rouvrir laisserait la production
-- sans la colonne, puisque son nom est déjà inscrit au registre.
ALTER TABLE rules ADD COLUMN reminder_minute SMALLINT;
