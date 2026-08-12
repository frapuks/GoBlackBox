-- La liste des règles calcule, pour chacune, la date de dernière application
-- (MAX(created_at) FROM fines WHERE rule_id = …). Sans index sur fines.rule_id,
-- chaque règle provoque un parcours complet de la table des amendes.
CREATE INDEX fines_rule_id_idx ON fines (rule_id);
