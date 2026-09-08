-- Canlı ortamda izole "test şeridi" (mağaza incelemesi / mobil QA).
--
-- users.is_test_account  : bayrağı yalnız süper-admin verir.
-- orders/payments/trades.is_test : alıcı/ödeyen test hesabıysa INSERT'te
--   trigger yazar. Uygulama kodunun her create noktasında bayrağı hatırlaması
--   beklenmez; tek kaynak DB'dir. Bayrak sonradan DEĞİŞMEZ (trigger yalnız
--   INSERT'te çalışır; test hesabı dönüşümü servis katmanında yalnız işlem
--   geçmişi boş hesaplara izin verir).

ALTER TABLE "users" ADD COLUMN "is_test_account" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "users_is_test_account_idx" ON "users"("is_test_account");

ALTER TABLE "orders"   ADD COLUMN "is_test" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "payments" ADD COLUMN "is_test" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "trades"   ADD COLUMN "is_test" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "orders_is_test_idx"   ON "orders"("is_test");
CREATE INDEX "payments_is_test_idx" ON "payments"("is_test");
CREATE INDEX "trades_is_test_idx"   ON "trades"("is_test");

-- ---------------------------------------------------------------------------
-- orders: alıcı test hesabıysa test siparişi
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION stamp_order_test_lane()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  SELECT COALESCE(u.is_test_account, false) INTO NEW.is_test
  FROM "users" u WHERE u.id = NEW.buyer_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_stamp_test_lane ON "orders";
CREATE TRIGGER orders_stamp_test_lane
BEFORE INSERT ON "orders"
FOR EACH ROW EXECUTE FUNCTION stamp_order_test_lane();

-- ---------------------------------------------------------------------------
-- trades: başlatan test hesabıysa test takası (şerit kapısı iki tarafı
-- zaten aynı şeride zorlar)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION stamp_trade_test_lane()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  SELECT COALESCE(u.is_test_account, false) INTO NEW.is_test
  FROM "users" u WHERE u.id = NEW.initiator_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trades_stamp_test_lane ON "trades";
CREATE TRIGGER trades_stamp_test_lane
BEFORE INSERT ON "trades"
FOR EACH ROW EXECUTE FUNCTION stamp_trade_test_lane();

-- ---------------------------------------------------------------------------
-- payments: bağlı sipariş / sepet grubu alıcısı / takas üzerinden türetilir
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION stamp_payment_test_lane()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.order_id IS NOT NULL THEN
    SELECT o.is_test INTO NEW.is_test FROM "orders" o WHERE o.id = NEW.order_id;
  ELSIF NEW.checkout_group_id IS NOT NULL THEN
    SELECT COALESCE(u.is_test_account, false) INTO NEW.is_test
    FROM "checkout_groups" g JOIN "users" u ON u.id = g.buyer_id
    WHERE g.id = NEW.checkout_group_id;
  ELSIF NEW.trade_cash_payment_id IS NOT NULL THEN
    SELECT t.is_test INTO NEW.is_test
    FROM "trade_cash_payments" p JOIN "trades" t ON t.id = p.trade_id
    WHERE p.id = NEW.trade_cash_payment_id;
  END IF;
  NEW.is_test := COALESCE(NEW.is_test, false);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payments_stamp_test_lane ON "payments";
CREATE TRIGGER payments_stamp_test_lane
BEFORE INSERT ON "payments"
FOR EACH ROW EXECUTE FUNCTION stamp_payment_test_lane();
