-- Dates de la caisse : fin de la collecte, et moment où l'argent est dépensé.
--
-- Purement informatif. Rien n'est bloqué à ces dates — ni la saisie d'amendes,
-- ni les paiements. L'équipe veut simplement les avoir sous les yeux sur
-- l'écran Classement, et pouvoir les ajuster quand le programme se précise.
--
-- L'utilisation est une PLAGE, parce qu'on retient souvent un week-end avant de
-- savoir lequel des deux jours sera le bon. `usage_end_date` à NULL = un seul
-- jour : une seule représentation pour ce cas, plutôt que d'accepter aussi une
-- fin égale au début.
--
-- Toutes nullables : une caisse qui démarre n'a pas encore de programme.
ALTER TABLE settings
  ADD COLUMN end_date         DATE,
  ADD COLUMN usage_start_date DATE,
  ADD COLUMN usage_end_date   DATE;

-- Une fin d'utilisation sans début n'a pas de sens, et une plage à l'envers non
-- plus. La base refuse les deux plutôt que de laisser l'écran les afficher.
ALTER TABLE settings
  ADD CONSTRAINT settings_usage_range_valid CHECK (
    usage_end_date IS NULL
    OR (usage_start_date IS NOT NULL AND usage_end_date >= usage_start_date)
  );
