-- Kodsuz (otomatik) bedel kampanyalarının bütçe muhasebesi: sipariş oluşurken
-- harcanan bütçe, ödenmeyen sipariş kapanırken geri verilir. Bu damga geri
-- vermeyi tek seferlik (claim) yapar — çift geri ödeme bütçeyi şişirirdi.
ALTER TABLE "orders"
  ADD COLUMN "fee_discount_budget_released_at" TIMESTAMP(3);
