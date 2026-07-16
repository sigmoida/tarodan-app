-- #224: per-user locale for API-rendered messages (exceptions live off the
-- request locale; emails/push/in-app render with this stored preference).
ALTER TABLE "users" ADD COLUMN "preferred_language" TEXT;
