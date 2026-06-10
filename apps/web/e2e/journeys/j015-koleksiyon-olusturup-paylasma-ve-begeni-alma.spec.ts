/**
 * J15 — Koleksiyon oluşturup paylaşma ve beğeni alma
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

test.describe('J15 — Koleksiyon oluşturup paylaşma ve beğeni alma', () => {
  test('premium oluşturur+ürün ekler+public yapar; başkası beğenir; yabancı eklenemez', async ({ request }) => {
    test.setTimeout(60_000);

    // 1) Premium üye (ahmet) giriş + yeni koleksiyon oluştur.
    const ownerToken = await apiLogin(request, USERS.sellerPremium);
    const owner = await apiMe(request, ownerToken);
    const colName = `J15 Vitrin ${Date.now()}`;
    const createRes = await request.post(`${API}/collections`, {
      headers: auth(ownerToken),
      data: { name: colName, description: 'Diecast vitrin', isPublic: false },
    });
    expect(createRes.ok(), 'koleksiyon oluştu').toBeTruthy();
    const col = await createRes.json();
    expect(col.id).toBeTruthy();
    expect(col.isPublic, 'önce gizli').toBe(false);

    // 2) Koleksiyona kendi ürünlerinden ekle (custom item — ürün DTO'su gerekmeden).
    const item1 = await request.post(`${API}/collections/${col.id}/items`, {
      headers: auth(ownerToken),
      data: { customTitle: 'Ferrari F40', customBrand: 'Bburago' },
    });
    expect(item1.ok(), 'item eklendi').toBeTruthy();
    const item2 = await request.post(`${API}/collections/${col.id}/items`, {
      headers: auth(ownerToken),
      data: { customTitle: 'Porsche 911', customBrand: 'Minichamps' },
    });
    expect(item2.ok()).toBeTruthy();
    const afterItems = await (await request.get(`${API}/collections/${col.id}`, { headers: auth(ownerToken) })).json();
    expect(afterItems.itemCount, '2 öğe').toBeGreaterThanOrEqual(2);

    // 3) Koleksiyonu herkese açık yap.
    const pubRes = await request.patch(`${API}/collections/${col.id}`, { headers: auth(ownerToken), data: { isPublic: true } });
    expect(pubRes.ok()).toBeTruthy();
    expect((await pubRes.json()).isPublic, 'public oldu').toBe(true);

    // Paylaşım: slug ile auth'suz erişilebilir.
    const slug = afterItems.slug;
    const bySlug = await request.get(`${API}/collections/slug/${slug}`);
    expect(bySlug.ok(), 'slug ile public erişim').toBeTruthy();
    expect((await bySlug.json()).id).toBe(col.id);

    // 4) Başka bir üye (mehmet) koleksiyonu gezer ve beğenir.
    const otherToken = await apiLogin(request, USERS.buyer);
    const likeRes = await request.post(`${API}/collections/${col.id}/like`, { headers: auth(otherToken), data: {} });
    expect(likeRes.ok(), 'beğeni').toBeTruthy();
    const likeBody = await likeRes.json();
    expect(likeBody.liked).toBe(true);
    expect(likeBody.likeCount, 'likeCount 1').toBe(1);

    // 5) Sahibi koleksiyon adını güncelledi.
    const newName = `J15 Güncel ${Date.now()}`;
    const updRes = await request.patch(`${API}/collections/${col.id}`, { headers: auth(ownerToken), data: { name: newName } });
    expect(updRes.ok()).toBeTruthy();
    expect((await updRes.json()).name).toBe(newName);

    // 6) Yabancı koleksiyona ürün eklemeye çalıştı → engellendi (403).
    const intrude = await request.post(`${API}/collections/${col.id}/items`, {
      headers: auth(otherToken),
      data: { customTitle: 'izinsiz ekleme' },
    });
    expect(intrude.ok()).toBeFalsy();
    expect([403, 404]).toContain(intrude.status());

    // 7) Koleksiyon herkese açık listede görünmeye devam etti (browse).
    //    Benzersiz TAM ad ile ara (paylaşılan prefix re-run'larda çoğalıp sayfalamada kaybolur).
    //    Kısa poll: browse listesi anlık tutarsız olabilir.
    await expect.poll(async () => {
      const browse = await request.get(`${API}/collections/browse`, { params: { search: newName, pageSize: '50' } });
      const browseBody = await browse.json();
      return (browseBody.collections ?? []).some((c: any) => c.id === col.id);
    }, { timeout: 8000, message: 'koleksiyon browse listesinde görünmeli' }).toBe(true);
  });
});
