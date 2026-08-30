-- Membres non concernés par les amendes.
--
-- Un gestionnaire peut n'être là que pour tenir la caisse : il valide les
-- paiements sans jamais jouer, donc sans jamais devoir un centime. Le rôle ne
-- suffit pas à l'exprimer — un gestionnaire qui joue reste amendable, et un
-- joueur ordinaire pourrait être exempté. C'est bien un second axe, distinct.
--
-- Concerne les trois sortes de règles : infractions, cotisations, pénalités.
-- Elles finissent toutes en ligne dans `fines`, la colonne les filtre toutes.
--
-- TRUE par défaut : l'effectif existant reste amendable, une mise à jour ne
-- doit exempter personne à l'insu de l'équipe.
ALTER TABLE members
  ADD COLUMN receives_fines BOOLEAN NOT NULL DEFAULT TRUE;
