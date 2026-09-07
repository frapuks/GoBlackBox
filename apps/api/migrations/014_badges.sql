-- Le système de badges.
--
-- Un badge est une icône affichée à côté d'un prénom. Trois colonnes suffisent,
-- car RIEN du classement n'est stocké : qui porte quel badge se recalcule à
-- chaque lecture, donc supprimer une amende le retire automatiquement.
--
-- 1. Le badge d'une règle, porté par celui qui en a reçu le plus d'amendes.
--    Nullable : une règle sans icône n'en décerne aucun. C'est le cas des
--    cotisations, que tout le monde reçoit en même temps — un champion n'y
--    voudrait rien dire.
ALTER TABLE rules ADD COLUMN badge_icon TEXT;

-- 2. Les trois badges décernés par le système : premier au classement, dernier,
--    et la toute première amende enregistrée. Leur icône est réglable par
--    l'admin, et NULL retire la distinction — c'est la façon la plus simple de
--    l'éteindre sans ajouter un interrupteur de plus.
ALTER TABLE settings
  ADD COLUMN first_badge_icon      TEXT DEFAULT 'euro',
  ADD COLUMN last_badge_icon       TEXT DEFAULT 'crown',
  ADD COLUMN first_fine_badge_icon TEXT DEFAULT 'star';

-- Pas de CHECK sur les valeurs permises : la liste des icônes vit dans
-- `packages/shared`, et une contrainte SQL imposerait une migration à chaque
-- fois qu'on en ajoute une. La validation se fait par Zod, à l'entrée.
