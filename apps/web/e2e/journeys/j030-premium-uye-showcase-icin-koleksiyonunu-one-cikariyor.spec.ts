/**
 * J30 — Premium üye showcase için koleksiyonunu öne çıkarıyor
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

test.describe('J30 — Premium üye showcase için koleksiyonunu öne çıkarıyor', () => {
  test('premium abone → 2 koleksiyon → public → beğeni → biri silinir, diğeri güncellenir', async ({ request }) => {
    test.setTimeout(60_000);

    // 1) Üye premium pakete abone oldu (ali — business uygun ama showcase için premium).
    const token = await apiLogin(request, USERS.sellerBusiness);
    const me = await apiMe(request, token);
    await ensureFreeMembership(request, token, me.id);
    await subscribeAndPay(request, token, 'premium', 'monthly');
    const mem = await dbFind(request, 'userMembership', { userId: me.id }, { status: true, tier: { select: { type: true } } });
    expect(mem.status).toBe('active');
    expect(mem.tier.type).toBe('premium');

    // 2) İki koleksiyon oluştur + ürün ekle.
    const colA = await (await request.post(`${API}/collections`, { headers: auth(token), data: { name: `J30 Showcase A ${Date.now()}`, isPublic: false } })).json();
    const colB = await (await request.post(`${API}/collections`, { headers: auth(token), data: { name: `J30 Showcase B ${Date.now()}`, isPublic: false } })).json();
    expect(colA.id && colB.id).toBeTruthy();
    for (const t of ['Tomica Skyline', 'Maisto Lambo', 'Greenlight GTO']) {
      const r = await request.post(`${API}/collections/${colA.id}/items`, { headers: auth(token), data: { customTitle: t } });
      expect(r.ok()).toBeTruthy();
    }
    const colAFull = await (await request.get(`${API}/collections/${colA.id}`, { headers: auth(token) })).json();
    expect(colAFull.itemCount).toBeGreaterThanOrEqual(3);

    // 3) Koleksiyonları herkese açık yap (vitrin/paylaşım).
    await request.patch(`${API}/collections/${colA.id}`, { headers: auth(token), data: { isPublic: true } });
    await request.patch(`${API}/collections/${colB.id}`, { headers: auth(token), data: { isPublic: true } });
    expect((await (await request.get(`${API}/collections/${colA.id}`)).json()).isPublic).toBe(true);

    // 4) Diğer kullanıcılar beğendi.
    const fan1 = await apiLogin(request, USERS.buyer);       // mehmet
    const fan2 = await apiLogin(request, USERS.buyerClean);  // deniz
    const l1 = await (await request.post(`${API}/collections/${colA.id}/like`, { headers: auth(fan1), data: {} })).json();
    const l2 = await (await request.post(`${API}/collections/${colA.id}/like`, { headers: auth(fan2), data: {} })).json();
    expect(l1.liked && l2.liked).toBe(true);
    expect(l2.likeCount, 'iki beğeni').toBeGreaterThanOrEqual(2);

    // 5) Üye bir koleksiyonunu sildi (B), diğerini (A) güncelledi.
    const del = await request.delete(`${API}/collections/${colB.id}`, { headers: auth(token) });
    expect([200, 204]).toContain(del.status());
    const gone = await request.get(`${API}/collections/${colB.id}`, { headers: auth(token) });
    expect(gone.ok(), 'silinen koleksiyon bulunamaz').toBeFalsy();

    const upd = await request.patch(`${API}/collections/${colA.id}`, { headers: auth(token), data: { description: 'Vitrin güncellendi' } });
    expect(upd.ok()).toBeTruthy();
    expect((await upd.json()).description).toBe('Vitrin güncellendi');

    // 6) Beğeniler korundu (akış tamamlandı).
    const finalA = await (await request.get(`${API}/collections/${colA.id}`)).json();
    expect(finalA.likeCount).toBeGreaterThanOrEqual(2);
  });
});
