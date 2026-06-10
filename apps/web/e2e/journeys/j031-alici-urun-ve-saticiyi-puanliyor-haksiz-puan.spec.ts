/**
 * J31 — Alıcı ürün ve satıcıyı puanlıyor; haksız puan engelleniyor
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

test.describe('J31 — Ürün+satıcı puanlama; haksız puan engeli (IDOR)', () => {
  test('1-5 geçerli puan, alışverişsiz puan reddedilir, 0 reddedilir', async ({ request }) => {
    test.setTimeout(60_000);

    const buyerToken = await apiLogin(request, USERS.buyerClean);
    const buyer = await apiMe(request, buyerToken);
    const product = await apiFirstBuyableProduct(request, buyer.id);

    // 1) Satın al + ode, sonra delivered'a getir (teslim aldı)
    const { orderId } = await apiBuyAndPay(request, buyerToken, product.id);
    await backdateOrderToDelivered(request, orderId);
    const order = await apiGetOrder(request, buyerToken, orderId);
    const sellerId = order.sellerId ?? order.seller?.id ?? product.sellerId;

    // 2) Ürünü 1-5 arası puanla (geçerli)
    const prRes = await request.post(`${API}/ratings/products`, {
      headers: auth(buyerToken),
      data: { productId: product.id, orderId, score: 5, title: 'Harika', review: 'Çok memnun kaldım' },
    });
    expect(prRes.ok(), 'ürün puanı 5 kabul').toBeTruthy();

    // Satıcıyı puanla (geçerli)
    const urRes = await request.post(`${API}/ratings/users`, {
      headers: auth(buyerToken),
      data: { receiverId: sellerId, orderId, score: 4, comment: 'Hızlı kargo' },
    });
    if (!urRes.ok()) expect(urRes.ok(), `satıcı puanı 4 kabul (${urRes.status()}) ${(await urRes.text()).slice(0, 110)}`).toBeTruthy();

    // DB: rating kaydı oluştu (pending — admin onayı bekliyor)
    const ratingRow = await dbFind(request, 'rating', { giverId: buyer.id, orderId }, { score: true, status: true });
    expect(ratingRow, 'rating DB kaydı').toBeTruthy();
    expect(ratingRow.score).toBe(4);

    // 3) 0 puan → DTO @Min(1) ihlali (400)
    const zeroRes = await request.post(`${API}/ratings/products`, {
      headers: auth(buyerToken),
      data: { productId: product.id, orderId, score: 0 },
    });
    expect(zeroRes.ok(), '0 puan reddedilmeli').toBeFalsy();
    expect([400, 403, 404, 409]).toContain(zeroRes.status());

    // 4) Hiç alışveriş yapmadığı bir kullanıcıyı puanla → engellenir (orderId yok)
    const moderator = await apiMe(request, await apiLogin(request, USERS.moderator));
    const idorRes = await request.post(`${API}/ratings/users`, {
      headers: auth(buyerToken),
      data: { receiverId: moderator.id, score: 5 }, // orderId/tradeId yok → BadRequest
    });
    expect(idorRes.ok(), 'alışverişsiz puanlama engellenmeli').toBeFalsy();
    expect([400, 403, 404]).toContain(idorRes.status());

    // 5) Puanlar herkese açık istatistiklerde sorgulanabilir (endpoint public)
    const statsRes = await request.get(`${API}/ratings/users/${sellerId}/stats`);
    expect(statsRes.ok(), 'public rating stats erişilebilir').toBeTruthy();
    const stats = await statsRes.json();
    expect(stats).toHaveProperty('totalRatings'); // not: onaylanan puanlar sayılır
  });
});
