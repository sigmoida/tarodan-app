-- "Şeridi sıfırla" için dar bir tahliye kapısı.
--
-- SORUN: refund_financial_components ve package_shipping_settlements üzerindeki
-- append-only guard (20260811120000) DELETE'i koşulsuz yasaklıyor. Bu tablolar
-- refund_requests'e ZORUNLU + onDelete: Restrict ile bağlı; dolayısıyla test
-- şeridinde bir iade akışı denendiyse TestLaneService.resetLane siparişe kadar
-- olan zinciri hiçbir sırayla silemiyordu (feature tamamen kilitleniyordu).
--
-- ÇÖZÜM: guard aynen kalır, yalnız İKİ koşul birden sağlanırsa DELETE geçer:
--   1) oturum açıkça `app.test_lane_purge = 'on'` demiş olacak
--      (yalnız resetLane transaction'ı SET LOCAL ile verir; commit/rollback'te düşer),
--   2) satırın bağlı olduğu iade talebinin SİPARİŞİ is_test = true olacak.
-- Canlı bir satır için ikinci koşul asla sağlanmaz → değişmezlik bozulmaz.
-- UPDATE her koşulda yasak kalır (düzeltme hâlâ yeni karar kaydı ister).
--
-- ledger_entries append-only guard'ına DOKUNULMAZ: defter FK taşımaz ve
-- "kaynak satır silinse de iz kalır" tasarımı gereği test satırları yerinde
-- bırakılır (is_test damgalı, finans raporlarından zaten süzülüyor).

CREATE OR REPLACE FUNCTION prevent_refund_financial_component_mutation()
RETURNS TRIGGER AS $$
DECLARE
  purging boolean;
  test_row boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    purging := COALESCE(
      current_setting('app.test_lane_purge', true), 'off'
    ) = 'on';
    IF purging THEN
      SELECT COALESCE(o."is_test", false) INTO test_row
      FROM "refund_requests" rr
      JOIN "orders" o ON o.id = rr."order_id"
      WHERE rr.id = OLD."refund_request_id";
      IF COALESCE(test_row, false) THEN
        RETURN OLD;
      END IF;
    END IF;
  END IF;
  RAISE EXCEPTION 'refund financial components are immutable';
END;
$$ LANGUAGE plpgsql;
