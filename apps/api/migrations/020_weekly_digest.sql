-- Le résumé de la semaine écoulée, affiché en tête du classement.
--
-- Calculé le lundi à 8 h pour la semaine du lundi 0 h au dimanche 23 h 59, puis
-- FIGÉ : ce que l'équipe a lu ne bouge plus, même si une amende de la semaine
-- est corrigée ensuite. Recalculé à chaque lecture, le résumé pourrait changer
-- sous les yeux de ceux qui en parlent.
--
-- Une seule ligne : on ne garde que le dernier résumé. `id` contraint à 1 rend
-- impossible d'en accumuler par erreur, et l'écriture se fait par UPSERT.
--
-- Le contenu en JSONB plutôt qu'en colonnes : c'est un instantané destiné à
-- l'affichage, jamais interrogé champ par champ, et sa forme évoluera au gré
-- des idées sans demander de migration.
CREATE TABLE weekly_digest (
  id         SMALLINT    PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  week_start DATE        NOT NULL,
  payload    JSONB       NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
