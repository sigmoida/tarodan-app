/**
 * J109 — Puanlama: önce alışveriş şartı
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

test.describe('J109 — Puanlama: önce alışveriş şartı', () => {
  test('işlemsiz kullanıcı/ürün puanlanamaz, satın aldıktan sonra puanlanır', async ({ request }) => {
    test.setTimeout(60_000);

    const buyerToken = await apiLogin(request, USERS.buyerClean);
    const buyer = await apiMe(request, buyerToken);

    // 1) Hiç işlem yapmadığı kullanıcıyı puanla → engellenir
    const other = await apiMe(request, await apiLogin(request, USERS.sellerBusiness));
    const noTxnUser = await request.post(`${API}/ratings/users`, {
      headers: auth(buyerToken),
      data: { receiverId: other.id, score: 5 },
    });
    expect(noTxnUser.ok(), 'işlemsiz kullanıcı puanlanamaz').toBeFalsy();

    // 2) Satın almadığı ürünü puanla → engellenir (rastgele uuid orderId)
    const product = await apiFirstBuyableProduct(request, buyer.id);
    const fakeOrderId = '00000000-0000-0000-0000-000000000000';
    const noBuyProd = await request.post(`${API}/ratings/products`, {
      headers: auth(buyerToken),
      data: { productId: product.id, orderId: fakeOrderId, score: 5 },
    });
    expect(noBuyProd.ok(), 'satın alınmamış ürün puanlanamaz').toBeFalsy();
    expect([400, 403, 404]).toContain(noBuyProd.status());

    // 3) Satın al + teslim al
    const { orderId } = await apiBuyAndPay(request, buyerToken, product.id);
    await backdateOrderToDelivered(request, orderId);

    // 4) Artık ürünü+satıcıyı puanlayabilir
    const order = await apiGetOrder(request, buyerToken, orderId);
    const okProd = await request.post(`${API}/ratings/products`, {
      headers: auth(buyerToken),
      data: { productId: product.id, orderId, score: 5 },
    });
    expect(okProd.ok(), 'teslim sonrası ürün puanı kabul').toBeTruthy();

    const okUser = await request.post(`${API}/ratings/users`, {
      headers: auth(buyerToken),
      data: { receiverId: order.sellerId ?? order.seller?.id, orderId, score: 5 },
    });
    expect(okUser.ok(), 'teslim sonrası satıcı puanı kabul').toBeTruthy();
  });
});
