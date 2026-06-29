-- Ertelemeli downgrade için bekleyen tier tipi. null = bekleyen downgrade yok.
ALTER TABLE "user_memberships" ADD COLUMN "scheduled_tier_type" "MembershipTierType";
