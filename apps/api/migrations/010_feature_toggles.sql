-- Activation des pénalités de retard et des cotisations.
--
-- Toutes les équipes n'ont pas de cotisation, ni de pénalité sur les impayés.
-- Plutôt que de laisser des sections vides sur l'écran Règles, l'admin coupe
-- ce qui ne le concerne pas.
--
-- Activés par défaut : c'est le comportement existant, une mise à jour ne doit
-- rien faire disparaître.
ALTER TABLE settings
  ADD COLUMN enable_penalties BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN enable_dues      BOOLEAN NOT NULL DEFAULT TRUE;
