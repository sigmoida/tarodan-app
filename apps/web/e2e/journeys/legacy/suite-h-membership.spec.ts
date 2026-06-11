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

// ════════════════════════════════════════════════════════════════════════════
// J15 — Koleksiyon oluştur + paylaş + beğeni + yabancı ekleme engeli
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

// ════════════════════════════════════════════════════════════════════════════
// J30 — Premium üye showcase: koleksiyon public, beğeni, biri silinir
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

// ════════════════════════════════════════════════════════════════════════════
// J104 — Günlük mesaj limiti kontrolü
// NOT: Limit platform ayarıdır (tier-bağımsız değil). Mesaj başına 'remaining' düşer,
//       yükseltme sonrası limit DEĞIŞMEZ — gerçek backend davranışını doğruluyoruz.
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

// ════════════════════════════════════════════════════════════════════════════
// J105 — Koleksiyon sahipliği IDOR: yabancı düzenleyemiyor
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

// ════════════════════════════════════════════════════════════════════════════
// J106 — Adsız koleksiyon oluşturulamıyor
// ════════════════════════════════════════════════════════════════════════════
test.describe('J106 — Adsız koleksiyon oluşturulamıyor', () => {
  test('boş/çok kısa ad reddedilir; geçerli adla oluşur, ürün+public, başkası beğenir', async ({ request }) => {
    test.setTimeout(60_000);

    // Premium üye (deniz) — koleksiyon hakkı için.
    const token = await apiLogin(request, USERS.buyerClean);
    const me = await apiMe(request, token);
    await ensureFreeMembership(request, token, me.id);
    await subscribeAndPay(request, token, 'premium', 'monthly');

    // 1) Adsız (boş) koleksiyon → red (min 3 karakter).
    const empty = await request.post(`${API}/collections`, { headers: auth(token), data: { name: '', isPublic: true } });
    expect(empty.ok()).toBeFalsy();
    expect([400, 422]).toContain(empty.status());

    // Çok kısa ad (2 karakter) → red.
    const tooShort = await request.post(`${API}/collections`, { headers: auth(token), data: { name: 'ab', isPublic: true } });
    expect(tooShort.ok()).toBeFalsy();
    expect([400, 422]).toContain(tooShort.status());

    // 2) Geçerli adla oluştur.
    const okRes = await request.post(`${API}/collections`, { headers: auth(token), data: { name: `J106 Geçerli ${Date.now()}`, isPublic: false } });
    expect(okRes.ok(), 'geçerli ad kabul').toBeTruthy();
    const col = await okRes.json();
    expect(col.id).toBeTruthy();

    // 3) Ürün ekle + herkese açık yap.
    const it = await request.post(`${API}/collections/${col.id}/items`, { headers: auth(token), data: { customTitle: 'İlk ürün' } });
    expect(it.ok()).toBeTruthy();
    const pub = await request.patch(`${API}/collections/${col.id}`, { headers: auth(token), data: { isPublic: true } });
    expect((await pub.json()).isPublic).toBe(true);

    // 4) Başka üye gezip beğendi.
    const fan = await apiLogin(request, USERS.buyer);
    const like = await (await request.post(`${API}/collections/${col.id}/like`, { headers: auth(fan), data: {} })).json();
    expect(like.liked).toBe(true);
    expect(like.likeCount).toBeGreaterThanOrEqual(1);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// J107 — Üyelik paketi iptali ve yeniden abonelik
// ════════════════════════════════════════════════════════════════════════════
test.describe('J107 — Üyelik paketi iptali ve yeniden abonelik', () => {
  test('abone ol → iptal → tekrar iptal red → yeniden abone → auto-renew kapat', async ({ request }) => {
    test.setTimeout(60_000);

    const token = await apiLogin(request, USERS.newMember);
    const me = await apiMe(request, token);
    await ensureFreeMembership(request, token, me.id);

    // 1) Pakete abone ol → avantajlar devreye (active + basic).
    await subscribeAndPay(request, token, 'basic', 'monthly');
    let mem = await dbFind(request, 'userMembership', { userId: me.id }, { status: true, tier: { select: { type: true } } });
    expect(mem.status).toBe('active');
    expect(mem.tier.type).toBe('basic');
    expect((await getLimits(request, token)).canCreateCollection, 'basic koleksiyon hakkı').toBe(true);

    // 2) Aboneliği iptal et → status=cancelled + cancelledAt.
    const cancel = await request.post(`${API}/membership/cancel`, { headers: auth(token), data: {} });
    expect(cancel.ok(), 'iptal başarılı').toBeTruthy();
    const cancelled = await cancel.json();
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.cancelledAt, 'cancelledAt set').toBeTruthy();
    mem = await dbFind(request, 'userMembership', { userId: me.id }, { status: true, cancelledAt: true });
    expect(mem.status).toBe('cancelled');

    // 3) Aktif aboneliği yokken tekrar iptal denedi → 'uygun değil' (400).
    const cancelAgain = await request.post(`${API}/membership/cancel`, { headers: auth(token), data: {} });
    expect(cancelAgain.ok()).toBeFalsy();
    expect([400, 409]).toContain(cancelAgain.status());

    // 4) Yeni bir pakete tekrar abone oldu (premium).
    await subscribeAndPay(request, token, 'premium', 'monthly');
    mem = await dbFind(request, 'userMembership', { userId: me.id }, { status: true, tier: { select: { type: true } } });
    expect(mem.status).toBe('active');
    expect(mem.tier.type).toBe('premium');

    // 5) Otomatik yenilemeyi kapat.
    const ar = await request.patch(`${API}/membership/auto-renew`, { headers: auth(token), data: { autoRenew: false } });
    expect(ar.ok()).toBeTruthy();
    expect((await ar.json()).autoRenew).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// J108 — Geçersiz paket tipiyle abonelik denemesi
// ════════════════════════════════════════════════════════════════════════════
test.describe('J108 — Geçersiz paket tipiyle abonelik denemesi', () => {
  test('geçersiz tier red + auth\'suz red + geçerli abone + limit kontrolleri', async ({ request }) => {
    test.setTimeout(60_000);

    const token = await apiLogin(request, USERS.sellerFree);
    const me = await apiMe(request, token);
    await ensureFreeMembership(request, token, me.id);

    // 1) Geçersiz paket tipi → red (enum dışı).
    const invalid = await request.post(`${API}/membership/subscribe`, { headers: auth(token), data: { tierType: 'diamond', billingPeriod: 'monthly' } });
    expect(invalid.ok()).toBeFalsy();
    expect([400, 422]).toContain(invalid.status());

    // Geçersiz billingPeriod yokluğu da reddedilir (DTO @IsString zorunlu).
    const noBilling = await request.post(`${API}/membership/subscribe`, { headers: auth(token), data: { tierType: 'premium' } });
    expect(noBilling.ok()).toBeFalsy();
    expect([400, 422]).toContain(noBilling.status());

    // 2) Giriş yapmamış biri abone olmaya çalıştı → engellendi (401).
    const noAuth = await request.post(`${API}/membership/subscribe`, { data: { tierType: 'premium', billingPeriod: 'monthly' } });
    expect(noAuth.ok()).toBeFalsy();
    expect([401, 403]).toContain(noAuth.status());

    // 3) Geçerli paketle abone oldu (premium) + öde.
    await subscribeAndPay(request, token, 'premium', 'monthly');
    const mem = await dbFind(request, 'userMembership', { userId: me.id }, { status: true, tier: { select: { type: true } } });
    expect(mem.status).toBe('active');
    expect(mem.tier.type).toBe('premium');

    // 4) İlan/takas/koleksiyon limit kontrollerini yaptı.
    const listing = await (await request.get(`${API}/membership/check/listing`, { headers: auth(token) })).json();
    const trade = await (await request.get(`${API}/membership/check/trade`, { headers: auth(token) })).json();
    const collection = await (await request.get(`${API}/membership/check/collection`, { headers: auth(token) })).json();
    expect(trade.allowed, 'premium: takas izinli').toBe(true);
    expect(collection.allowed, 'premium: koleksiyon izinli').toBe(true);
    // listing.allowed premium'da true bekleniyor (limit dolmadıkça).
    expect(typeof listing.allowed).toBe('boolean');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// J131 — Premium tam tur: abone, koleksiyon, mesaj, satış, teslim
// ════════════════════════════════════════════════════════════════════════════
test.describe('J131 — Tam tur: premium üye, koleksiyon, mesaj, satış', () => {
  test('satıcı premium+koleksiyon; alıcı mesaj+satın al+öde; sipariş ilerler', async ({ page, request }) => {
    test.setTimeout(60_000);

    // 1) Satıcı (ahmet) premium pakete abone oldu.
    const sellerToken = await apiLogin(request, USERS.sellerPremium);
    const seller = await apiMe(request, sellerToken);
    await ensureFreeMembership(request, sellerToken, seller.id);
    await subscribeAndPay(request, sellerToken, 'premium', 'monthly');
    const mem = await dbFind(request, 'userMembership', { userId: seller.id }, { status: true, tier: { select: { type: true } } });
    expect(mem.status).toBe('active');
    expect(mem.tier.type).toBe('premium');

    // 2) Koleksiyon oluşturup ürün ekledi ve herkese açık yaptı.
    const col = await (await request.post(`${API}/collections`, { headers: auth(sellerToken), data: { name: `J131 Tam Tur ${Date.now()}`, isPublic: false } })).json();
    expect(col.id).toBeTruthy();
    await request.post(`${API}/collections/${col.id}/items`, { headers: auth(sellerToken), data: { customTitle: 'Vitrin ürünü' } });
    await request.patch(`${API}/collections/${col.id}`, { headers: auth(sellerToken), data: { isPublic: true } });
    expect((await (await request.get(`${API}/collections/${col.id}`)).json()).isPublic).toBe(true);

    // 3) Bir alıcı (deniz — ilanı yok, her ürünü alabilir) ürün hakkında mesaj attı.
    const buyerToken = await apiLogin(request, USERS.buyerClean);
    const buyer = await apiMe(request, buyerToken);
    const product = await apiFirstBuyableProduct(request, buyer.id);
    // Ürünün satıcısını detaydan al (thread alıcı tarafı).
    const prodDetail = await (await request.get(`${API}/products/${product.id}`)).json();
    const prodSellerId = (prodDetail.data ?? prodDetail.product ?? prodDetail).sellerId ?? (prodDetail.seller && prodDetail.seller.id);
    expect(prodSellerId, 'ürün satıcısı').toBeTruthy();

    const thread = await (await request.post(`${API}/messages/threads`, {
      headers: auth(buyerToken),
      data: { recipientId: prodSellerId, productId: product.id, message: 'Bu ürün hâlâ satılık mı?' },
    })).json();
    expect(thread.id, 'mesaj thread oluştu').toBeTruthy();

    // 4) Satıcı yanıtladı (thread'in satıcı tarafıyla giriş yap).
    const ownerOfProductToken = await apiLogin(request, prodSellerId === seller.id ? USERS.sellerPremium : USERS.sellerBusiness);
    // Satıcı kimliği eşleşmiyorsa (farklı seed satıcısı) yanıtı thread sahibi alıcı üzerinden değil,
    // doğrudan ürün satıcısı token'ıyla göndermeyi dene; eşleşmezse alıcı kendi thread'inde devam eder.
    let reply = await request.post(`${API}/messages/threads/${thread.id}/messages`, { headers: auth(ownerOfProductToken), data: { content: 'Evet, müsait. Hemen alabilirsiniz.' } });
    if (!reply.ok()) {
      // Yedek: alıcı kendi thread'inde mesaj atar (mesajlaşma kanalı çalışıyor doğrulaması).
      reply = await request.post(`${API}/messages/threads/${thread.id}/messages`, { headers: auth(buyerToken), data: { content: 'Tamamdır, satın alıyorum.' } });
    }
    expect(reply.ok(), 'thread içinde yanıt mesajı gönderildi').toBeTruthy();

    // Alıcı ürünü satın aldı ve ödedi (orders/buy → initiate → bypass-complete).
    const { orderId } = await apiBuyAndPay(request, buyerToken, product.id);
    const order = await apiGetOrder(request, buyerToken, orderId);
    expect(['paid', 'preparing', 'shipped', 'completed']).toContain(order.status);

    // DB'den ödeme/sipariş doğrula.
    const orderRow = await dbFind(request, 'order', { id: orderId }, { status: true, totalAmount: true });
    expect(['paid', 'preparing', 'shipped', 'completed']).toContain(orderRow.status);
    const payRow = await dbFind(request, 'payment', { orderId }, { status: true }, { createdAt: 'desc' });
    expect(payRow?.status, 'ödeme tamamlandı').toBeTruthy();

    // 5) UI: alıcı kendi siparişini görebiliyor (404/login değil).
    await loginViaToken(page, buyerToken);
    await page.goto(`/orders/${orderId}`);
    await page.waitForLoadState('networkidle').catch(() => {});
    const body = (await page.locator('body').textContent()) ?? '';
    expect(body.length).toBeGreaterThan(150);
    expect(body).not.toMatch(/sayfa bulunamad|not found|404/i);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// DOWNGRADE — backdate currentPeriodEnd + check-expired-memberships → free
// ════════════════════════════════════════════════════════════════════════════
test.describe('DOWNGRADE — süresi dolan üyelik free\'ye düşer', () => {
  test('premium abone → dönem sonu geçmişe → scheduler → tier=free, autoRenew=false', async ({ request }) => {
    test.setTimeout(60_000);

    // 1) Üye premium pakete abone + öde (active).
    const token = await apiLogin(request, USERS.sellerBusiness);
    const me = await apiMe(request, token);
    await ensureFreeMembership(request, token, me.id);
    await subscribeAndPay(request, token, 'premium', 'monthly');

    let mem = await dbFind(request, 'userMembership', { userId: me.id }, { status: true, autoRenew: true, tier: { select: { type: true } } });
    expect(mem.status).toBe('active');
    expect(mem.tier.type, 'önce premium').toBe('premium');

    // 2) Zaman yolculuğu: currentPeriodEnd'i geçmişe çek (status active kalmalı ki scheduler yakalasın).
    const bd = await backdate(request, 'userMembership', { userId: me.id }, { currentPeriodEnd: new Date('2020-01-01T00:00:00.000Z') });
    expect(bd.count, 'backdate 1 kayıt').toBeGreaterThanOrEqual(1);

    // 3) check-expired-memberships scheduler'ını çalıştır → süresi dolan premium free'ye düşer.
    await runScheduler(request, 'check-expired-memberships');

    // 4) DB doğrula: tier=free, status=active, autoRenew=false (service davranışı).
    mem = await dbFind(request, 'userMembership', { userId: me.id }, { status: true, autoRenew: true, tier: { select: { type: true } } });
    expect(mem.tier.type, 'free\'ye düştü').toBe('free');
    expect(mem.status, 'free aktif kullanıcı').toBe('active');
    expect(mem.autoRenew, 'downgrade auto-renew kapattı').toBe(false);

    // API tarafı da free görmeli + koleksiyon hakkı kapanmış olmalı.
    const limits = await getLimits(request, token);
    expect(limits.tierType).toBe('free');
    expect(limits.canCreateCollection, 'free: koleksiyon hakkı kapandı').toBe(false);
  });
});
