-- İptal & İade ekranı: bir siparişi / takası KİMİN iptal ettiği. Şimdiye dek
-- yalnız `cancelled_at` + serbest metin `cancel_reason` vardı; aktör yoktu.
-- Bundan sonra her iptal yolu aktörü orderCancelledData / tradeCancelledData /
-- tradeRejectedData üzerinden yazar.
--
-- CANLI VERİ GÜVENLİĞİ: yalnız ekleme. Yeni enum tipi + NULL'a izin veren,
-- varsayılansız iki kolon (PostgreSQL'de tablo yeniden yazılmaz). Hiçbir kolon
-- silinmez / yeniden adlandırılmaz, NOT NULL yok.
CREATE TYPE "CancellationActor" AS ENUM ('buyer', 'seller', 'platform', 'system');

ALTER TABLE "orders" ADD COLUMN "cancelled_by" "CancellationActor";
ALTER TABLE "trades" ADD COLUMN "cancelled_by" "CancellationActor";

-- ── Geriye dönük doldurma ───────────────────────────────────────────────────
-- Yalnız aktörün KESİN olduğu satırlar. Kural: o metni (ya da işareti) bugün
-- ve git geçmişinde YALNIZ tek bir aktörün yolu yazmış olmalı. Geri kalan her
-- şey NULL kalır ("Bilinmiyor"). Her UPDATE:
--   * `cancelled_at IS NOT NULL` — iptal damgası olmayan satıra dokunulmaz,
--   * `cancelled_by IS NULL`     — tekrar çalışırsa zararsız, kuralları sıralı
--                                  uygular (önce yazan kural kazanır),
--   * `status` iptal/ret         — yeniden ödemeye açılıp canlanan sipariş
--                                  (reactivate) eski damgayı taşıyabilir.
-- Metinler kodda ORDER_CANCEL_REASON / TRADE_CANCEL_REASON sabitleridir;
-- cancellation-actor-migration.spec.ts ikisinin ayrışmadığını denetler.

-- O1 system — ÖDENMİŞ siparişin otomatik iptalleri: hazırlama süresi dolumu
-- (payment-expiry-reconciliation) ve ödeme sonrası stok yetersizliği
-- (payment-fulfillment). Ödenmiş sipariş yeniden ödemeye açılamaz
-- (isReactivatablePayment), bu yüzden metin iptalin son yazarını gösterir.
UPDATE "orders"
SET "cancelled_by" = 'system'
WHERE "cancelled_by" IS NULL
  AND "cancelled_at" IS NOT NULL
  AND "status" = 'cancelled'
  AND "cancel_reason" IN (
    'Satıcı belirlenen süre içinde kargoya vermediği için otomatik iptal edildi',
    'Stok tükendi: ödeme sonrası mevcut stok sipariş adedini karşılamadı'
  );

-- O2 system — ödenmemiş siparişin otomatik iptalleri: 24 saatlik ödeme
-- penceresi, stok kaskadı (başka satış / takas son adedi aldı), yeni sepet
-- ödemesinin eskisini devralması. YALNIZ teklifsiz siparişler: teklif siparişi
-- yeniden ödemeye açılabilir (reactivate gerekçeyi temizlemez) ve ardından
-- gerekçe yazmayan bir yolla (alıcının ödemeyi iptal etmesi) kapanırsa metin
-- bayat kalır — o satırlar NULL bırakılır.
UPDATE "orders"
SET "cancelled_by" = 'system'
WHERE "cancelled_by" IS NULL
  AND "cancelled_at" IS NOT NULL
  AND "status" = 'cancelled'
  AND "offer_id" IS NULL
  AND "cancel_reason" IN (
    'Ödeme süresi (24 saat) doldu',
    'Stok tükendi',
    'Stok takas icin ayrildi',
    'Yeni toplu sipariş ile değiştirildi'
  );

-- O3 platform — yönetici teklif iptali bağlı ödenmemiş siparişi kapatır
-- (admin-offer → cancelUnpaidOrderInTx, offerAdminCancelReason öneki). Teklif
-- `cancelled` olur, sipariş bir daha canlanamaz.
UPDATE "orders"
SET "cancelled_by" = 'platform'
WHERE "cancelled_by" IS NULL
  AND "cancelled_at" IS NOT NULL
  AND "status" = 'cancelled'
  AND "cancel_reason" LIKE 'Yönetici tarafından iptal edildi: %';

-- O4 buyer — alıcının ödenmemiş siparişini gerekçesiz iptali (order-lifecycle
-- varsayılan metni). Bağlı teklif `cancelled` olur, sipariş canlanamaz.
UPDATE "orders"
SET "cancelled_by" = 'buyer'
WHERE "cancelled_by" IS NULL
  AND "cancelled_at" IS NOT NULL
  AND "status" = 'cancelled'
  AND "cancel_reason" = 'Alıcı tarafından iptal edildi';

-- O5 buyer — alıcının seçtiği iptal gerekçe kodu, İADE TALEBİ OLMADAN: kodu
-- iade talebi açmadan yazan tek yol alıcının ödenmemiş iptalidir
-- (cancelUnpaidOrderInTx, yalnız alıcı yolu kod geçirir). Talepli yol
-- (createCancellationRefund) kodu talep reddedilse de bırakır ve sipariş
-- sonra başka biri tarafından kapanabilir — o yüzden talepli satırlar O6'ya.
UPDATE "orders" AS o
SET "cancelled_by" = 'buyer'
WHERE o."cancelled_by" IS NULL
  AND o."cancelled_at" IS NOT NULL
  AND o."status" = 'cancelled'
  AND o."cancellation_reason_code" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "refund_requests" AS rr WHERE rr."order_id" = o."id"
  );

-- O6 buyer — alıcının kargo öncesi iptal talebi İADE EDİLDİ (talebi yalnız
-- alıcı açabilir; iptal politikaları `*_cancellation`). İade siparişi kapatan
-- son adımdır; süpürülen (kargolamama cron'unun devraldığı) talep `refunded`
-- değil `cancelled` olur ve O1'e düşer.
UPDATE "orders" AS o
SET "cancelled_by" = 'buyer'
WHERE o."cancelled_by" IS NULL
  AND o."cancelled_at" IS NOT NULL
  AND o."status" = 'cancelled'
  AND EXISTS (
    SELECT 1 FROM "refund_requests" AS rr
    WHERE rr."order_id" = o."id"
      AND rr."status" = 'refunded'
      AND rr."policy_code" IN (
        'seller_fault_cancellation',
        'buyer_remorse_cancellation',
        'manual_review_cancellation'
      )
  );

-- T1 seller — ret. `rejected` statüsünü yalnız rejectTrade yazar ve orada
-- yalnız teklifin alıcısı (receiver = ilan sahibi) reddedebilir; ilk
-- sürümden beri böyle.
UPDATE "trades"
SET "cancelled_by" = 'seller'
WHERE "cancelled_by" IS NULL
  AND "cancelled_at" IS NOT NULL
  AND "status" = 'rejected';

-- T2 system — otomatik takas iptalleri: süre dolumu (trade-reconciliation),
-- stok tükenmesi (product-lock), kayıp koli (trade-reconciliation), takas
-- hakkı olmayan katmana düşüş (membership-subscription). İptal terminaldir,
-- metin son yazarı gösterir.
UPDATE "trades"
SET "cancelled_by" = 'system'
WHERE "cancelled_by" IS NULL
  AND "cancelled_at" IS NOT NULL
  AND "status" = 'cancelled'
  AND "cancel_reason" IN (
    'Süre dolumu nedeniyle otomatik iptal',
    'Stok tükendiği için otomatik iptal edildi',
    'Depoya ulaşmayan (kayıp) koli nedeniyle otomatik iptal — bekleme süresi doldu',
    'Üyelik süresi sona erdiği için bekleyen takas teklifiniz otomatik iptal edildi.'
  );

-- T3 platform — yönetici kararları: zorla iptal (öneki), ban, eski itiraz
-- çözümünün varsayılan metinleri (not yazılmadığında; yalnız admin yolu).
UPDATE "trades"
SET "cancelled_by" = 'platform'
WHERE "cancelled_by" IS NULL
  AND "cancelled_at" IS NOT NULL
  AND "status" = 'cancelled'
  AND (
    "cancel_reason" LIKE 'Admin force-cancel (stuck): %'
    OR "cancel_reason" IN (
      'Kullanıcı banlandığı için takas iptal edildi',
      'Admin tarafından iptal edildi',
      'Alıcı lehine iptal edildi'
    )
  );

-- T4 platform — iade bacağı olan iptal: `return` bacağını yalnız yönetici
-- yolları açar (depo reddi, zorla iptal) ve takas `returning`den yalnız
-- bacaklar kapanınca iptale geçer. Depo reddinin gerekçesi serbest metin
-- olduğundan T3 bunları yakalayamaz.
UPDATE "trades" AS t
SET "cancelled_by" = 'platform'
WHERE t."cancelled_by" IS NULL
  AND t."cancelled_at" IS NOT NULL
  AND t."status" = 'cancelled'
  AND EXISTS (
    SELECT 1 FROM "trade_shipments" AS ts
    WHERE ts."trade_id" = t."id" AND ts."leg" = 'return'
  );

-- Kullanıcının kendi takas iptali (serbest metin; initiator mı receiver mı
-- bilinmez), gerekçesiz ödeme hatası iptalleri ve teklif siparişlerinin
-- yukarıda dışlanan satırları bilinçli olarak NULL kalır.

-- ── İndeksler ───────────────────────────────────────────────────────────────
-- İptal & İade ekranı: sekme = aktör, sıra ve "Yeni" (son 24 saat) = iptal anı.
-- Doldurmadan SONRA kurulur (tek geçiş).
CREATE INDEX "orders_cancelled_by_cancelled_at_idx" ON "orders"("cancelled_by", "cancelled_at");
CREATE INDEX "trades_cancelled_by_cancelled_at_idx" ON "trades"("cancelled_by", "cancelled_at");
