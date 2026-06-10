/**
 * J104 — Günlük mesaj limiti kontrolü
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

test.describe('J104 — Günlük mesaj limiti kontrolü', () => {
  test('mesaj gönderdikçe kalan hak azalır; yükseltme sonrası limit (platform) sabit kalır', async ({ request }) => {
    test.setTimeout(60_000);

    // Alıcı (mehmet) + satıcı (ahmet) + ahmet'in bir ürünü.
    const buyerToken = await apiLogin(request, USERS.buyer);
    const seller = await apiMe(request, await apiLogin(request, USERS.sellerPremium));
    const prodsRes = await request.get(`${API}/products`, { params: { sellerId: seller.id, limit: '5' } });
    const prods = (await prodsRes.json());
    const product = (prods.data ?? prods.products ?? prods)[0];
    expect(product?.id, 'ahmet ürünü bulundu').toBeTruthy();

    // 1) Konuşma aç + birkaç mesaj gönder.
    const threadRes = await request.post(`${API}/messages/threads`, {
      headers: auth(buyerToken),
      data: { recipientId: seller.id, productId: product.id, message: 'Merhaba, bu ürün müsait mi?' },
    });
    expect(threadRes.ok(), 'thread oluştu').toBeTruthy();
    const thread = await threadRes.json();
    expect(thread.id).toBeTruthy();

    const before = await (await request.get(`${API}/messages/daily-limit`, { headers: auth(buyerToken) })).json();
    expect(before.limit, 'platform günlük limiti').toBeGreaterThan(0);

    // 2) İki mesaj daha gönder → kalan hak azalmalı.
    for (const c of ['Fiyatta esneklik var mı?', 'Kargo ne zaman çıkar?']) {
      const m = await request.post(`${API}/messages/threads/${thread.id}/messages`, { headers: auth(buyerToken), data: { content: c } });
      expect(m.ok(), 'mesaj gönderildi').toBeTruthy();
    }
    const after = await (await request.get(`${API}/messages/daily-limit`, { headers: auth(buyerToken) })).json();
    expect(after.remaining, 'kalan mesaj hakkı azaldı').toBeLessThan(before.remaining);
    expect(before.remaining - after.remaining, '2 mesaj kadar düştü').toBeGreaterThanOrEqual(2);

    // 3) Üyelik yükselt (mehmet premium) — limit platform ayarı olduğu için DEĞIŞMEZ (NOT).
    const me = await apiMe(request, buyerToken);
    await ensureFreeMembership(request, buyerToken, me.id);
    await subscribeAndPay(request, buyerToken, 'premium', 'monthly');
    const afterUpgrade = await (await request.get(`${API}/messages/daily-limit`, { headers: auth(buyerToken) })).json();
    expect(afterUpgrade.limit, 'günlük limit tier-bağımsız → sabit').toBe(before.limit);

    // 4) Mesajlaşmaya devam edebilir (hâlâ hak var).
    const cont = await request.post(`${API}/messages/threads/${thread.id}/messages`, { headers: auth(buyerToken), data: { content: 'Anlaştık, teşekkürler.' } });
    expect(cont.ok(), 'mesajlaşma devam').toBeTruthy();
  });
});
