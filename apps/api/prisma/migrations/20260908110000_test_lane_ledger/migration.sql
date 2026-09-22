-- Test şeridi damgası: ledger satırları bağlı ödeme/sipariş/takastan türetilir
-- (bkz. 20260908100000_production_test_lane). Finans mutabakatı is_test=false süzer.

ALTER TABLE "ledger_entries" ADD COLUMN "is_test" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "ledger_entries_is_test_idx" ON "ledger_entries"("is_test");

CREATE OR REPLACE FUNCTION stamp_ledger_entry_test_lane()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.payment_id IS NOT NULL THEN
    SELECT p.is_test INTO NEW.is_test FROM "payments" p WHERE p.id = NEW.payment_id;
  ELSIF NEW.order_id IS NOT NULL THEN
    SELECT o.is_test INTO NEW.is_test FROM "orders" o WHERE o.id = NEW.order_id;
  ELSIF NEW.trade_id IS NOT NULL THEN
    SELECT t.is_test INTO NEW.is_test FROM "trades" t WHERE t.id = NEW.trade_id;
  END IF;
  NEW.is_test := COALESCE(NEW.is_test, false);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ledger_entries_stamp_test_lane ON "ledger_entries";
CREATE TRIGGER ledger_entries_stamp_test_lane
BEFORE INSERT ON "ledger_entries"
FOR EACH ROW EXECUTE FUNCTION stamp_ledger_entry_test_lane();
