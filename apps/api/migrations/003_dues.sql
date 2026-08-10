-- Cotisations.
--
-- Une cotisation n'est pas une infraction : elle s'applique à toute l'équipe
-- d'un coup, pas à un fautif. Mais elle produit exactement le même objet — une
-- ligne dans `fines`, avec son montant, son libellé et son paiement à cocher.
-- Une colonne de nature suffit donc, plutôt qu'une seconde table.
ALTER TABLE rules
  ADD COLUMN kind TEXT NOT NULL DEFAULT 'FINE'
  CHECK (kind IN ('FINE', 'DUES'));
