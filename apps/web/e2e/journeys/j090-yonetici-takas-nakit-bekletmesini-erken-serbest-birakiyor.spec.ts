/**
 * J90 — Yönetici takas nakit bekletmesini erken serbest bırakıyor
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
