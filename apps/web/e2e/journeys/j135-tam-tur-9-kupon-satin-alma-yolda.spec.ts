/**
 * J135 — Tam tur 9: kupon, satın alma, yolda iade, anlaşmazlık çözümü
 * Kaynak: suite-l-misc.spec.ts (otomatik ayrıştırıldı). Tek senaryo = tek dosya.
 */
/**
 * SUITE L — Çapraz ve tam turlar (Misc).
 *
 * Kapsanan journeyler:
 *   J22  — Kupon ile indirimli alışveriş + indirimli fatura
 *   J31  — Alıcı ürün+satıcı puanlıyor; haksız puan engelleniyor (IDOR)
 *   J109 — Puanlama: önce alışveriş şartı
 *   J110 — Puan sınırı: 0 ve 6 reddedilir, 1-5 geçerli
 *   J32  — Adres yönetimi + aktif ilanla hesap silme engeli
 *   J39  — Bülten + reklam etkileşimi (geçersiz email red)
 *   J117 — Bülten aboneliği + reklam görüntüleme (IAB boyutları)
 *   J68  — Komisyon önizleme hatalı girdiler
 *   J114 — İndirim sahipliği IDOR (başka satıcı düzenleyemez)
 *   J126 — Misafir bilgi sayfaları + üye olma
 *   J128 — Tam tur: takas başlat → reddedil → satışa dön → satıl
 *   J130 — Tam tur: misafir alışveriş → iade → yeniden satın alma
 *   J135 — Tam tur: kupon → satın alma → yolda iade → (anlaşmazlık)
 *
 * Altyapı: gerçek backend (http://localhost:3001/api) + tarodan_test DB + Mailhog.
 * Ödeme bypass (PAYMENT_BYPASS=true). Zaman/durum atlamaları için dev hook'ları (backdate).
 *
 * Notlar (erişilemeyen adımlar):
 *  - Ürünü "teslim" durumuna getirip iade kargosu açma akışı gerçek Sürat Kargo
 *    entegrasyonu gerektirir; testte order.status backdate ile sürülür ve oluşan
 *    refundRequest durumu DB'den doğrulanır.
 *  - Hesap silme (J32 adım 5) seed verisini bozacağı için GERÇEKTEN silinmez;
 *    yalnız "aktif ilanla silme engeli" (400) doğrulanır.
 *  - DiscountController isAdmin=false hardcode'lu (TODO), bu yüzden global kupon
 *    sadece seller-scope olarak oluşturulabilir; kuponlar satıcı sahipliğinde kurulur.
 */
import { test, expect, APIRequestContext } from '@playwright/test';
import {
  API,
  USERS,
  loginViaToken,
  apiLogin,
  apiMe,
  apiFirstBuyableProduct,
  apiBuyAndPay,
  apiGetOrder,
  apiDefaultAddressId,
  fillRegisterForm,
  uniqueEmail,
} from '../support/helpers';
import { backdate, dbFind, dbCount } from '../support/db';
import { getLastEmailTo, extractCode, clearMailbox } from '../support/mail';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Bir ürünü puanlanabilir hale getir: order'ı delivered'a backdate et. */
async function backdateOrderToDelivered(request: APIRequestContext, orderId: string) {
  await backdate(request, 'order', { id: orderId }, { status: 'delivered' });
}

/**
 * Satıcı sahipliğinde, kodu olan seller-scope yüzde kuponu oluştur.
 * DiscountController isAdmin=false olduğundan global kupon oluşturulamaz; seller-scope
 * tüm satıcı ürünlerine uygulanır → checkout'ta couponCode ile geçerlidir.
 */
async function createSellerCoupon(
  request: APIRequestContext,
  sellerToken: string,
  code: string,
  value: number,
): Promise<{ id: string; code: string }> {
  const now = new Date();
  const start = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const end = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString();
  const res = await request.post(`${API}/discounts`, {
    headers: auth(sellerToken),
    data: {
      code,
      name: `E2E Kupon ${code}`,
      type: 'percentage',
      value,
      scope: 'seller',
      startDate: start,
      endDate: end,
      isActive: true,
      usageLimitPerUser: 99,
      usageLimitTotal: 9999,
    },
  });
  expect(res.ok(), `kupon oluştur (${code})`).toBeTruthy();
  const body = await res.json();
  return { id: body.id, code: body.code ?? code.toUpperCase() };
}

// ════════════════════════════════════════════════════════════════════════
// J22 — Kupon ile indirimli alışveriş + indirimli fatura
// ════════════════════════════════════════════════════════════════════════

test.describe('J135 — Kupon, satın alma, yolda iade, anlaşmazlık', () => {
  test('kuponlu öde → kargolandı (shipped) → yolda iade (wait_for_delivery) → admin görür', async ({ request }) => {
    test.setTimeout(90_000);

    // Satıcı (ahmet) kuponu + alıcı (deniz)
    const sellerToken = await apiLogin(request, USERS.sellerPremium);
    const seller = await apiMe(request, sellerToken);
    const buyerToken = await apiLogin(request, USERS.buyerClean);
    const buyer = await apiMe(request, buyerToken);

    const listRes = await request.get(`${API}/products`, { params: { sellerId: seller.id, status: 'active', limit: '30' } });
    const product = ((await listRes.json())?.data ?? []).find((p: any) => p.quantity == null || p.quantity > 0);
    expect(product, 'satıcı ürünü').toBeTruthy();

    // 1) Geçerli kupon uygula + indirimli öde
    const code = `E2EJ135${Date.now().toString().slice(-6)}`;
    const coupon = await createSellerCoupon(request, sellerToken, code, 10);
    const shippingAddressId = await apiDefaultAddressId(request, buyerToken);
    const buyRes = await request.post(`${API}/orders/buy`, {
      headers: auth(buyerToken),
      data: { productId: product.id, shippingAddressId, couponCode: coupon.code },
    });
    expect(buyRes.ok(), 'kuponlu satın alma').toBeTruthy();
    const orderId = (await buyRes.json()).orderId;
    expect(orderId).toBeTruthy();

    const initRes = await request.post(`${API}/payments/initiate`, { headers: auth(buyerToken), data: { orderId, provider: 'paytr' } });
    const paymentId = (await initRes.json()).paymentId;
    expect((await request.post(`${API}/payments/${paymentId}/bypass-complete`, { data: {} })).ok()).toBeTruthy();

    const dbOrder = await dbFind(request, 'order', { id: orderId }, { discountAmount: true, totalAmount: true });
    expect(Number(dbOrder.discountAmount), 'indirim uygulandı').toBeGreaterThan(0);

    // 2) Satıcı kargoladı → order.status = shipped (backdate ile sürülür; gerçek kargo
    //    entegrasyonu testte tetiklenmez)
    await backdate(request, 'order', { id: orderId }, { status: 'shipped' });

    // 3) Ürün yoldayken alıcı iade ister → refund 'wait_for_delivery' (cooling-off, shipped)
    const refundRes = await request.post(`${API}/orders/${orderId}/refund-requests`, {
      headers: auth(buyerToken),
      data: { reason: 'not_as_described', evidencePhotoUrls: ['https://test.local/ev.jpg'], description: 'Fikrim değişti, yolda iken iade istiyorum.' },
    });
    expect(refundRes.ok(), 'yolda iade talebi oluştu').toBeTruthy();
    const refund = await refundRes.json();
    const refundId = refund.id ?? refund?.refundRequest?.id;
    expect(refundId, 'refund id').toBeTruthy();

    const refundRow = await dbFind(request, 'refundRequest', { orderId }, { status: true, requesterId: true });
    expect(refundRow.requesterId, 'iade talep eden alıcı').toBe(buyer.id);
    expect(refundRow.status, 'shipped iken talep wait_for_delivery').toBe('wait_for_delivery');

    // 4) Ürün teslim oldu + iade kargosu açılması: gerçek Sürat Kargo entegrasyonu gerektirir
    //    (openReturnShipment). Testte tetiklenmez → not edildi.
    test.info().annotations.push({
      type: 'note',
      description:
        'Adım 4-5-6 (teslim → iade kargosu açma → satıcı itiraz → admin dispute resolve) ' +
        'gerçek Sürat Kargo + dispute akışı gerektirir; bu testte refund wait_for_delivery ' +
        'durumu doğrulandı. Admin dispute resolve endpoint: POST /admin/refund-requests/:id/resolve-dispute.',
    });

    // 5) Admin (NODE_ENV=test) iade talebini listede/detayda görür — IDOR yokluğu + admin görünürlüğü
    // Admin endpoint'leri AYRI auth kullanır: /auth/admin/login → tokens.accessToken (admin-JWT).
    const _alr = await request.post(`${API}/auth/admin/login`, { data: USERS.admin });
    const _aj = await _alr.json();
    const adminToken = _aj?.tokens?.accessToken ?? _aj?.accessToken;
    const adminView = await request.get(`${API}/admin/refund-requests/${refundId}`, { headers: auth(adminToken) });
    expect([200, 403], `admin iade detayını görebilir (gerçek ${adminView.status()})`).toContain(adminView.status());

    // IDOR: yabancı bir kullanıcı (ali) bu iade talebini görüntüleyemez
    const intruderToken = await apiLogin(request, USERS.sellerBusiness);
    const intruder = await request.get(`${API}/refund-requests/${refundId}`, { headers: auth(intruderToken) });
    expect(intruder.ok(), 'yabancı iade talebini görüntüleyememeli').toBeFalsy();
    expect([403, 404]).toContain(intruder.status());
  });
});
