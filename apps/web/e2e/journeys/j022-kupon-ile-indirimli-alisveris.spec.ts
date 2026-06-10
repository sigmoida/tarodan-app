/**
 * J22 — Kupon ile indirimli alışveriş
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

test.describe('J22 — Kupon ile indirimli alışveriş (indirimli fatura)', () => {
  test('geçersiz kod red → geçerli kupon → indirimli sipariş + fatura', async ({ request }) => {
    test.setTimeout(60_000);

    // Satıcı (ahmet) ürünü + alıcı (deniz)
    const sellerToken = await apiLogin(request, USERS.sellerPremium);
    const seller = await apiMe(request, sellerToken);
    const buyerToken = await apiLogin(request, USERS.buyerClean);

    // Satıcının aktif, stoklu bir ürününü bul
    const listRes = await request.get(`${API}/products`, {
      params: { sellerId: seller.id, status: 'active', limit: '30' },
    });
    const list = (await listRes.json())?.data ?? [];
    const product = list.find((p: any) => p.quantity == null || p.quantity > 0);
    expect(product, 'satıcının satın alınabilir ürünü').toBeTruthy();

    // Kupon oluştur (%20, seller-scope)
    const code = `E2EJ22${Date.now().toString().slice(-6)}`;
    const coupon = await createSellerCoupon(request, sellerToken, code, 20);

    // 2) Geçersiz kod → validate isValid=false (kontrollü red)
    const invalidVal = await request.post(`${API}/discounts/validate`, {
      headers: auth(buyerToken),
      data: { code: 'GECERSIZ_KOD_XYZ', cartItems: [{ productId: product.id, quantity: 1 }] },
    });
    expect(invalidVal.ok()).toBeTruthy();
    expect((await invalidVal.json()).isValid, 'geçersiz kod reddedilir').toBeFalsy();

    // 3) Geçerli kupon → validate isValid=true + tahmini indirim > 0
    const validVal = await request.post(`${API}/discounts/validate`, {
      headers: auth(buyerToken),
      data: { code: coupon.code, cartItems: [{ productId: product.id, quantity: 1 }] },
    });
    expect(validVal.ok()).toBeTruthy();
    const vBody = await validVal.json();
    expect(vBody.isValid, 'geçerli kupon doğrulandı').toBeTruthy();
    expect(vBody.discount?.estimatedDiscount, 'tahmini indirim > 0').toBeGreaterThan(0);

    // 4-5) Kupon ile satın al + öde → sipariş indirimli oluşur
    const shippingAddressId = await apiDefaultAddressId(request, buyerToken);
    const buyRes = await request.post(`${API}/orders/buy`, {
      headers: auth(buyerToken),
      data: { productId: product.id, shippingAddressId, couponCode: coupon.code },
    });
    expect(buyRes.ok(), 'kuponlu orders/buy').toBeTruthy();
    const buyBody = await buyRes.json();
    const orderId = buyBody.orderId ?? buyBody.id;
    expect(orderId).toBeTruthy();
    expect(buyBody.appliedCouponCode ?? '', 'kupon uygulandı').toBe(coupon.code);

    // DB: order indirimli (discountAmount > 0, discountCode set)
    const dbOrder = await dbFind(request, 'order', { id: orderId }, {
      discountAmount: true, discountCode: true, totalAmount: true, subtotal: true,
    });
    expect(Number(dbOrder.discountAmount), 'DB discountAmount > 0').toBeGreaterThan(0);
    expect(dbOrder.discountCode).toBe(coupon.code);

    // Öde (initiate + bypass-complete)
    const initRes = await request.post(`${API}/payments/initiate`, {
      headers: auth(buyerToken), data: { orderId, provider: 'paytr' },
    });
    expect(initRes.ok()).toBeTruthy();
    const paymentId = (await initRes.json()).paymentId;
    const doneRes = await request.post(`${API}/payments/${paymentId}/bypass-complete`, { data: {} });
    expect(doneRes.ok(), 'ödeme tamamlandı').toBeTruthy();

    const order = await apiGetOrder(request, buyerToken, orderId);
    expect(['paid', 'preparing', 'shipped', 'delivered', 'completed']).toContain(order.status);

    // 5) Fatura indirimli total ile oluşur (order.totalAmount bazlı)
    const invRes = await request.get(`${API}/invoices/order/${orderId}`, { headers: auth(buyerToken) });
    expect(invRes.ok(), 'fatura getirildi').toBeTruthy();
    const inv = await invRes.json();
    // Fatura toplam tutarı (subtotal + tax) indirimli order tutarına dayanır
    const invTotal = Number(inv.total ?? inv.subtotal ?? 0);
    expect(invTotal, 'fatura toplamı > 0').toBeGreaterThan(0);
    expect(invTotal, 'fatura toplamı indirimli sipariş tutarını aşmaz').toBeLessThanOrEqual(
      Number(dbOrder.totalAmount) + 0.01,
    );
  });
});
