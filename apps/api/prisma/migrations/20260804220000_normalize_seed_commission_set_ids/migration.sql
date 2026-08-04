-- Seeded commission rule sets predated the UUID-v4 checkout contract. The
-- existing FK uses ON UPDATE CASCADE, so changing the parent id also updates
-- every attached commission rule without rebuilding the published set.
UPDATE "commission_rule_sets"
SET "id" = '8d9fe2c4-a82e-4fc2-8b6d-5a4d1e9f1001'
WHERE "id" = 'local-commission-set-v1';

UPDATE "commission_rule_sets"
SET "id" = '8d9fe2c4-a82e-4fc2-8b6d-5a4d1e9f1002'
WHERE "id" = 'production-commission-set-v1';

UPDATE "commission_rule_sets"
SET "id" = '8d9fe2c4-a82e-4fc2-8b6d-5a4d1e9f1003'
WHERE "id" = 'test-commission-set-v1';
