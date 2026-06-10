/**
 * SUITE J — Satıcı payout / IBAN akışları.
 * Journeyler: J2, J27, J50, J51, J89, J90.
 *
 * Gerçek backend + tarodan_test DB + (gerektiğinde) Mailhog.
 * Hibrit: tarayıcıdan sürülemeyen adımlar (ödeme bypass, hold release zamanı,
 * admin force/retry, IDOR) request fixture + dev hook'larıyla yapılır;
 * protected sayfa doğrulamasında loginViaToken kullanılır.
 *
 * ── ENDPOINT KAYNAĞI (controller'dan doğrulandı) ──────────────────────────────
 *  Banka hesabı (user.controller.ts):
 *    GET    /users/me/bank-account
 *    PATCH  /users/me/bank-account   body: UpsertBankAccountDto
 *                                    { accountHolder(2-150), iban(/^TR\d{24}$/),
 *                                      tcKimlikNo?(/^\d{11}$/), taxId?(<=20) }
 *    DELETE /users/me/bank-account
 *    NOT: service IBAN'ı normalize eder → replace(/\s/g,'').toUpperCase()
 *         AMA DTO @Matches(/^TR\d{24}$/) boşluksuz/26-haneli ister; validasyon
 *         önce çalışır, normalize sonra. Yani boşluklu IBAN DTO'da reddedilir.
 *         (Bkz. J50 step 4 yorumu.)
 *  Payout (admin.controller.ts, Roles super_admin|admin, AdminJwtAuthGuard):
 *    GET  /admin/payouts/failed
 *    POST /admin/payouts/:transferId/retry
 *    POST /admin/payouts/release/:orderId          (PaymentHold manuel release)
 *    POST /admin/payouts/release-trade/:tradeId     (TradeCashPayment erken release)
 *  Sipariş (order.controller.ts):
 *    POST /orders/:id/prepare         (satıcı: paid → preparing)
 *    POST /orders/:id/confirm-receipt (alıcı: awaiting_buyer_confirmation → completed)
 *  Admin auth: POST /auth/admin/login → { user, tokens:{accessToken,...} }
 *
 * ── DEV-HOOK / BACKDATE GEREKEN ADIMLAR ───────────────────────────────────────
 *  - PaymentHold ödeme anında 'held' + releaseAt=+holdDays oluşur. Serbest bırakma
 *    süresini "zamanı ileri sarmak" için: backdate(paymentHold.releaseAt) → geçmiş,
 *    sonra runScheduler('release-holds-due') → hold 'released'.
 *  - Order'ı confirm-receipt için 'awaiting_buyer_confirmation'a çekmek backdate ile.
 *
 * ── ERİŞİLEMEYEN ADIM (önemli sınır) ──────────────────────────────────────────
 *  PayoutTransfer KAYDININ kendisi payout.service.ts'te
 *  createPayoutsForReleasedHolds()/processPendingPayouts()/handlePayoutFailure()
 *  ile oluşur/işlenir. Bu metodlar dev.controller.ts'te HOOK'LANMAMIŞ (DevModule
 *  yalnız payment/product/trade/membership/offer scheduler'larını expose eder) ve
 *  dev/find|count|backdate generic CREATE sunmaz. Dolayısıyla testten gerçek bir
 *  PayoutTransfer satırı YARATTIRAMIYORUZ. Bu yüzden payout journeylerinde:
 *    - serbest bırakılan PaymentHold'u ('released' + doğru net tutar) DB'den assert
 *      ederek "doğru tutarda aktarım hazırlandı" adımını kanıtlıyoruz (J2/J27/J51/J89),
 *    - admin failed-list / retry endpoint'lerini gerçek-varsa o satır üstünde, yoksa
 *      kontrat (IDOR + 404) düzeyinde test ediyoruz.
 *  Her test bloğunda ilgili adım yorumla işaretlendi.
 */
import { test, expect, APIRequestContext } from '@playwright/test';
import {
  API,
  USERS,
  apiLogin,
  apiMe,
  apiFirstBuyableProduct,
  apiBuyAndPay,
  apiGetOrder,
  loginViaToken,
} from '../support/helpers';
import { backdate, dbFind, dbCount, runScheduler } from '../support/db';

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

/** Admin token (ayrı /auth/admin/login → tokens.accessToken). */
async function adminLogin(request: APIRequestContext): Promise<string> {
  const res = await request.post(`${API}/auth/admin/login`, { data: USERS.admin });
  expect(res.ok(), 'admin login').toBeTruthy();
  const body = await res.json();
  const tok = body?.tokens?.accessToken ?? body?.accessToken;
  expect(tok, 'admin accessToken').toBeTruthy();
  return tok as string;
}

/** Geçerli benzersiz TR IBAN üret (TR + 24 rakam). Format-geçerli, banka-geçerli olması gerekmez. */
function makeIban(): string {
  let digits = '';
  for (let i = 0; i < 24; i++) digits += Math.floor(Math.random() * 10);
  return 'TR' + digits;
}

/** Satıcı banka hesabını sil (varsa) — temiz başlangıç için. 404'ü yut. */
async function clearBankAccount(request: APIRequestContext, token: string): Promise<void> {
  await request.delete(`${API}/users/me/bank-account`, { headers: auth(token) }).catch(() => {});
}

/**
 * Tam satış: alıcı (buyerClean) satıcıya ait bir ürünü satın alıp öder.
 * Dönen orderId'nin PaymentHold'u 'held' olur. apiFirstBuyableProduct satıcıya
 * özel filtre vermediği için, satıcının ürününü garanti etmek adına ürün listesinden
 * sellerId eşleşeni seçeriz.
 */
async function buyFromSeller(
  request: APIRequestContext,
  buyerToken: string,
  buyerId: string,
  sellerId: string,
): Promise<{ orderId: string } | null> {
  const res = await request.get(`${API}/products`, { params: { status: 'active', limit: '50' } });
  const body = await res.json();
  const list: any[] = body?.data ?? body?.products ?? (Array.isArray(body) ? body : []);
  const p = list.find(
    (x) =>
      x.sellerId === sellerId &&
      (x.quantity == null || x.quantity > 0) &&
      !String(x.id).startsWith('membership-') &&
      !String(x.id).startsWith('boost-'),
  );
  if (!p) return null; // satıcının alınabilir aktif ürünü yoksa caller fallback yapar
  const { orderId } = await apiBuyAndPay(request, buyerToken, p.id);
  return { orderId };
}

/**
 * Held → released: releaseAt'i geçmişe çek, release-holds-due çalıştır.
 * Dönen hold 'released' olmalı.
 */
async function releaseHold(request: APIRequestContext, orderId: string): Promise<any> {
  await backdate(request, 'paymentHold', { orderId, status: 'held' }, { releaseAt: '2020-01-01T00:00:00.000Z' });
  await runScheduler(request, 'release-holds-due');
  return dbFind(request, 'paymentHold', { orderId });
}

// ════════════════════════════════════════════════════════════════════════════
// J2 — Otomatik satıcı + IBAN + satış + teslim + payout(hold) dbFind + puan
// ════════════════════════════════════════════════════════════════════════════
test.describe('J2 — Satıcı IBAN ekler, satış yapar, hold serbest bırakılır, puanlanır', () => {
  test('IBAN ekle → satış+ödeme → hold release (doğru tutar) → satıcı puanı görünür', async ({ page, request }) => {
    test.setTimeout(60_000);

    // Hazır seed satıcı (zaten isSeller). Manuel "ilan ver → otomatik satıcı" adımı
    // ürün-create akışı çok alana bağlı olduğundan, seed satıcı üzerinden ilerleriz;
    // satıcı-yükselme davranışı J50/J51'de bank-account ile birlikte ele alınıyor.
    const sellerToken = await apiLogin(request, USERS.sellerPremium);
    const seller = await apiMe(request, sellerToken);

    // 3) Para alabilmek için geçerli IBAN'lı banka hesabı ekle
    const iban = makeIban();
    const addBank = await request.patch(`${API}/users/me/bank-account`, {
      headers: auth(sellerToken),
      data: { accountHolder: 'Ahmet Yılmaz', iban, tcKimlikNo: '12345678901' },
    });
    expect(addBank.ok(), 'banka hesabı eklendi').toBeTruthy();

    // DB'den doğrula: kayıt var, IBAN normalize, isVerified=false (yeni eklendi)
    const bank = await dbFind(request, 'sellerBankAccount', { userId: seller.id });
    expect(bank?.iban).toBe(iban);
    expect(bank?.accountHolder).toBe('Ahmet Yılmaz');
    expect(bank?.isVerified).toBe(false);

    // 4) Alıcı 'Hemen Al' ile satın alıp öder
    const buyerToken = await apiLogin(request, USERS.buyerClean);
    const buyer = await apiMe(request, buyerToken);
    const bought = await buyFromSeller(request, buyerToken, buyer.id, seller.id);
    test.skip(!bought, 'Bu satıcının alınabilir aktif ürünü yok (seed durumuna bağlı)');
    const orderId = bought!.orderId;

    // 5) Satıcı siparişi 'hazırlanıyor' yapar
    const prepare = await request.post(`${API}/orders/${orderId}/prepare`, { headers: auth(sellerToken) });
    expect(prepare.ok(), 'satıcı prepare').toBeTruthy();
    const prepared = await dbFind(request, 'order', { id: orderId }, { status: true });
    expect(prepared?.status).toBe('preparing');

    // Ödeme anında 'held' PaymentHold oluştu: doğru net tutar (totalAmount - commission)
    const order = await apiGetOrder(request, sellerToken, orderId).catch(() => null);
    const heldHold = await dbFind(request, 'paymentHold', { orderId });
    expect(heldHold?.status).toBe('held');
    expect(Number(heldHold?.amount)).toBeGreaterThan(0);

    // 6+7) Teslim onayı yerine: order'ı 48h onay aşamasına çek + alıcı confirm-receipt
    //   (kargo/teslim adımları için seller-ship endpoint expose değil; aşamayı backdate'le.)
    await backdate(request, 'order', { id: orderId }, { status: 'awaiting_buyer_confirmation' });
    const confirm = await request.post(`${API}/orders/${orderId}/confirm-receipt`, { headers: auth(buyerToken) });
    expect(confirm.ok(), 'alıcı teslimi onayladı (confirm-receipt)').toBeTruthy();
    const completed = await dbFind(request, 'order', { id: orderId }, { status: true });
    expect(completed?.status).toBe('completed');

    // completeOrder hold'u released yapar (releaseAt=now). DB'den doğrula.
    const releasedHold = await dbFind(request, 'paymentHold', { orderId });
    expect(releasedHold?.status).toBe('released');
    expect(Number(releasedHold?.amount)).toBe(Number(heldHold?.amount)); // tutar değişmedi

    // 7') "Doğru tutarda ödeme aktarımı oluştu" → asıl PayoutTransfer'i
    //   createPayoutsForReleasedHolds() oluşturur; bu scheduler dev'de expose DEĞİL.
    //   Erişilemeyen adım: released hold + net tutar assert'iyle kanıtlıyoruz.
    //   (Bilgi: hold.amount = order.totalAmount - commissionAmount → netAmount adayı.)
    if (order) {
      const expectedNet = Number(order.totalAmount ?? 0) - Number(order.commissionAmount ?? 0);
      if (expectedNet > 0) expect(Number(releasedHold?.amount)).toBeCloseTo(expectedNet, 2);
    }

    // 8) Alıcı satıcıyı 5 üzerinden puanlar, satıcı puanı görünür
    const rate = await request.post(`${API}/ratings/users`, {
      headers: auth(buyerToken),
      data: { receiverId: seller.id, orderId, score: 5, comment: 'Harika satıcı' },
    });
    expect([200, 201]).toContain(rate.status());

    const statsRes = await request.get(`${API}/ratings/users/${seller.id}/stats`);
    expect(statsRes.ok(), 'satıcı puan istatistikleri').toBeTruthy();
    const stats = await statsRes.json();
    expect(stats?.totalRatings ?? 0).toBeGreaterThanOrEqual(1);
    expect(stats?.averageScore ?? 0).toBeGreaterThan(0);

    // UI: satıcı kendi profil/puanını görebiliyor (404/login değil)
    await loginViaToken(page, sellerToken);
    await page.goto(`/users/${seller.id}`).catch(() => {});
    await page.waitForLoadState('networkidle').catch(() => {});
    const bodyText = (await page.locator('body').textContent()) ?? '';
    expect(bodyText.length).toBeGreaterThan(100);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// J27 — IBAN yok → aktarım başarısız → geç IBAN ekle → admin retry → başarılı
// ════════════════════════════════════════════════════════════════════════════
test.describe('J27 — IBAN yokken aktarım başarısız, sonra düzeltilir', () => {
  test('IBAN yok satıcı satar, hold serbest kalır, IBAN eklenir, admin retry contract', async ({ request }) => {
    test.setTimeout(60_000);

    const sellerToken = await apiLogin(request, USERS.sellerBusiness);
    const seller = await apiMe(request, sellerToken);

    // 1) Banka hesabı (IBAN) OLMADAN satış: önce varsa hesabı sil.
    await clearBankAccount(request, sellerToken);
    const noBank = await dbFind(request, 'sellerBankAccount', { userId: seller.id });
    expect(noBank, 'IBAN yok (banka hesabı silindi)').toBeNull();

    // Satış + ödeme
    const buyerToken = await apiLogin(request, USERS.buyerClean);
    const buyer = await apiMe(request, buyerToken);
    const bought = await buyFromSeller(request, buyerToken, buyer.id, seller.id);
    test.skip(!bought, 'Bu satıcının alınabilir aktif ürünü yok (seed durumuna bağlı)');
    const orderId = bought!.orderId;

    // 2) Teslim onayı (awaiting → completed) → hold released
    await backdate(request, 'order', { id: orderId }, { status: 'awaiting_buyer_confirmation' });
    const confirm = await request.post(`${API}/orders/${orderId}/confirm-receipt`, { headers: auth(buyerToken) });
    expect(confirm.ok(), 'alıcı onayı').toBeTruthy();
    const hold = await dbFind(request, 'paymentHold', { orderId });
    expect(hold?.status).toBe('released');

    // 3) "Aktarım başarısız (no_bank_account)" → bu PayoutTransfer'i
    //    createPayoutsForReleasedHolds() üretir; dev'de expose DEĞİL (erişilemeyen).
    //    Kanıt: hold released AMA satıcının banka hesabı yok → payout üretildiğinde
    //    status=failed/failureReason='no_bank_account' olacağı koşulu sağlanmış durumda.
    const stillNoBank = await dbFind(request, 'sellerBankAccount', { userId: seller.id });
    expect(stillNoBank, 'aktarım anında IBAN hâlâ yok').toBeNull();

    // 4) Satıcı geç de olsa geçerli IBAN ekler
    const iban = makeIban();
    const addBank = await request.patch(`${API}/users/me/bank-account`, {
      headers: auth(sellerToken),
      data: { accountHolder: 'Ali Veli', iban, taxId: '1234567890' },
    });
    expect(addBank.ok(), 'geç IBAN eklendi').toBeTruthy();
    const bankNow = await dbFind(request, 'sellerBankAccount', { userId: seller.id });
    expect(bankNow?.iban).toBe(iban);

    // 5) Admin başarısız aktarımı yeniden dener.
    //    Gerçek PayoutTransfer üretilemediği için (scheduler expose değil) endpoint
    //    KONTRATINI test ediyoruz: admin failed-list erişilebilir; var olan bir
    //    failed transfer varsa retry pending'e çeker, yoksa 404 döner.
    const adminToken = await adminLogin(request);
    const failedRes = await request.get(`${API}/admin/payouts/failed`, { headers: auth(adminToken) });
    expect(failedRes.ok(), 'admin failed payouts listesi').toBeTruthy();
    const failedBody = await failedRes.json();
    const items: any[] = failedBody?.items ?? [];

    if (items.length > 0) {
      const transferId = items[0].id;
      const retry = await request.post(`${API}/admin/payouts/${transferId}/retry`, { headers: auth(adminToken) });
      expect(retry.ok(), 'admin retry başarılı').toBeTruthy();
      // 6) Tekrar pending'e çekildi → satıcı parasını alma yoluna girdi
      const t = await dbFind(request, 'payoutTransfer', { id: transferId }, { status: true, retryCount: true });
      expect(t?.status).toBe('pending');
      expect(t?.retryCount).toBe(0);
    } else {
      // Var olan failed transfer yok → olmayan id 404
      const retry = await request.post(`${API}/admin/payouts/00000000-0000-0000-0000-000000000000/retry`, {
        headers: auth(adminToken),
      });
      expect(retry.ok()).toBeFalsy();
      expect([400, 404]).toContain(retry.status());
    }

    // Temizlik: eklenen hesabı bırak (diğer testler clearBankAccount yapıyor zaten).
  });
});

// ════════════════════════════════════════════════════════════════════════════
// J50 — IBAN validation: TR değil / 26'dan kısa / boşluklu temizlenir
// ════════════════════════════════════════════════════════════════════════════
test.describe('J50 — IBAN doğrulama (red kontrolü + normalize)', () => {
  test('TR-değil ve kısa IBAN reddedilir; boşluksuz geçerli IBAN kaydedilir, update isVerified sıfırlar', async ({ request }) => {
    test.setTimeout(45_000);

    const sellerToken = await apiLogin(request, USERS.sellerFree);
    const seller = await apiMe(request, sellerToken);
    await clearBankAccount(request, sellerToken);

    // 2) 'TR' ile başlamayan IBAN → reddedilir (@Matches /^TR\d{24}$/)
    const notTr = await request.patch(`${API}/users/me/bank-account`, {
      headers: auth(sellerToken),
      data: { accountHolder: 'Zeynep K', iban: 'DE00123456789012345678901234'.slice(0, 26) },
    });
    expect(notTr.ok(), 'TR olmayan IBAN reddedilmeli').toBeFalsy();
    expect([400, 422]).toContain(notTr.status());

    // 3) 26 karakterden kısa IBAN (TR + 22 rakam = 24) → reddedilir
    const short = await request.patch(`${API}/users/me/bank-account`, {
      headers: auth(sellerToken),
      data: { accountHolder: 'Zeynep K', iban: 'TR' + '1'.repeat(22) },
    });
    expect(short.ok(), 'kısa IBAN reddedilmeli').toBeFalsy();
    expect([400, 422]).toContain(short.status());

    // Hâlâ kayıt yok (geçersizler kaydedilmedi)
    expect(await dbFind(request, 'sellerBankAccount', { userId: seller.id })).toBeNull();

    // 4) Geçerli IBAN: service replace(/\s/g,'') ile boşlukları TEMİZLER.
    //   ÖNEMLİ SINIR: DTO @Matches(/^TR\d{24}$/) validasyonu normalize'dan ÖNCE
    //   çalışır; "boşluklu" string DTO'da REDDEDİLİR. Yani boşluklu girdi 400 verir.
    //   Bu yüzden "boşluklu yaz → temizlenir" davranışını iki parçada kanıtlıyoruz:
    //   (a) boşluklu girdi DTO tarafından reddedilir,
    const validDigits = makeIban(); // TR + 24 rakam (boşluksuz)
    const spaced = validDigits.replace(/(.{4})/g, '$1 ').trim(); // "TR12 3456 ..."
    const spacedRes = await request.patch(`${API}/users/me/bank-account`, {
      headers: auth(sellerToken),
      data: { accountHolder: 'Zeynep K', iban: spaced },
    });
    expect(spacedRes.ok(), 'boşluklu IBAN DTO tarafından reddedilir (normalize öncesi)').toBeFalsy();
    expect([400, 422]).toContain(spacedRes.status());

    //   (b) boşluksuz hali geçerli ve kaydedilir (normalize yine de upper-case'ler).
    const ok = await request.patch(`${API}/users/me/bank-account`, {
      headers: auth(sellerToken),
      data: { accountHolder: 'Zeynep K', iban: validDigits },
    });
    expect(ok.ok(), 'boşluksuz geçerli IBAN kaydedilir').toBeTruthy();
    const saved = await dbFind(request, 'sellerBankAccount', { userId: seller.id });
    expect(saved?.iban).toBe(validDigits);
    expect(saved?.iban).not.toMatch(/\s/); // boşluk yok
    expect(saved?.isVerified).toBe(false);

    // 5) Hesabı güncelle → isVerified sıfırlanır (zaten false; doğrulanmış kabul edip
    //   sonra güncelleyince sıfırlama servis davranışını backdate ile kanıtlıyoruz).
    await backdate(request, 'sellerBankAccount', { userId: seller.id }, { isVerified: true });
    const verifiedBefore = await dbFind(request, 'sellerBankAccount', { userId: seller.id }, { isVerified: true });
    expect(verifiedBefore?.isVerified).toBe(true);

    const iban2 = makeIban();
    const upd = await request.patch(`${API}/users/me/bank-account`, {
      headers: auth(sellerToken),
      data: { accountHolder: 'Zeynep Kaya', iban: iban2 },
    });
    expect(upd.ok(), 'hesap güncellendi').toBeTruthy();
    const after = await dbFind(request, 'sellerBankAccount', { userId: seller.id });
    expect(after?.iban).toBe(iban2);
    expect(after?.accountHolder).toBe('Zeynep Kaya');
    expect(after?.isVerified).toBe(false); // güncellemede doğrulama sıfırlandı
    expect(after?.verifiedAt).toBeNull();

    await clearBankAccount(request, sellerToken);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// J51 — Banka hesabını sil / yeniden ekle (+ arada satış → hold released)
// ════════════════════════════════════════════════════════════════════════════
test.describe('J51 — Banka hesabı sil, satış olur, yeni IBAN ekle, admin retry contract', () => {
  test('hesap silinir, satış+teslim hold release eder (IBAN yok), yeni IBAN eklenir', async ({ request }) => {
    test.setTimeout(60_000);

    const sellerToken = await apiLogin(request, USERS.sellerPremium);
    const seller = await apiMe(request, sellerToken);

    // 1) Banka hesabını sil (varsa). Sonra tekrar sil → 404 (idempotent değil, yok artık)
    // Önce bir hesap kur ki silme anlamlı olsun.
    await request.patch(`${API}/users/me/bank-account`, {
      headers: auth(sellerToken),
      data: { accountHolder: 'Ahmet Yılmaz', iban: makeIban() },
    });
    const del = await request.delete(`${API}/users/me/bank-account`, { headers: auth(sellerToken) });
    expect(del.ok(), 'banka hesabı silindi').toBeTruthy();
    expect(await dbFind(request, 'sellerBankAccount', { userId: seller.id })).toBeNull();

    // Tekrar sil → kayıt yok → 404
    const delAgain = await request.delete(`${API}/users/me/bank-account`, { headers: auth(sellerToken) });
    expect(delAgain.ok()).toBeFalsy();
    expect([400, 404]).toContain(delAgain.status());

    // 2) Bu sırada bir ürün satıldı ve ödendi, teslim onaylandı
    const buyerToken = await apiLogin(request, USERS.buyerClean);
    const buyer = await apiMe(request, buyerToken);
    const bought = await buyFromSeller(request, buyerToken, buyer.id, seller.id);
    test.skip(!bought, 'Bu satıcının alınabilir aktif ürünü yok (seed durumuna bağlı)');
    const orderId = bought!.orderId;

    await backdate(request, 'order', { id: orderId }, { status: 'awaiting_buyer_confirmation' });
    const confirm = await request.post(`${API}/orders/${orderId}/confirm-receipt`, { headers: auth(buyerToken) });
    expect(confirm.ok(), 'alıcı onayı').toBeTruthy();

    // 3) Bekleme süresi dolunca IBAN olmadığı için aktarım başarısız olur:
    //   hold released, banka hesabı yok → payout üretildiğinde 'failed' olacak koşul.
    //   (PayoutTransfer üretimi scheduler expose değil — erişilemeyen adım.)
    const hold = await dbFind(request, 'paymentHold', { orderId });
    expect(hold?.status).toBe('released');
    expect(await dbFind(request, 'sellerBankAccount', { userId: seller.id })).toBeNull();

    // 4) Satıcı yeni IBAN'lı hesabını ekler
    const iban = makeIban();
    const add = await request.patch(`${API}/users/me/bank-account`, {
      headers: auth(sellerToken),
      data: { accountHolder: 'Ahmet Yılmaz', iban },
    });
    expect(add.ok(), 'yeni IBAN eklendi').toBeTruthy();
    const bank = await dbFind(request, 'sellerBankAccount', { userId: seller.id });
    expect(bank?.iban).toBe(iban);

    // 5) Admin başarısız aktarımı yeniden denetir → kontrat (failed-list erişilir).
    const adminToken = await adminLogin(request);
    const failedRes = await request.get(`${API}/admin/payouts/failed`, { headers: auth(adminToken) });
    expect(failedRes.ok(), 'admin failed listesi erişilebilir').toBeTruthy();
    const items: any[] = (await failedRes.json())?.items ?? [];
    if (items.length > 0) {
      const retry = await request.post(`${API}/admin/payouts/${items[0].id}/retry`, { headers: auth(adminToken) });
      expect(retry.ok(), 'admin retry').toBeTruthy();
    }

    await clearBankAccount(request, sellerToken);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// J89 — 3 deneme kalıcı fail → admin listeler → admin retry başlatır
// ════════════════════════════════════════════════════════════════════════════
test.describe('J89 — Payout 3 denemeden sonra kalıcı başarısız, admin yeniden başlatır', () => {
  test('failed-list erişilir; var olan failed transfer retry ile pending olur; IDOR engellenir', async ({ request }) => {
    test.setTimeout(45_000);

    const adminToken = await adminLogin(request);

    // 1-3) "3 deneme sonrası kalıcı failed" → handlePayoutFailure(retryCount>=maxRetries=3)
    //   içinde olur; bu süreç (processPendingPayouts/handlePayoutFailure) dev'de
    //   expose DEĞİL ve gerçek PayTR transfer API çağrısı gerektirir → testten
    //   kalıcı-fail ürettiremiyoruz (erişilemeyen adım). Bunun yerine:
    //   4) Admin başarısız aktarımları LİSTELER (kontrat) ve
    //   5) varsa bir failed transfer'i retry ile yeniden başlatır.
    const failedRes = await request.get(`${API}/admin/payouts/failed`, {
      headers: auth(adminToken),
      params: { page: '1', limit: '20' },
    });
    expect(failedRes.ok(), 'admin failed payouts listesi 200').toBeTruthy();
    const body = await failedRes.json();
    expect(body).toHaveProperty('items');
    expect(Array.isArray(body.items)).toBe(true);
    expect(body).toHaveProperty('total');

    // Listelenen her transfer gerçekten failed/returned olmalı (maxRetries=3 sonrası)
    for (const it of body.items as any[]) {
      expect(['failed', 'returned']).toContain(it.status);
    }

    // 5) IDOR: admin OLMAYAN biri (normal satıcı tokenı) retry/list deneyemez
    const sellerToken = await apiLogin(request, USERS.sellerPremium);
    const idorList = await request.get(`${API}/admin/payouts/failed`, { headers: auth(sellerToken) });
    expect(idorList.ok(), 'normal kullanıcı admin failed-list erişemez').toBeFalsy();
    expect([401, 403]).toContain(idorList.status());

    const idorRetry = await request.post(
      `${API}/admin/payouts/00000000-0000-0000-0000-000000000000/retry`,
      { headers: auth(sellerToken) },
    );
    expect(idorRetry.ok(), 'normal kullanıcı retry edemez').toBeFalsy();
    expect([401, 403]).toContain(idorRetry.status());

    // Admin retry: gerçek failed varsa pending'e çek; yoksa olmayan id → 404
    if ((body.items as any[]).length > 0) {
      const transferId = (body.items as any[])[0].id;
      const retry = await request.post(`${API}/admin/payouts/${transferId}/retry`, { headers: auth(adminToken) });
      expect(retry.ok(), 'admin retry başlattı').toBeTruthy();
      const t = await dbFind(request, 'payoutTransfer', { id: transferId }, { status: true, retryCount: true, failureReason: true });
      expect(t?.status).toBe('pending'); // retryPayoutTransfer → pending, retryCount=0
      expect(t?.retryCount).toBe(0);
      expect(t?.failureReason).toBeNull();
    } else {
      const retry = await request.post(
        `${API}/admin/payouts/00000000-0000-0000-0000-000000000000/retry`,
        { headers: auth(adminToken) },
      );
      expect(retry.ok()).toBeFalsy();
      expect([400, 404]).toContain(retry.status());
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// J90 — Admin takas-nakit erken serbest + IDOR
// ════════════════════════════════════════════════════════════════════════════
test.describe('J90 — Admin trade cash hold erken release + IDOR', () => {
  test('admin release-trade endpoint contract; admin olmayan/olmayan trade reddedilir', async ({ request }) => {
    test.setTimeout(45_000);

    const adminToken = await adminLogin(request);

    // 1-2) "Nakit farklı takas tamamlandı, fark emanette bekletildi, taraf erken talep etti":
    //   tam safe-trade nakit akışı (initiate-trade → accept → cash-payment/initiate →
    //   ship → confirm-receipt → TradeCashPayment 'completed' + holdReleaseAt) çok adımlı
    //   ve gerçek ödeme gerektirir; bu suite'in odağı admin release-trade kontratıdır.
    //   Var olan (seed/önceki testlerden) bir TradeCashPayment'i DB'den arayıp,
    //   yoksa endpoint'i kontrat düzeyinde (404 + IDOR) test ederiz.
    const tcp = await dbFind(
      request,
      'tradeCashPayment',
      { status: 'completed', releasedAt: null, refundedAt: null },
      { tradeId: true, id: true },
    );

    // 4) IDOR: admin OLMAYAN biri release-trade çağıramaz (Roles guard).
    const sellerToken = await apiLogin(request, USERS.sellerPremium);
    const idorTradeId = tcp?.tradeId ?? '00000000-0000-0000-0000-000000000000';
    const idor = await request.post(`${API}/admin/payouts/release-trade/${idorTradeId}`, {
      headers: auth(sellerToken),
    });
    expect(idor.ok(), 'admin olmayan trade cash release edemez (IDOR)').toBeFalsy();
    expect([401, 403]).toContain(idor.status());

    if (tcp?.tradeId) {
      // 3) Admin nakit bekletmeyi erken serbest bırakır
      const rel = await request.post(`${API}/admin/payouts/release-trade/${tcp.tradeId}`, {
        headers: auth(adminToken),
      });
      expect(rel.ok(), 'admin trade cash erken release').toBeTruthy();

      // 5) "Alacaklı parasını aldı" → TradeCashPayment.releasedAt dolu
      const after = await dbFind(request, 'tradeCashPayment', { tradeId: tcp.tradeId }, { releasedAt: true });
      expect(after?.releasedAt).not.toBeNull();

      // İdempotency: ikinci release → "zaten serbest" (success, yeni iş yok)
      const rel2 = await request.post(`${API}/admin/payouts/release-trade/${tcp.tradeId}`, {
        headers: auth(adminToken),
      });
      expect(rel2.ok(), 'tekrar release idempotent başarı').toBeTruthy();
    } else {
      // Erişilebilir bir held trade cash yok → olmayan trade için admin 404
      const rel = await request.post(
        `${API}/admin/payouts/release-trade/00000000-0000-0000-0000-000000000000`,
        { headers: auth(adminToken) },
      );
      expect(rel.ok()).toBeFalsy();
      expect([400, 404]).toContain(rel.status());
    }
  });
});
