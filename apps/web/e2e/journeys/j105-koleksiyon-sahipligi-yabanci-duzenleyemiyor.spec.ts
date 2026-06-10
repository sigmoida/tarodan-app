/**
 * J105 — Koleksiyon sahipliği: yabancı düzenleyemiyor
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

test.describe('J105 — Koleksiyon sahipliği: yabancı düzenleyemiyor', () => {
  test('yabancı update/item-ekle/delete denemeleri 403; sahibi günceller+siler', async ({ request }) => {
    test.setTimeout(60_000);

    // 1) Üye (ceren) koleksiyon oluştur + ürün ekle.
    const ownerToken = await apiLogin(request, USERS.newMember);
    const owner = await apiMe(request, ownerToken);
    // ceren free olabilir; koleksiyon hakkı için premium yap (free koleksiyon açamaz).
    await ensureFreeMembership(request, ownerToken, owner.id);
    await subscribeAndPay(request, ownerToken, 'premium', 'monthly');

    const col = await (await request.post(`${API}/collections`, { headers: auth(ownerToken), data: { name: `J105 IDOR ${Date.now()}`, isPublic: true } })).json();
    expect(col.id).toBeTruthy();
    const it = await request.post(`${API}/collections/${col.id}/items`, { headers: auth(ownerToken), data: { customTitle: 'Sahibin ürünü' } });
    expect(it.ok()).toBeTruthy();

    // 2) Yabancı (mehmet) koleksiyonu güncellemeye çalıştı → 403.
    const strangerToken = await apiLogin(request, USERS.buyer);
    const updIdor = await request.patch(`${API}/collections/${col.id}`, { headers: auth(strangerToken), data: { name: 'ele geçirildi' } });
    expect(updIdor.ok()).toBeFalsy();
    expect([403, 404]).toContain(updIdor.status());

    // 3) Yabancı koleksiyona ürün eklemeye çalıştı → 403.
    const addIdor = await request.post(`${API}/collections/${col.id}/items`, { headers: auth(strangerToken), data: { customTitle: 'izinsiz' } });
    expect(addIdor.ok()).toBeFalsy();
    expect([403, 404]).toContain(addIdor.status());

    // Yabancı silme de engellenmeli (ek IDOR kontrolü).
    const delIdor = await request.delete(`${API}/collections/${col.id}`, { headers: auth(strangerToken) });
    expect(delIdor.ok()).toBeFalsy();
    expect([403, 404]).toContain(delIdor.status());

    // Sahibi adını değiştirmeden önce: koleksiyon hâlâ orijinal ad (IDOR yazmadı).
    const stillOriginal = await (await request.get(`${API}/collections/${col.id}`, { headers: auth(ownerToken) })).json();
    expect(stillOriginal.name).toBe(col.name);

    // 4) Sahibi adını güncelledi, sonra koleksiyonu sildi.
    const newName = `J105 Güncel ${Date.now()}`;
    const upd = await request.patch(`${API}/collections/${col.id}`, { headers: auth(ownerToken), data: { name: newName } });
    expect(upd.ok()).toBeTruthy();
    expect((await upd.json()).name).toBe(newName);

    const del = await request.delete(`${API}/collections/${col.id}`, { headers: auth(ownerToken) });
    expect([200, 204]).toContain(del.status());
    const afterDelete = await request.get(`${API}/collections/${col.id}`, { headers: auth(ownerToken) });
    expect(afterDelete.ok(), 'silinen koleksiyon bulunamaz').toBeFalsy();
  });
});
