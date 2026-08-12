-- Contexte d'une règle : match, entraînement, ou autre.
--
-- Une règle appartient à exactement un contexte. C'est ce qui permet de ne
-- proposer, au moment de la saisie, que les règles qui ont un sens là où on est.
--
-- Les cotisations et les pénalités restent en 'OTHER' : elles ne dépendent pas
-- d'un match ou d'un entraînement.
ALTER TABLE rules
  ADD COLUMN context TEXT NOT NULL DEFAULT 'OTHER'
  CHECK (context IN ('MATCH', 'TRAINING', 'OTHER'));
