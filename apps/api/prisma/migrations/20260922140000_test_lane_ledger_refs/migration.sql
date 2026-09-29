-- Ledger şerit damgasının kapsamını genişletir.
--
-- 20260922130000_test_lane_ledger yalnız payment_id / order_id / trade_id'ye
-- bakıyordu. Yalnız hold_id ya da payout_id taşıyan satırlar (ör. payout
-- settle ve seller_debt_recovery adjustment kayıtları: hold'suz siparişte
-- orderId null kalabilir) is_test=false damgalanıyor, böylece hem finans
-- raporuna giriyor hem de "şeridi sıfırla" adımında silinmeden kalıyordu.
--
-- Zincir: hold_id → payment_holds → payments,
--         payout_id → payout_transfers → (payment_holds → payments
--                                        | trade_cash_payments → trades).
-- Mevcut üç dal aynen korunur; yenileri yalnız hepsi NULL kaldığında devreye girer.

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
  ELSIF NEW.hold_id IS NOT NULL THEN
    SELECT p.is_test INTO NEW.is_test
    FROM "payment_holds" h JOIN "payments" p ON p.id = h.payment_id
    WHERE h.id = NEW.hold_id;
  ELSIF NEW.payout_id IS NOT NULL THEN
    SELECT COALESCE(hp.is_test, tt.is_test) INTO NEW.is_test
    FROM "payout_transfers" pt
    LEFT JOIN "payment_holds" h ON h.id = pt.payment_hold_id
    LEFT JOIN "payments" hp ON hp.id = h.payment_id
    LEFT JOIN "trade_cash_payments" tcp ON tcp.id = pt.trade_cash_payment_id
    LEFT JOIN "trades" tt ON tt.id = tcp.trade_id
    WHERE pt.id = NEW.payout_id;
  ELSIF NEW.seller_id IS NOT NULL THEN
    SELECT COALESCE(u.is_test_account, false) INTO NEW.is_test
    FROM "users" u WHERE u.id = NEW.seller_id;
  END IF;
  NEW.is_test := COALESCE(NEW.is_test, false);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ledger_entries_stamp_test_lane ON "ledger_entries";
CREATE TRIGGER ledger_entries_stamp_test_lane
BEFORE INSERT ON "ledger_entries"
FOR EACH ROW EXECUTE FUNCTION stamp_ledger_entry_test_lane();
