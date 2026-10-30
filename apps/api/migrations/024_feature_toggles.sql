-- Les interrupteurs de fonctionnalité, réservés à l'admin.
--
-- Chacun allume ou coupe un pan de l'app pour toute l'équipe. Tous activés par
-- défaut : c'est le comportement d'aujourd'hui, une mise à jour ne doit rien
-- faire disparaître.
--
-- Le classement fait exception, par choix : l'affichage de base de la cagnotte
-- devient une simple liste, et l'admin allume le classement s'il le veut. À la
-- mise à jour, une équipe qui voyait le classement voit donc la liste.
--
-- La pénalité de retard et la cotisation reviennent, après leur retrait par la
-- migration 022. Ce qui avait motivé ce retrait — deux colonnes invisibles
-- qu'une valeur restée à faux laissait coupées sans recours — ne vaut plus :
-- les interrupteurs sont affichés dans les réglages, et se rallument d'un geste.
--
-- Couper la pénalité éteint aussi tout le RETARD : le délai appartient à la
-- pénalité, et `IS_LATE_SQL` lit la colonne. Couper ne supprime rien — règles,
-- amendes et icônes restent en base et réapparaissent à la réactivation.
--
-- `enable_leaderboard` coupé, la cagnotte affiche une liste alphabétique des
-- joueurs et de leur total, sans les badges « premier » et « dernier », qui
-- trahiraient l'ordre que la liste cache.
ALTER TABLE settings
  ADD COLUMN enable_digest       BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN enable_pot_chart    BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN enable_badges       BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN enable_kitty_dates  BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN enable_penalties    BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN enable_dues         BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN enable_leaderboard  BOOLEAN NOT NULL DEFAULT FALSE;
