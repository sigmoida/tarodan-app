-- `orders.subtotal` = alıcıdan ÜRÜN için gerçekten tahsil edilen tutar.
--
-- Üç checkout yolu da bu kolona indirim ÖNCESİ liste fiyatını (oldPrice x adet)
-- yazıyordu; `unit_price` indirimliydi, `total_amount` da indirimli tabandan
-- hesaplanıyordu. Aynı sipariş üç farklı fiyat taşıyor, admin sipariş dosyası
-- alıcı toplamını ve satıcı netini indirim kadar yüksek gösteriyor, platform
-- satışının e-Arşiv faturası da kalemlerini bu kolondan kurduğu için tahsil
-- edilenden fazlaya kesiliyordu.
--
-- Türetme, alıcı toplamının TANIMINDAN gelir (order-total.helper.ts / buyerTotalOf):
--   total_amount = urun tabani + alici kargo payi + alici ucretleri
--                + urun KDV'si + alici hizmet KDV'si
-- Yani taban = total_amount eksi bu dort kalem. Her yol siparişi bu formülle
-- yarattığı için türetme kayıtsız değil, tanım gereği doğrudur.
--
-- Kargo: yeni kayıtlarda `shipping_cost` = `buyer_shipping_amount` (aynı değer iki
-- kolona yazılır). Taraf bölüşümünden ÖNCEKİ eski kayıtlarda `buyer_shipping_amount`
-- 0'dır ve tutar yalnız `shipping_cost`'tadır → GREATEST ikisini de kapsar.
--
-- Yalnız gerçekten şişmiş satırlar düşürülür (fark > 1 kuruş ve sonuç pozitif):
-- veri beklenmedikse satır olduğu gibi bırakılır, sıfırlanmaz. Kesilmiş e-belgeler
-- kalemlerini `elogo_invoices.line_items` snapshot'ında tuttuğu için bu güncelleme
-- geçmiş faturaları DEĞİŞTİRMEZ; yalnız ekranları ve bundan sonraki kesimleri düzeltir.
UPDATE orders o
SET subtotal = d.charged_base
FROM (
  SELECT
    id,
    ROUND(
      total_amount
        - GREATEST(COALESCE(buyer_shipping_amount, 0), COALESCE(shipping_cost, 0))
        - COALESCE(buyer_fee_amount, 0)
        - COALESCE(tax_amount, 0)
        - COALESCE(buyer_service_tax_amount, 0)
    , 2) AS charged_base
  FROM orders
  WHERE subtotal IS NOT NULL
) AS d
WHERE o.id = d.id
  AND d.charged_base > 0
  AND o.subtotal - d.charged_base > 0.01;
