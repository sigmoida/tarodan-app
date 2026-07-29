-- Track the last IBAN change so payouts can apply a short cooldown after a change
-- (anti-fraud: a stolen session changing the IBAN cannot instantly drain earnings).
ALTER TABLE "seller_bank_accounts" ADD COLUMN "iban_changed_at" TIMESTAMP(3);
