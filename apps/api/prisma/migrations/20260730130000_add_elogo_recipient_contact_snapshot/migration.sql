-- Guest checkouts all share one system user (guest@tarodan.system), so resolving the
-- invoice recipient from the user record issued the legally required e-Arsiv to
-- "GUEST_SYSTEM" with an empty address and mailed the copy to the system address
-- instead of the real customer. Snapshot the real contact details at cut time.
ALTER TABLE "elogo_invoices" ADD COLUMN "recipient_email" TEXT;
ALTER TABLE "elogo_invoices" ADD COLUMN "recipient_city" TEXT;
ALTER TABLE "elogo_invoices" ADD COLUMN "recipient_district" TEXT;
ALTER TABLE "elogo_invoices" ADD COLUMN "recipient_street" TEXT;
