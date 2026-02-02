-- Fix ALL invalid enum values in commission_rules
-- Cast to text first, then compare
UPDATE "commission_rules" SET "seller_type" = NULL WHERE "seller_type"::text = 'platform';
UPDATE "commission_rules" SET "seller_type" = NULL WHERE "seller_type"::text NOT IN ('FREE', 'PREMIUM', 'BUSINESS', 'ALL');
