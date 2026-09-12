-- Rythme attendu d'une cotisation ou d'une pénalité, et rappel associé.
--
-- Rien ne se déclenche tout seul — personne n'encaisse à la place du trésorier,
-- et une cotisation créée automatiquement serait à annuler la moitié du temps.
-- Tout ce bloc ne sert qu'à RAPPELER : la règle se marque « en retard » tant
-- qu'elle n'a pas été appliquée dans la période en cours, et prévient les
-- gestionnaires qui l'ont demandé.
--
--   cadence       : 'WEEK' ou 'MONTH'. NULL = la règle ne réclame rien, ce qui
--                   est le comportement d'avant.
--   reminder_day  : 1 à 7 pour un rythme hebdomadaire — 1 = lundi —,
--                   1 à 28 pour un rythme mensuel. Plafonné à 28 pour que le
--                   créneau existe dans tous les mois, février compris.
--   reminder_hour : 0 à 23, heure locale du serveur. ⚠ Le conteneur doit porter
--                   un fuseau : sans TZ ni tzdata, Node tourne à l'heure de
--                   Greenwich et un rappel de 19 h partirait à 21 h en été.
--
-- Le créneau sur la RÈGLE et non sur le compte : appliquer la pénalité est un
-- geste collectif, un seul gestionnaire le fait pour toute l'équipe. Chacun
-- garde le choix de recevoir le rappel, dans ses propres réglages.
--
-- Les infractions ignorent tout ça — une amende n'est en retard de rien, elle
-- tombe quand quelqu'un la commet.
--
-- Pas de CHECK sur les valeurs : elles vivent dans `packages/shared` et la
-- validation se fait par Zod, à l'entrée, comme pour les icônes de badge.
ALTER TABLE rules
  ADD COLUMN cadence       TEXT,
  ADD COLUMN reminder_day  SMALLINT,
  ADD COLUMN reminder_hour SMALLINT;

-- Dernier envoi, pour ne pas répéter le rappel toutes les minutes une fois le
-- créneau passé. Comparé au début de la période en cours : un envoi plus ancien
-- appartient à la période précédente et n'empêche donc plus rien.
ALTER TABLE rules ADD COLUMN reminder_sent_at TIMESTAMPTZ;
