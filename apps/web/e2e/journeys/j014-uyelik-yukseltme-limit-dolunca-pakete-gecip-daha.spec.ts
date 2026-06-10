/**
 * J14 — Üyelik yükseltme: limit dolunca pakete geçip daha çok ilan
 * Kaynak: suite-h-membership.spec.ts (otomatik ayrıştırıldı). Tek senaryo = tek dosya.
 */
/**
 * SUITE H — Üyelik & Koleksiyon journey'leri (hibrit: API + UI).
 *
 * Kapsanan journey'ler:
 *   J14   — Limit dolunca pakete geç, limit açılır, auto-renew kapat.
 *   J15   — Koleksiyon CRUD + paylaş (slug/browse) + beğeni + yabancı ekleme engeli.
 *   J30   — Premium üye koleksiyonunu showcase (public) yapar, beğeni alır, biri silinir.
 *   J104  — Mesaj gönderdikçe günlük kalan hak azalır (tier-bağımsız platform limiti — NOT).
 *   J105  — Koleksiyon sahipliği IDOR: yabancı düzenleyemez/ekleyemez.
 *   J106  — Adsız / çok kısa adlı koleksiyon reddedilir (min 3 karakter).
 *   J107  — Üyelik iptali + tekrar iptal red + yeniden abone + auto-renew kapat.
 *   J108  — Geçersiz tier red + auth'suz red + geçerli abone + limit kontrolleri.
 *   J131  — Premium tam tur: abone, koleksiyon+ürün, mesaj, satın al+öde, teslim.
 *   DOWNGRADE — backdate currentPeriodEnd + check-expired-memberships → free'ye düşer.
 *
 * Gerçek backend + tarodan_test DB. Ödeme PAYMENT_BYPASS ile tamamlanır.
 *
 * Üyelik akışı (controller'dan doğrulandı):
 *   POST /membership/subscribe {tierType, billingPeriod}  → ücretli tier'da
 *     status=past_due (efektif tier=free, pendingPayment=true) + {paymentId, useBypass:true}.
 *   POST /payments/:paymentId/bypass-complete → payment-success handler üyeliği active+gerçek tier yapar.
 *   POST /membership/cancel → status=cancelled (free iptal edilemez).
 *   PATCH /membership/auto-renew {autoRenew} → autoRenew alanını günceller.
 *   GET  /membership/me, /me/limits, /check/{listing,trade,collection}.
 *
 * NOT (J104): Günlük mesaj limiti platform ayarıdır (daily_message_limit, default 50),
 *   ÜYELIK TIER'INA BAĞLI DEĞİL (messaging.service getRemainingDailyMessages). Bu yüzden
 *   "yükseltince limit artar" backend'de gerçekleşmez; testte mesaj başına 'remaining'
 *   düşüşünü ve yükseltme sonrası limitin DEĞIŞMEDIĞINI doğruluyoruz (manuel-eşdeğer + gerçek davranış).
 */
import { test, expect, APIRequestContext } from '@playwright/test';
import {
  API, USERS, loginViaToken, apiLogin, apiMe, apiFirstBuyableProduct, apiBuyAndPay, apiGetOrder, apiDefaultAddressId,
} from '../support/helpers';
import { backdate, runScheduler, dbFind, dbCount } from '../support/db';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

// ──────────────────────────── Üyelik yardımcıları ────────────────────────────

/** Üyeliği FREE'ye normalize et (cancel + downgrade scheduler) — testi re-run'a dayanıklı kılar. */
async function ensureFreeMembership(request: APIRequestContext, token: string, userId: string) {
  // Aktif/past_due paralı üyelik varsa iptal et (free zaten iptal edilemez → yut).
  await request.post(`${API}/membership/cancel`, { headers: auth(token), data: {} });
  // currentPeriodEnd'i geçmişe çek + scheduler ile free'ye indir.
  await backdate(request, 'userMembership', { userId }, { currentPeriodEnd: new Date('2020-01-01T00:00:00.000Z'), status: 'active' }).catch(() => {});
  await runScheduler(request, 'check-expired-memberships');
}

/** Ücretli tier'a abone ol + bypass ile öde → üyelik aktifleşir. paymentId döner. */
async function subscribeAndPay(
  request: APIRequestContext,
  token: string,
  tierType: 'basic' | 'premium' | 'business',
  billingPeriod: 'monthly' | 'yearly' = 'monthly',
): Promise<string> {
  const subRes = await request.post(`${API}/membership/subscribe`, {
    headers: auth(token),
    data: { tierType, billingPeriod },
  });
  expect(subRes.ok(), `subscribe ${tierType}`).toBeTruthy();
  const sub = await subRes.json();
  // Ücretli tier: ödeme bekliyor; bypass için paymentId + useBypass gelmeli.
  expect(sub.useBypass, 'PAYMENT_BYPASS açık (useBypass=true)').toBe(true);
  expect(sub.paymentId, 'subscribe paymentId döndü').toBeTruthy();

  const done = await request.post(`${API}/payments/${sub.paymentId}/bypass-complete`, { data: {} });
  expect(done.ok(), 'membership bypass-complete').toBeTruthy();
  return sub.paymentId as string;
}

async function getMembership(request: APIRequestContext, token: string) {
  const res = await request.get(`${API}/membership/me`, { headers: auth(token) });
  expect(res.ok(), 'GET membership/me').toBeTruthy();
  return res.json();
}

async function getLimits(request: APIRequestContext, token: string) {
  const res = await request.get(`${API}/membership/me/limits`, { headers: auth(token) });
  expect(res.ok(), 'GET membership/me/limits').toBeTruthy();
  return res.json();
}

async function checkCollection(request: APIRequestContext, token: string) {
  const res = await request.get(`${API}/membership/check/collection`, { headers: auth(token) });
  return res.json();
}

// ════════════════════════════════════════════════════════════════════════════
// J14 — Limit dolunca pakete geç, limit açılır, auto-renew kapat
// ════════════════════════════════════════════════════════════════════════════

test.describe('J14 — Üyelik yükseltme: limit dolunca pakete geçip daha çok hak', () => {
  test('free limit dolu → premium abone+öde → limit açılır → auto-renew kapatılır', async ({ page, request }) => {
    test.setTimeout(60_000);

    // 1) Ücretsiz üye (zeynep, seed'li ilanları var). Önce free'ye normalize et.
    const token = await apiLogin(request, USERS.sellerFree);
    const me = await apiMe(request, token);
    await ensureFreeMembership(request, token, me.id);

    // 2) Free tier durumu: tier-sabit kısıtlar (koleksiyon/takas hakkı YOK).
    //    NOT: remainingFreeListings kullanım-bağımlıdır (zeynep'in aktif ilan sayısı diğer
    //    testlerce/sweep ile değişebilir) → onu KESIN limit sinyali olarak assert ETME.
    //    "Limit dolunca yükselt"in deterministik karşılığı: free tier'da koleksiyon hakkı reddi.
    const freeMem = await getMembership(request, token);
    expect(freeMem.tier.type, 'başlangıç free').toBe('free');
    const freeLimits = await getLimits(request, token);
    expect(freeLimits.maxFreeListings, 'free ücretsiz ilan tavanı sınırlı').toBeGreaterThan(0);
    expect(freeLimits.canCreateCollection, 'free: koleksiyon hakkı yok').toBe(false);
    expect(freeLimits.canTrade, 'free: takas yok').toBe(false);
    const freeColCheck = await checkCollection(request, token);
    expect(freeColCheck.allowed, 'free: koleksiyon oluşturma reddi (limit hayır)').toBe(false);

    // 3) Paketleri incele (public tiers) → premium ücretli pakete abone ol + öde.
    const tiersRes = await request.get(`${API}/membership/tiers`);
    const tiers = await tiersRes.json();
    const premiumTier = tiers.find((t: any) => t.type === 'premium');
    expect(premiumTier?.monthlyPrice, 'premium fiyatı > 0').toBeGreaterThan(0);
    await subscribeAndPay(request, token, 'premium', 'monthly');

    // 4) Paket avantajları devreye girdi: DB'den active+premium doğrula.
    const memRow = await dbFind(request, 'userMembership', { userId: me.id }, { status: true, autoRenew: true, tier: { select: { type: true } } });
    expect(memRow.status).toBe('active');
    expect(memRow.tier.type).toBe('premium');

    const paidLimits = await getLimits(request, token);
    expect(paidLimits.tierType, 'limitler premium').toBe('premium');
    expect(paidLimits.canCreateCollection, 'premium: koleksiyon hakkı açıldı').toBe(true);
    expect(paidLimits.canTrade, 'premium: takas açıldı').toBe(true);
    // Ücretsiz slot sayısı premium'da arttı (>= free 5).
    expect(paidLimits.maxFreeListings).toBeGreaterThanOrEqual(freeLimits.maxFreeListings);
    expect(paidLimits.remainingFreeListings, 'premium ücretsiz slot tekrar açıldı').toBeGreaterThan(0);

    // 5) Koleksiyon oluşturma artık 'evet' (paket avantajı fiili kontrolü).
    const colCheck = await checkCollection(request, token);
    expect(colCheck.allowed, 'premium: koleksiyon oluşturulabilir').toBe(true);

    // 6) Otomatik yenilemeyi kapat → dönem sonunda yenilenmeyecek.
    const arRes = await request.patch(`${API}/membership/auto-renew`, { headers: auth(token), data: { autoRenew: false } });
    expect(arRes.ok(), 'auto-renew toggle').toBeTruthy();
    expect((await arRes.json()).autoRenew, 'autoRenew kapandı').toBe(false);
    const arRow = await dbFind(request, 'userMembership', { userId: me.id }, { autoRenew: true });
    expect(arRow.autoRenew, 'DB autoRenew=false').toBe(false);

    // UI doğrulama: üyelik sayfası token ile açılır (login/404 değil).
    await loginViaToken(page, token);
    await page.goto('/membership');
    await page.waitForLoadState('networkidle').catch(() => {});
    expect(((await page.locator('body').textContent()) ?? '').length).toBeGreaterThan(150);
  });
});
