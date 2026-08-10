-- Simplification V1 après premiers retours d'interface.
--
-- Le poste n'apporte rien : un participant est défini par son seul nom.
ALTER TABLE members DROP COLUMN position;

-- La notion de saison est retirée entièrement de l'app.
ALTER TABLE settings DROP COLUMN season_name;
