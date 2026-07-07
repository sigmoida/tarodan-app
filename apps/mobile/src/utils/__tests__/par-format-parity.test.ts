/**
 * Domain 25 — Frontend Parite (PAR): format/etiket paritesi (mobile tarafı).
 *
 * Bu dosya mobile `format.ts` çıktısını web ile paritesi/sapması açısından STATİK
 * doğrular. Web helper'ını mobile jest ortamına import edemeyiz (ayrı app, RN preset);
 * bu yüzden web'in beklenen çıktısı `apps/web/src/lib/format.ts` KAYNAK KODUNDAN
 * birebir türetilip literal expected string olarak yazılmıştır (kaynak satır no'ları
 * yorumda). Web tarafı ayrıca `apps/web/e2e/journeys/parity/par-format-contract.spec.ts`
 * içinde kendi helper'ına karşı doğrulanır.
 *
 * SAPMALAR (kod HÂLÂ öyle → mevcut/sapmalı davranışı assert ederiz):
 *   R-PAR-1  at_warehouse & escrow: web "Depoda", mobile çiğ "At warehouse"
 *   R-PAR-2  product 'deleted': web "Kaldırıldı", mobile çiğ "Deleted"
 *   R-PAR-3  offer 'countered': mobile map'li "Karşı Teklif Yapıldı", web çiğ "Countered"
 *   R-PAR-5  formatRelativeDate yalnız mobile'da (web'de yok)
 * Bkz. docs/TEST-KNOWN-GAPS.md → "25 — Frontend Parite (PAR)".
 */
import {
  formatPrice,
  formatPriceNumber,
  formatCondition,
  formatOrderStatus,
  formatProductStatus,
  formatShipmentStatus,
  formatTradeStatus,
  formatOfferStatus,
  formatRelativeDate,
} from '../format';

// ─────────────────────────────────────────────────────────────────────────────
// PAR-020 — Fiyat biçimi: binlik nokta, ondalık virgül, 2 hane (tr-TR)
// ─────────────────────────────────────────────────────────────────────────────
describe('PAR-020 [P0] — fiyat biçimi tr-TR (binlik ., ondalık ,, 2 hane) web↔mobile aynı', () => {
  // Web format.ts:15 ile birebir aynı kural: `${n.toLocaleString('tr-TR',{min/max:2})} TL`
  it('1234.5 → "1.234,50 TL" (her iki istemcide aynı string)', () => {
    expect(formatPrice(1234.5)).toBe('1.234,50 TL');
  });
  it('390 → "390,00 TL"', () => {
    expect(formatPrice(390)).toBe('390,00 TL');
  });
  it('string girdi "750" → "750,00 TL" (parseFloat)', () => {
    expect(formatPrice('750')).toBe('750,00 TL');
  });
  it('formatPriceNumber TL eki olmadan aynı sayı biçimini verir', () => {
    expect(formatPriceNumber(1234.5)).toBe('1.234,50');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PAR-022 — Boş/null/NaN fiyatta fallback "0,00 TL" (crash yok, "NaN TL" yok)
// ─────────────────────────────────────────────────────────────────────────────
describe('PAR-022 [P2] — null/undefined/NaN fiyat fallback "0,00 TL" web↔mobile aynı', () => {
  it('null → "0,00 TL"', () => expect(formatPrice(null)).toBe('0,00 TL'));
  it('undefined → "0,00 TL"', () => expect(formatPrice(undefined)).toBe('0,00 TL'));
  it('NaN string "abc" → "0,00 TL" (asla "NaN TL")', () => {
    expect(formatPrice('abc')).toBe('0,00 TL');
    expect(formatPrice('abc')).not.toContain('NaN');
  });
  it('formatPriceNumber null → "0,00"', () => expect(formatPriceNumber(null)).toBe('0,00'));
});

// ─────────────────────────────────────────────────────────────────────────────
// PAR-040 — Sipariş statü etiketleri TR/EN web↔mobile aynı (+ bilinmeyen fallback)
// ─────────────────────────────────────────────────────────────────────────────
describe('PAR-040 [P1] — sipariş statü etiketleri (ortak statüler) web↔mobile aynı', () => {
  // Web format.ts:70-82 ile mobile format.ts:76-89 arasında ORTAK olan statüler.
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
  it.each(shared)('%s → TR/EN web ile birebir aynı', (status, tr, en) => {
    expect(formatOrderStatus(status)).toBe(tr);
    expect(formatOrderStatus(status, 'en')).toBe(en);
  });
  it('bilinmeyen statü → _→boşluk + baş harf büyük fallback (web ile aynı)', () => {
    expect(formatOrderStatus('some_unknown_state')).toBe('Some unknown state');
  });
  it('null → "Bilinmiyor" / "Unknown" (web ile aynı)', () => {
    expect(formatOrderStatus(null)).toBe('Bilinmiyor');
    expect(formatOrderStatus(null, 'en')).toBe('Unknown');
  });
});

// PAR-040 ek not: mobile'da 'awaiting_buyer_confirmation' map'li (format.ts:84), web'de DEĞİL.
// Bu ters yönlü küçük bir sapma; web bunu title-case'e düşürür ("Awaiting buyer confirmation").
describe('PAR-040 [P1] — awaiting_buyer_confirmation: mobile map\'li, web fallback (küçük sapma)', () => {
  it('mobile "Alıcı Onayı Bekleniyor" verir (web title-case fallback verirdi)', () => {
    // Mobile map'li (format.ts:84).
    expect(formatOrderStatus('awaiting_buyer_confirmation')).toBe('Alıcı Onayı Bekleniyor');
    // Web KAYNAK: map'te YOK → fallback "Awaiting buyer confirmation" gösterirdi (bkz. web format.ts:70-82).
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PAR-041 — Takas escrow statülerinde SAPMA (R-PAR-1)
// ─────────────────────────────────────────────────────────────────────────────
describe('PAR-041 [P0] — takas escrow statülerinde web↔mobile SAPMA (R-PAR-1)', () => {
  // Ortak (map'li olanlar) — parite sağlanmış:
  const shared: Array<[string, string, string]> = [
    ['pending', 'Beklemede', 'Pending'],
    ['accepted', 'Kabul Edildi', 'Accepted'],
    ['completed', 'Tamamlandı', 'Completed'],
    ['disputed', 'Anlaşmazlık', 'Disputed'],
  ];
  it.each(shared)('ortak statü %s TR/EN web ile aynı', (s, tr, en) => {
    expect(formatTradeStatus(s)).toBe(tr);
    expect(formatTradeStatus(s, 'en')).toBe(en);
  });

  // SAPMA: escrow statüleri mobile map'inde YOK → TR'de bile çiğ İngilizce title-case.
  // Web KAYNAK (format.ts:174-180) bunları Türkçeleştirir (yorumda web beklentisi).
  it('at_warehouse: mobile çiğ "At warehouse" (web "Depoda" → SAPMA R-PAR-1)', () => {
    expect(formatTradeStatus('at_warehouse')).toBe('At warehouse'); // mobile fallback
    expect(formatTradeStatus('at_warehouse', 'en')).toBe('At warehouse');
    // Web beklenen: TR "Depoda", EN "At Warehouse" (büyük W) — mobile bundan sapar.
    expect(formatTradeStatus('at_warehouse')).not.toBe('Depoda');
  });
  it('shipping_to_warehouse: mobile çiğ "Shipping to warehouse" (web "Depoya Gönderiliyor")', () => {
    expect(formatTradeStatus('shipping_to_warehouse')).toBe('Shipping to warehouse');
    expect(formatTradeStatus('shipping_to_warehouse')).not.toBe('Depoya Gönderiliyor');
  });
  it('awaiting_payment: mobile çiğ "Awaiting payment" (web "Ödeme Bekleniyor")', () => {
    expect(formatTradeStatus('awaiting_payment')).toBe('Awaiting payment');
    expect(formatTradeStatus('awaiting_payment')).not.toBe('Ödeme Bekleniyor');
  });
  it('admin_reviewing / shipping_to_recipients / returning de mobile\'da çiğ kalır', () => {
    expect(formatTradeStatus('admin_reviewing')).toBe('Admin reviewing');
    expect(formatTradeStatus('shipping_to_recipients')).toBe('Shipping to recipients');
    expect(formatTradeStatus('returning')).toBe('Returning');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PAR-042 — Ürün statüsü 'deleted' web↔mobile SAPMA (R-PAR-2)
// ─────────────────────────────────────────────────────────────────────────────
describe('PAR-042 [P2] — product "deleted" web↔mobile SAPMA (R-PAR-2)', () => {
  // Ortak statüler parite:
  const shared: Array<[string, string]> = [
    ['pending', 'Onay Bekliyor'],
    ['active', 'Aktif'],
    ['reserved', 'Rezerve'],
    ['sold', 'Satıldı'],
    ['inactive', 'Pasif'],
    ['rejected', 'Reddedildi'],
  ];
  it.each(shared)('ortak statü %s TR web ile aynı', (s, tr) => {
    expect(formatProductStatus(s)).toBe(tr);
  });
  // SAPMA: web format.ts:109 'deleted' → "Kaldırıldı"/"Removed"; mobile map'te YOK → "Deleted".
  it('deleted: mobile çiğ "Deleted" (web "Kaldırıldı"/"Removed" → SAPMA R-PAR-2)', () => {
    expect(formatProductStatus('deleted')).toBe('Deleted'); // mobile fallback
    expect(formatProductStatus('deleted', 'en')).toBe('Deleted');
    expect(formatProductStatus('deleted')).not.toBe('Kaldırıldı');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PAR-043 — Teklif statüsü 'countered' web↔mobile SAPMA (R-PAR-3)
// ─────────────────────────────────────────────────────────────────────────────
describe('PAR-043 [P2] — offer "countered" web↔mobile SAPMA (R-PAR-3)', () => {
  const shared: Array<[string, string, string]> = [
    ['pending', 'Beklemede', 'Pending'],
    ['accepted', 'Kabul Edildi', 'Accepted'],
    ['rejected', 'Reddedildi', 'Rejected'],
    ['expired', 'Süresi Doldu', 'Expired'],
    ['cancelled', 'İptal Edildi', 'Cancelled'],
    ['counter_offered', 'Karşı Teklif Yapıldı', 'Counter Offered'],
  ];
  it.each(shared)('ortak statü %s TR/EN web ile aynı', (s, tr, en) => {
    expect(formatOfferStatus(s)).toBe(tr);
    expect(formatOfferStatus(s, 'en')).toBe(en);
  });
  // SAPMA (ters yön): mobile format.ts:187 'countered' map'li → "Karşı Teklif Yapıldı";
  // web KAYNAK (format.ts:201-208) yalnız 'counter_offered'ı map'ler → 'countered' çiğ "Countered".
  it('countered: mobile "Karşı Teklif Yapıldı" (web çiğ "Countered" → SAPMA R-PAR-3)', () => {
    expect(formatOfferStatus('countered')).toBe('Karşı Teklif Yapıldı'); // mobile map'li
    expect(formatOfferStatus('countered', 'en')).toBe('Countered'); // mobile map EN "Countered"
    // Web beklenen: map yok → TR'de bile "Countered" (çiğ title-case).
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PAR-044 — Kargo (shipment) statü etiketleri web↔mobile aynı (tam parite)
// ─────────────────────────────────────────────────────────────────────────────
describe('PAR-044 [P2] — shipment statü etiketleri web↔mobile aynı (parite sağlanmış)', () => {
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
  it.each(all)('%s → TR/EN web ile birebir aynı', (s, tr, en) => {
    expect(formatShipmentStatus(s)).toBe(tr);
    expect(formatShipmentStatus(s, 'en')).toBe(en);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PAR-002 — Kopyalanmış format helper'ları senkron mu? (üç SAPMA birlikte)
// ─────────────────────────────────────────────────────────────────────────────
describe('PAR-002 [P1] — format.ts↔format.ts senkron mu (üç bilinen SAPMA)', () => {
  it('R-PAR-1 (at_warehouse), R-PAR-2 (deleted), R-PAR-3 (countered) sapmaları hâlâ mevcut', () => {
    // 1) at_warehouse — mobile çiğ, web "Depoda"
    expect(formatTradeStatus('at_warehouse')).toBe('At warehouse');
    // 2) deleted — mobile çiğ, web "Kaldırıldı"
    expect(formatProductStatus('deleted')).toBe('Deleted');
    // 3) countered — mobile map'li, web çiğ "Countered" (mobile TR verir)
    expect(formatOfferStatus('countered')).toBe('Karşı Teklif Yapıldı');
  });
  it('ortak koşul etiketleri (formatCondition) web↔mobile aynı (parite)', () => {
    expect(formatCondition('like_new')).toBe('Yeni Gibi');
    expect(formatCondition('like_new', 'en')).toBe('Like New');
    expect(formatCondition('poor')).toBe('Kötü');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PAR-030 — Göreceli zaman yalnız mobile'da (web'de yok) — SAPMA (R-PAR-5)
// ─────────────────────────────────────────────────────────────────────────────
describe('PAR-030 [P2] — formatRelativeDate yalnız mobile\'da; web mutlak tarih (R-PAR-5)', () => {
  it('mobile göreceli zaman üretir; web format.ts\'de formatRelativeDate YOK (kaynak teyidi)', () => {
    const now = new Date();
    const twoHrAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    expect(formatRelativeDate(twoHrAgo)).toBe('2 sa önce');
    expect(formatRelativeDate(twoHrAgo, 'en')).toBe('2 hr ago');
    // Web KAYNAK: apps/web/src/lib/format.ts formatRelativeDate EXPORT ETMEZ → web mutlak tarih kullanır.
  });
  it('boş girdi → "" (crash yok)', () => {
    expect(formatRelativeDate(null)).toBe('');
    expect(formatRelativeDate(undefined)).toBe('');
    expect(formatRelativeDate('not-a-date')).toBe('');
  });
  it('7 günden eski → mutlak tarihe düşer (tr-TR long format)', () => {
    const old = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const out = formatRelativeDate(old);
    expect(out).not.toContain('önce'); // göreceli değil
    expect(out.length).toBeGreaterThan(0);
  });
});
