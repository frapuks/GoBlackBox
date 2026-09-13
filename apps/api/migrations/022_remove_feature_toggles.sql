-- La pénalité de retard et la cotisation ne s'éteignent plus.
--
-- Les deux interrupteurs de l'admin disparaissent : ces fonctionnalités sont
-- désormais toujours actives. Garder les colonnes aurait laissé deux réglages
-- invisibles que plus personne ne peut changer — et une valeur restée à faux
-- aurait coupé le retard des amendes sans aucun moyen de le rallumer.
--
-- `allow_player_reports` reste : les signalements par les joueurs demeurent un
-- choix de l'équipe.
ALTER TABLE settings
  DROP COLUMN enable_penalties,
  DROP COLUMN enable_dues;
