/**
 * J50 — Satıcı IBAN'ını birkaç kez hatalı giriyor
 * Kaynak: suite-j-payout.spec.ts (otomatik ayrıştırıldı). Tek senaryo = tek dosya.
 */
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
// J50-UI — Tarayıcı üzerinden hatalı IBAN toast + geçerli IBAN kayıt akışı
// ════════════════════════════════════════════════════════════════════════════

test.describe('J50-UI — IBAN sayfası UI akışı', () => {
  test('UI: hatalı IBAN toast görünür; geçerli IBAN kaydedilir', async ({ page, request }) => {
    test.setTimeout(60_000);

    // Temiz başlangıç: önceki çalışmadan kalan banka hesabı varsa sil.
    const sellerToken = await apiLogin(request, USERS.sellerFree);
    await clearBankAccount(request, sellerToken);

    // Tarayıcıya token enjekte et, ardından sayfaya git.
    await loginViaToken(page, sellerToken);
    await page.goto('/profile/bank-account');

    // Sayfa yüklenene kadar bekle (form görünmeli).
    const holderInput = page.getByPlaceholder('Ad Soyad / Firma Ünvanı');
    await holderInput.waitFor({ state: 'visible', timeout: 15_000 });

    // Hesap sahibi alanını doldur.
    await holderInput.fill('');
    await holderInput.fill('Zeynep Kaya');

    // Hatalı IBAN gir ve kaydet.
    const ibanInput = page.getByPlaceholder('TR.. .... .... .... .... .... ..');
    await ibanInput.fill('');
    await ibanInput.fill('TR123');

    const saveBtn = page.getByRole('button', { name: /Kaydet|Güncelle/ });
    await saveBtn.click();

    // Hata toastı görünmeli.
    await expect(page.getByText('Geçerli bir TR IBAN', { exact: false })).toBeVisible({ timeout: 8_000 });

    // Geçerli IBAN gir (mod-97 checksum'ı geçen gerçek-format TR IBAN, boşluklu → sayfa normalize eder).
    await ibanInput.fill('');
    await ibanInput.fill('TR33 0006 1005 1978 6457 8413 26');

    await saveBtn.click();

    // Başarı toastı görünmeli.
    await expect(page.getByText('Banka hesabı kaydedildi', { exact: false })).toBeVisible({ timeout: 12_000 });

    // Temizlik.
    await clearBankAccount(request, sellerToken);
  });
});
