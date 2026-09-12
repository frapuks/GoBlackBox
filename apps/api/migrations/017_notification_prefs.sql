-- Ce que chaque compte veut recevoir.
--
-- Sur le COMPTE et non sur l'abonnement push : autoriser les notifications est
-- un geste d'appareil — il dépend du navigateur et de son autorisation système
-- —, alors que « je veux les rappels de retard » suit la personne d'un
-- téléphone à l'autre. Un gestionnaire qui installe l'app sur une tablette
-- retrouve ses choix sans les refaire.
--
-- `notify_fines` à vrai : c'est le comportement d'aujourd'hui, personne ne perd
-- de notification en migrant. Les trois autres à faux — un rappel qu'on n'a pas
-- demandé est une mauvaise surprise, on l'allume soi-même.
--
-- Ces trois-là sont réservées aux gestionnaires : un joueur ne déclenche ni
-- pénalité ni cotisation et ne valide aucun signalement. L'envoi vérifie le
-- rôle de toute façon, ces colonnes ne sont qu'une préférence — et elles
-- s'éteignent à la rétrogradation.
ALTER TABLE users
  ADD COLUMN notify_fines   BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN notify_penalty BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN notify_dues    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN notify_reports BOOLEAN NOT NULL DEFAULT FALSE;
