-- Signalements par les joueurs.
--
-- Une amende acquiert un état de VALIDATION, distinct de son état de paiement :
-- un joueur peut signaler une infraction, elle reste « à valider » jusqu'à ce
-- qu'un gestionnaire la confirme.
--
-- Les amendes existantes passent en 'CONFIRMED' : elles ont toutes été saisies
-- par un gestionnaire, donc validées par construction.
ALTER TABLE fines
  ADD COLUMN status TEXT NOT NULL DEFAULT 'CONFIRMED'
  CHECK (status IN ('PENDING', 'CONFIRMED'));

-- Les signalements en attente sont peu nombreux mais consultés à chaque
-- affichage du fil : un index partiel suffit et reste minuscule.
CREATE INDEX fines_pending_idx ON fines (created_at DESC) WHERE status = 'PENDING';

-- Désactivé par défaut : ouvrir la saisie à toute l'équipe est une décision,
-- pas un comportement qu'on découvre après une mise à jour.
ALTER TABLE settings
  ADD COLUMN allow_player_reports BOOLEAN NOT NULL DEFAULT FALSE;
