/**
 * J110 — Puan sınırı: 0 ve 6 reddediliyor
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

test.describe('J110 — Puan sınırı: 0 ve 6 reddedilir, 1-5 geçerli', () => {
  test('0 ve 6 reddedilir, geçerli puan kaydedilir', async ({ request }) => {
    test.setTimeout(60_000);

    const buyerToken = await apiLogin(request, USERS.buyerClean);
    const buyer = await apiMe(request, buyerToken);
    const product = await apiFirstBuyableProduct(request, buyer.id);

    const { orderId } = await apiBuyAndPay(request, buyerToken, product.id);
    await backdateOrderToDelivered(request, orderId);

    // 2) 0 puan → @Min(1) (400)
    const zero = await request.post(`${API}/ratings/products`, {
      headers: auth(buyerToken),
      data: { productId: product.id, orderId, score: 0 },
    });
    expect(zero.ok(), '0 reddedilir').toBeFalsy();
    expect([400, 403, 404]).toContain(zero.status());

    // 3) 6 puan → @Max(5) (400)
    const six = await request.post(`${API}/ratings/products`, {
      headers: auth(buyerToken),
      data: { productId: product.id, orderId, score: 6 },
    });
    expect(six.ok(), '6 reddedilir').toBeFalsy();
    expect([400, 403, 404]).toContain(six.status());

    // 4) 1-5 arası geçerli puan → kaydedilir
    const valid = await request.post(`${API}/ratings/products`, {
      headers: auth(buyerToken),
      data: { productId: product.id, orderId, score: 3 },
    });
    expect(valid.ok(), '3 puan kabul').toBeTruthy();

    const row = await dbFind(request, 'productRating', { orderId, productId: product.id }, { score: true });
    expect(row?.score, 'DB ürün puanı 3').toBe(3);
  });
});
