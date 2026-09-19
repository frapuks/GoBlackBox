-- Le compte où l'équipe verse ce qu'elle doit.
--
-- Dans les réglages plutôt que sur une règle : il ne décrit pas une sanction,
-- il dit où payer. Lisible par tout le monde — un joueur doit pouvoir copier
-- l'IBAN pour faire son virement —, modifiable par les gestionnaires, comme le
-- délai de retard et les dates de la caisse.
--
-- Deux colonnes libres, sans contrainte de format : un IBAN se saisit avec ou
-- sans espaces selon le relevé qu'on recopie, et le rejeter ne ferait
-- qu'empêcher d'enregistrer ce que la banque affiche.
ALTER TABLE settings
  ADD COLUMN bank_name TEXT,
  ADD COLUMN bank_iban TEXT;
