-- Ad package tiers: close a gap of at most 1 TL between two bands of the same
-- package and duration (data migration, no schema change).
--
-- WHY: a tier's band of listing prices is half-open
-- (`src/modules/product/helpers/boost-tier-band.ts`): `min_amount <= price <
-- max_amount`, a NULL "max_amount" has no upper bound. The launch rows
-- (`20260726234552_ad_packages`) were written for an inclusive upper bound:
-- 200-999, 1000-5000 and 5000-(none) per package and duration. Under the
-- half-open rule a listing priced in [999, 1000), 999 TL exactly included,
-- has no tier and cannot be boosted. This sets such a band's upper bound to
-- the lower bound of the next band: 200-999 becomes 200-1000.
--
-- WHAT IT WRITES: only "ad_package_tiers"."max_amount" (not even
-- "updated_at", which nothing reads for tiers), only of an active, non-empty
-- tier T with an upper bound, and only when
--   1. N, the lowest lower bound above T's upper bound among the other
--      active, non-empty tiers of the same package and duration, is at most
--      1 above it (0 < N - T.max_amount <= 1; no other tier starts between
--      them because N is the lowest one), and
--   2. no other active, non-empty tier of the same package and duration
--      shares a price with T's widened band [T.min_amount, N) (the NOT
--      EXISTS guard).
-- A wider gap, an inactive, empty or open-ended tier and a tier that already
-- overlaps another are left alone; the read-only check
-- (`maintenance/check-ad-package-tiers.ts`) still lists them.
--
-- WHY IT CANNOT OVERLAP: by (2), a widened band overlaps no other tier as it
-- was before the statement. Two tiers widened by the same statement cannot
-- overlap each other either: if T1 starts below T2, T2's old band does not
-- overlap [T1.min_amount, N1) by (2), so T2 starts at or after N1, where T1's
-- new band ends. N is above T's lower bound, so no band becomes empty.
--
-- IDEMPOTENT: after the update T's upper bound is N, and the tier that starts
-- at N is active and non-empty, so for any later lower bound the guard in (2)
-- fails. A second run updates no row.
--
-- LIVE DATA SAFETY: one statement, row locks on the matched rows only (four
-- launch rows per environment at most, unless an admin saved more such
-- bands). It only widens a band into prices no active tier covered, so no
-- listing changes tier except those that had none. An image from before the
-- half-open rule reads the upper bound as inclusive: while it still serves
-- during the deploy, a listing priced exactly 1000 matches both 200-1000 and
-- 1000-5000 there and its purchase start may charge either price (the
-- ambiguity it already has at 5000). It ends when the new image is live; to
-- avoid the window, ship this one release after the half-open rule.
--
-- ROLLBACK: not needed to revert the API (the half-open rule needs these
-- bounds). To restore the launch rows:
--   UPDATE "ad_package_tiers" SET "max_amount" = 999
--   WHERE "package_id" IN ('a0000000-0000-4000-8000-000000000001',
--                          'a0000000-0000-4000-8000-000000000002')
--     AND "min_amount" = 200 AND "max_amount" = 1000;
-- Any other row it changed is listed, with its old upper bound, by the dry
-- run query run before the deploy (docs/OPERATIONS.md, "Check: ad package
-- tier bands"): set its "max_amount" back to "old_max_amount".
UPDATE "ad_package_tiers" AS t
SET "max_amount" = gap."next_min"
FROM (
  SELECT
    cur."id",
    (
      SELECT MIN(nxt."min_amount")
      FROM "ad_package_tiers" AS nxt
      WHERE nxt."package_id" = cur."package_id"
        AND nxt."duration_days" = cur."duration_days"
        AND nxt."is_active"
        AND (nxt."max_amount" IS NULL OR nxt."max_amount" > nxt."min_amount")
        AND nxt."min_amount" > cur."max_amount"
    ) AS "next_min"
  FROM "ad_package_tiers" AS cur
  WHERE cur."is_active"
    AND cur."max_amount" IS NOT NULL
    AND cur."max_amount" > cur."min_amount"
) AS gap
WHERE t."id" = gap."id"
  AND gap."next_min" - t."max_amount" <= 1
  AND NOT EXISTS (
    SELECT 1
    FROM "ad_package_tiers" AS other
    WHERE other."package_id" = t."package_id"
      AND other."duration_days" = t."duration_days"
      AND other."id" <> t."id"
      AND other."is_active"
      AND (other."max_amount" IS NULL OR other."max_amount" > other."min_amount")
      AND other."min_amount" < gap."next_min"
      AND (other."max_amount" IS NULL OR other."max_amount" > t."min_amount")
  );
