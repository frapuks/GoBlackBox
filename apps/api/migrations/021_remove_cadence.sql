-- Plus aucun rythme ni créneau à régler sur les règles.
--
-- La cotisation devient toujours mensuelle : elle réclame le 1er de chaque
-- mois à 9 h si elle n'a pas encore été appliquée ce mois-ci. La pénalité de
-- retard réclame quand son statut « en retard » apparaît, c'est-à-dire quand le
-- délai de retard est écoulé depuis sa dernière application et qu'il reste une
-- amende à majorer.
--
-- Ni l'une ni l'autre n'a donc plus de rythme ou d'heure à décrire : les
-- colonnes posées par les migrations 016 et 018 disparaissent.
-- `reminder_sent_at` reste, il empêche toujours de répéter un rappel.
ALTER TABLE rules
  DROP COLUMN cadence,
  DROP COLUMN reminder_day,
  DROP COLUMN reminder_hour,
  DROP COLUMN reminder_minute;
