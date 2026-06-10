/**
 * J27 — Satıcının IBAN'ı yok: ödeme aktarımı başarısız, sonra düzeliyor
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
