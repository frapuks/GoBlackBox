-- Un badge devient une IMAGE, et non plus un pictogramme.
--
-- La migration 014 posait trois colonnes contenant une clé d'icône dessinée.
-- Les colonnes ne changent pas : elles stockaient une clé, elles en stockent
-- une autre, celle d'un fichier de `apps/web/public/badges/`.
--
-- Les trois valeurs par défaut trouvent leur équivalent en image, donc
-- personne n'a à rechoisir : l'euro du premier devient la médaille, la
-- couronne du dernier la vraie couronne, l'étoile de la première amende
-- l'étoile dessinée.
UPDATE settings
   SET first_badge_icon      = CASE first_badge_icon      WHEN 'euro'  THEN 'premier'  ELSE first_badge_icon      END,
       last_badge_icon       = CASE last_badge_icon       WHEN 'crown' THEN 'couronne' ELSE last_badge_icon       END,
       first_fine_badge_icon = CASE first_fine_badge_icon WHEN 'star'  THEN 'etoile'   ELSE first_fine_badge_icon END
 WHERE id = 1;

-- Tout le reste est effacé. Une valeur sans image correspondante réclamerait
-- au front un fichier inexistant et afficherait un avatar cassé ; la règle
-- perd son badge, et le gestionnaire en choisit un dans la nouvelle liste.
--
-- La liste est répétée plutôt que sortie dans une table : ces clés vivent dans
-- `packages/shared`, et une table de référence imposerait une migration à
-- chaque image ajoutée.
UPDATE rules
   SET badge_icon = NULL
 WHERE badge_icon IS NOT NULL
   AND badge_icon NOT IN (
     'premier', 'couronne', 'etoile', 'euro', 'trente', 'moins7', 'reveil',
     'horloge', 'montre', 'megaphone', 'oeilbarre', 'joueurbarre', 'sifflet',
     'maillot', 'chasuble'
   );

UPDATE settings
   SET first_badge_icon =
         CASE WHEN first_badge_icon IN (
           'premier', 'couronne', 'etoile', 'euro', 'trente', 'moins7', 'reveil',
           'horloge', 'montre', 'megaphone', 'oeilbarre', 'joueurbarre', 'sifflet',
           'maillot', 'chasuble'
         ) THEN first_badge_icon END,
       last_badge_icon =
         CASE WHEN last_badge_icon IN (
           'premier', 'couronne', 'etoile', 'euro', 'trente', 'moins7', 'reveil',
           'horloge', 'montre', 'megaphone', 'oeilbarre', 'joueurbarre', 'sifflet',
           'maillot', 'chasuble'
         ) THEN last_badge_icon END,
       first_fine_badge_icon =
         CASE WHEN first_fine_badge_icon IN (
           'premier', 'couronne', 'etoile', 'euro', 'trente', 'moins7', 'reveil',
           'horloge', 'montre', 'megaphone', 'oeilbarre', 'joueurbarre', 'sifflet',
           'maillot', 'chasuble'
         ) THEN first_fine_badge_icon END
 WHERE id = 1;
