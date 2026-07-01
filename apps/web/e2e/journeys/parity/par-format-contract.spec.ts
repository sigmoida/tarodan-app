/**
 * Domain 25 — Frontend Parite (PAR): WEB tarafı format/etiket kontratı.
 *
 * Web `apps/web/src/lib/format.ts` helper'ını DOĞRUDAN import edip çıktısını doğrular.
 * Mobile karşılığı `apps/mobile/src/utils/__tests__/par-format-parity.test.ts` içinde
 * kendi helper'ına karşı test edilir. İki dosya birlikte web↔mobile paritesini/sapmasını
 * (R-PAR-1/2/3/5) çapraz kanıtlar.
 *
 * NOT: Bu blok tarayıcı/stack gerektirmeyen SAF birim doğrulamalarıdır (helper import).
 * Playwright test runner altında koşar; API-kontrat testleri (PAR-001/010) aşağıda
 * `request` fixture ile ayrıca gelir (çalışan stack gerektirir).
 */
import { test, expect } from '@playwright/test';
// Web tsconfig paths: '@/*' -> './src/*'. Göreli yol da çalışır (parity/ -> src/lib).
import {
  formatPrice,
  formatPriceNumber,
  formatCondition,
  formatOrderStatus,
  formatProductStatus,
  formatShipmentStatus,
  formatTradeStatus,
  formatOfferStatus,
} from '../../../src/lib/format';

// ─────────────────────────────────────────────────────────────────────────────
// PAR-020 — Fiyat biçimi tr-TR (binlik ., ondalık ,, 2 hane)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('PAR-020 [P0] — web fiyat biçimi tr-TR', () => {
  test('PAR-020 [P0] — 1234.5 → "1.234,50 TL", 390 → "390,00 TL" (mobile ile aynı string)', () => {
    expect(formatPrice(1234.5)).toBe('1.234,50 TL');
    expect(formatPrice(390)).toBe('390,00 TL');
    expect(formatPrice('750')).toBe('750,00 TL');
    expect(formatPriceNumber(1234.5)).toBe('1.234,50');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PAR-022 — null/NaN fallback "0,00 TL"
// ─────────────────────────────────────────────────────────────────────────────
test.describe('PAR-022 [P2] — web null/NaN fiyat fallback', () => {
  test('PAR-022 [P2] — null/undefined/"abc" → "0,00 TL" (asla "NaN TL")', () => {
    expect(formatPrice(null)).toBe('0,00 TL');
    expect(formatPrice(undefined)).toBe('0,00 TL');
    expect(formatPrice('abc')).toBe('0,00 TL');
    expect(formatPrice('abc')).not.toContain('NaN');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PAR-021 — Para simgesi: format.ts "TL"; web ProductCard "₺" (istemci-içi SAPMA R-PAR-4)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('PAR-021 [P1] — para simgesi: format.ts "TL" vs ProductCard "₺" (R-PAR-4)', () => {
  test('PAR-021 [P1] — formatPrice çıktısı " TL" ile biter (₺ DEĞİL); kart ₺ kullanır → istemci-içi tutarsızlık', () => {
    // Web format.ts:15 → "... TL". Kaynak SAPMA: web ui/ProductCard.tsx:105 aynı sayıyı "₺" (₺) ile basar.
    expect(formatPrice(1234.5)).toBe('1.234,50 TL');
    expect(formatPrice(1234.5).endsWith(' TL')).toBeTruthy();
    expect(formatPrice(1234.5)).not.toContain('₺');
    // Mobile her yerde "TL" kullanır (format.ts:34) → ideal tek-simge kuralı yalnız web kartında bozulur.
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PAR-040 — Sipariş statü etiketleri TR/EN (ortak statüler mobile ile aynı)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('PAR-040 [P1] — web sipariş statü etiketleri', () => {
  test('PAR-040 [P1] — ortak statüler TR/EN mobile ile birebir aynı + bilinmeyen fallback', () => {
    const shared: Array<[string, string, string]> = [
      ['pending_payment', 'Ödeme Bekleniyor', 'Pending Payment'],
      ['paid', 'Ödeme Alındı', 'Paid'],
      ['preparing', 'Hazırlanıyor', 'Preparing'],
      ['shipped', 'Kargoya Verildi', 'Shipped'],
      ['delivered', 'Teslim Edildi', 'Delivered'],
      ['completed', 'Tamamlandı', 'Completed'],
      ['cancelled', 'İptal Edildi', 'Cancelled'],
      ['refund_requested', 'İade Talep Edildi', 'Refund Requested'],
      ['refunded', 'İade Edildi', 'Refunded'],
    ];
    for (const [s, tr, en] of shared) {
      expect(formatOrderStatus(s)).toBe(tr);
      expect(formatOrderStatus(s, 'en')).toBe(en);
    }
    expect(formatOrderStatus('some_unknown_state')).toBe('Some unknown state');
    expect(formatOrderStatus(null)).toBe('Bilinmiyor');
  });
  // Ters yön: web'de awaiting_buyer_confirmation MAP'TE YOK → title-case fallback (mobile map'li).
  test('PAR-040 [P1] — awaiting_buyer_confirmation web\'de map\'siz → title-case (mobile "Alıcı Onayı Bekleniyor")', () => {
    expect(formatOrderStatus('awaiting_buyer_confirmation')).toBe('Awaiting buyer confirmation');
    expect(formatOrderStatus('awaiting_buyer_confirmation')).not.toBe('Alıcı Onayı Bekleniyor');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PAR-041 — Takas escrow statüleri: WEB Türkçeleştirir (mobile sapar) — R-PAR-1
// ─────────────────────────────────────────────────────────────────────────────
test.describe('PAR-041 [P0] — web takas escrow statüleri Türkçe (mobile çiğ → R-PAR-1)', () => {
  test('PAR-041 [P0] — at_warehouse/shipping_to_warehouse/awaiting_payment web\'de TR map\'li', () => {
    // WEB map'li (format.ts:174-180): mobile bu statülerde çiğ İngilizce gösterir → SAPMA.
    expect(formatTradeStatus('at_warehouse')).toBe('Depoda');
    expect(formatTradeStatus('at_warehouse', 'en')).toBe('At Warehouse');
    expect(formatTradeStatus('shipping_to_warehouse')).toBe('Depoya Gönderiliyor');
    expect(formatTradeStatus('awaiting_payment')).toBe('Ödeme Bekleniyor');
    expect(formatTradeStatus('admin_reviewing')).toBe('İnceleniyor');
    expect(formatTradeStatus('returning')).toBe('İade Ediliyor');
    // Karşı-kanıt: web çiğ "At warehouse" DÖNMEZ (mobile döner).
    expect(formatTradeStatus('at_warehouse')).not.toBe('At warehouse');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PAR-042 — Ürün 'deleted': WEB "Kaldırıldı"/"Removed" (mobile çiğ) — R-PAR-2
// ─────────────────────────────────────────────────────────────────────────────
test.describe('PAR-042 [P2] — web product "deleted" → "Kaldırıldı" (mobile çiğ → R-PAR-2)', () => {
  test('PAR-042 [P2] — deleted web\'de map\'li TR/EN; mobile fallback "Deleted"', () => {
    expect(formatProductStatus('deleted')).toBe('Kaldırıldı');
    expect(formatProductStatus('deleted', 'en')).toBe('Removed');
    expect(formatProductStatus('deleted')).not.toBe('Deleted');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PAR-043 — Teklif 'countered': WEB map'siz → çiğ "Countered" (mobile TR) — R-PAR-3
// ─────────────────────────────────────────────────────────────────────────────
test.describe('PAR-043 [P2] — web offer "countered" map\'siz → çiğ (mobile "Karşı Teklif Yapıldı" → R-PAR-3)', () => {
  test('PAR-043 [P2] — countered web\'de title-case fallback; counter_offered map\'li', () => {
    // Web yalnız 'counter_offered'ı map'ler (format.ts:207); 'countered' map'te YOK.
    expect(formatOfferStatus('counter_offered')).toBe('Karşı Teklif Yapıldı');
    expect(formatOfferStatus('countered')).toBe('Countered'); // çiğ title-case
    expect(formatOfferStatus('countered')).not.toBe('Karşı Teklif Yapıldı');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PAR-044 — Kargo statü etiketleri web↔mobile tam parite
// ─────────────────────────────────────────────────────────────────────────────
test.describe('PAR-044 [P2] — web shipment statü etiketleri (mobile ile tam parite)', () => {
  test('PAR-044 [P2] — tüm shipment statüleri TR/EN mobile ile birebir aynı', () => {
    const all: Array<[string, string, string]> = [
      ['pending', 'Beklemede', 'Pending'],
      ['label_created', 'Etiket Oluşturuldu', 'Label Created'],
      ['picked_up', 'Teslim Alındı', 'Picked Up'],
      ['in_transit', 'Yolda', 'In Transit'],
      ['out_for_delivery', 'Dağıtımda', 'Out for Delivery'],
      ['delivered', 'Teslim Edildi', 'Delivered'],
      ['returned', 'İade Edildi', 'Returned'],
      ['failed', 'Başarısız', 'Failed'],
    ];
    for (const [s, tr, en] of all) {
      expect(formatShipmentStatus(s)).toBe(tr);
      expect(formatShipmentStatus(s, 'en')).toBe(en);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PAR-002 — İki helper senkron mu (üç SAPMA birlikte, web tarafı)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('PAR-002 [P1] — web format.ts kaynağı üç bilinen sapmayı doğrular', () => {
  test('PAR-002 [P1] — R-PAR-1/2/3 web tarafı: TR map\'li (mobile çiğ) / map\'siz (mobile TR)', () => {
    expect(formatTradeStatus('at_warehouse')).toBe('Depoda'); // R-PAR-1: mobile "At warehouse"
    expect(formatProductStatus('deleted')).toBe('Kaldırıldı'); // R-PAR-2: mobile "Deleted"
    expect(formatOfferStatus('countered')).toBe('Countered'); // R-PAR-3: mobile "Karşı Teklif Yapıldı"
    // Ortak koşul etiketleri parite:
    expect(formatCondition('like_new')).toBe('Yeni Gibi');
    expect(formatCondition('like_new', 'en')).toBe('Like New');
  });
});
