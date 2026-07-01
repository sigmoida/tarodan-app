/**
 * Domain 25 — Frontend Parite (PAR): üyelik limiti / yetki-kapısı paritesi (mobile tarafı).
 *
 * Mobile limitleri `apps/mobile/src/stores/authStore.ts` (TIER_LIMITS) ve
 * `apps/mobile/src/utils/membershipLimits.ts` içinde tanımlıdır. Web karşılığı
 * `apps/web/src/app/profile/page.tsx` (MEMBERSHIP_PLANS) ve authStore'da tanımlıdır.
 * Web değerleri buraya KAYNAK KODUNDAN literal olarak yazılmıştır (satır no'ları
 * yorumda) — mobile jest ortamına web modülü import edilemez.
 *
 * SAPMA: R-PAR-9 (ilan limitleri), R-PAR-10 (yorum karakter limiti).
 * Bkz. docs/TEST-KNOWN-GAPS.md → "25 — Frontend Parite (PAR)".
 */
import { FREE_MEMBER_LIMITS, PREMIUM_MEMBER_LIMITS } from '../membershipLimits';

// ─────────────────────────────────────────────────────────────────────────────
// PAR-060 — İlan limiti gösterimi web↔mobile FARKLI (büyük sapma, R-PAR-9)
// ─────────────────────────────────────────────────────────────────────────────
describe('PAR-060 [P0] — ilan limiti web↔mobile SAPMA (R-PAR-9)', () => {
  // Mobile: authStore.ts TIER_LIMITS.free.maxListings=10, basic=25 (membershipLimits.ts:16 = free 10).
  // Web KAYNAK: profile/page.tsx:79 free { maxFreeListings:5, maxTotalListings:10 };
  //             :80 basic { maxFreeListings:15, maxTotalListings:50 }.
  it('FREE mobile tek limit maxListings=10; web 5/10 ikili → SAPMA', () => {
    expect(FREE_MEMBER_LIMITS.maxListings).toBe(10);
    // Web FREE beklenen: maxFreeListings=5, maxTotalListings=10 (mobile\'da "5" karşılığı YOK).
    const WEB_FREE_MAX_FREE = 5;
    const WEB_FREE_MAX_TOTAL = 10;
    // Mobile tek sayı web\'in "ücretsiz ilan" kısmıyla eşleşMEZ (5 ≠ 10):
    expect(FREE_MEMBER_LIMITS.maxListings).not.toBe(WEB_FREE_MAX_FREE);
    // Toplam ile tesadüfen eşleşir ama semantik farklı (mobile "kalan ilan" hesabı tek sayı üzerinden):
    expect(FREE_MEMBER_LIMITS.maxListings).toBe(WEB_FREE_MAX_TOTAL);
  });

  it('Premium mobile maxListings=-1 (sınırsız); web maxTotalListings=200 (sonlu) → SAPMA', () => {
    expect(PREMIUM_MEMBER_LIMITS.maxListings).toBe(-1);
    // Web KAYNAK profile/page.tsx:81 premium maxTotalListings=200 → aynı kullanıcı web\'de sonlu görür.
    const WEB_PREMIUM_MAX_TOTAL = 200;
    expect(PREMIUM_MEMBER_LIMITS.maxListings).not.toBe(WEB_PREMIUM_MAX_TOTAL);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PAR-061 — Yorum karakter limiti: mobile üyelik-bazlı, web sabit (R-PAR-10)
// ─────────────────────────────────────────────────────────────────────────────
describe('PAR-061 [P1] — yorum karakter limiti web↔mobile SAPMA (R-PAR-10)', () => {
  // Mobile: FREE 500, Premium 2000 (membershipLimits.ts:19,38).
  // Web KAYNAK: orders/page.tsx textarea maxLength=500 SABİT (tier yansımaz).
  it('mobile FREE maxReviewChars=500, Premium=2000 (üyelik-bazlı)', () => {
    expect(FREE_MEMBER_LIMITS.maxReviewChars).toBe(500);
    expect(PREMIUM_MEMBER_LIMITS.maxReviewChars).toBe(2000);
  });
  it('Premium mobile 2000 ≠ web sabit 500 → aynı kullanıcı iki istemcide farklı limit', () => {
    const WEB_FIXED_MAX = 500;
    expect(PREMIUM_MEMBER_LIMITS.maxReviewChars).not.toBe(WEB_FIXED_MAX);
    // Not: API tarafı @MaxLength(1000) (bkz. TEST-KNOWN-GAPS RAT-123) → mobile 2000 aslında API\'de de 400 riski.
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PAR-062 — canTrade: FREE engelli, Premium açık — iki istemcide aynı kapı (parite)
// ─────────────────────────────────────────────────────────────────────────────
describe('PAR-062 [P1] — canTrade FREE engel / Premium açık (web ile aynı karar)', () => {
  it('mobile FREE canTrade=false, Premium=true', () => {
    expect(FREE_MEMBER_LIMITS.canTrade).toBe(false);
    expect(PREMIUM_MEMBER_LIMITS.canTrade).toBe(true);
  });
  // Web KAYNAK profile/page.tsx:79 free canTrade:false, :81 premium canTrade:true → aynı kapı, parite sağlanmış.
  it('web FREE/Premium canTrade değerleriyle mutabık (false/true)', () => {
    const WEB_FREE_CAN_TRADE = false;
    const WEB_PREMIUM_CAN_TRADE = true;
    expect(FREE_MEMBER_LIMITS.canTrade).toBe(WEB_FREE_CAN_TRADE);
    expect(PREMIUM_MEMBER_LIMITS.canTrade).toBe(WEB_PREMIUM_CAN_TRADE);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PAR-063 — canCreateCollections: FREE engel, Premium açık (parite)
// ─────────────────────────────────────────────────────────────────────────────
describe('PAR-063 [P2] — canCreateCollections FREE engel / Premium açık (web ile aynı)', () => {
  it('mobile FREE canCreateCollections=false, Premium=true; web ile aynı (false/true)', () => {
    expect(FREE_MEMBER_LIMITS.canCreateCollections).toBe(false);
    expect(PREMIUM_MEMBER_LIMITS.canCreateCollections).toBe(true);
    // Web KAYNAK profile/page.tsx:79/81 canCreateCollections false/true → parite.
    expect(FREE_MEMBER_LIMITS.canCreateCollections).toBe(false);
    expect(PREMIUM_MEMBER_LIMITS.canCreateCollections).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PAR-064 — maxValuePerListing mobile'da verified durumunu yansıtmaz (R-PAR-11 RİSK)
// ─────────────────────────────────────────────────────────────────────────────
describe('PAR-064 [P2] — maxValuePerListing sabit; verified\'a göre artmaz (R-PAR-11 RİSK)', () => {
  // membershipLimits.ts:20 FREE maxValuePerListing=5000 SABİT (yorumda "increases to 5000 when verified"
  // dese de tek sabit değer var; verified state\'i limiti değiştirmez → API\'den gelmeli).
  it('mobile FREE maxValuePerListing=5000 (sabit, verified state\'ten bağımsız)', () => {
    expect(FREE_MEMBER_LIMITS.maxValuePerListing).toBe(5000);
  });
  it('Premium sabit 50000 (yine istemci-sabiti; API-kaynaklı olması beklenir → RİSK)', () => {
    expect(PREMIUM_MEMBER_LIMITS.maxValuePerListing).toBe(50000);
  });
});
