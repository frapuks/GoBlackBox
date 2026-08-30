-- Réinitialisation d'un mot de passe par l'admin.
--
-- Pas d'envoi d'email, donc ni jeton, ni table de jetons, ni secret SMTP :
-- l'admin génère un mot de passe temporaire et le transmet de vive voix. Deux
-- colonnes suffisent.
--
-- must_change_password : levé par la réinitialisation, retombé au premier
-- changement réussi. Tant qu'il est levé, l'app ne laisse accéder à aucune
-- autre page — sans quoi un mot de passe temporaire pourrait rester en place
-- indéfiniment, dans une conversation où il traîne.
--
-- token_version : entre dans le JWT, et est comparé à chaque requête. Le
-- cookie de session vit trente jours et survivrait sinon au changement de mot
-- de passe, ce qui rendrait la réinitialisation à moitié fictive. L'incrémenter
-- périme d'un coup tous les jetons émis avant. Le contrôle ne coûte aucune
-- requête supplémentaire : `requireAuth` relit déjà l'utilisateur à chaque
-- appel, la colonne rejoint simplement ce SELECT.
ALTER TABLE users
  ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN token_version        INTEGER NOT NULL DEFAULT 0;
