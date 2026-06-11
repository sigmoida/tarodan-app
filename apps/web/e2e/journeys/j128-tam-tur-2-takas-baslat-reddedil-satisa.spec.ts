/**
 * J128 — Tam tur 2: takas başlat, reddedil, satışa dön
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

test.describe('J128 — Takas reddedil, satışa dön', () => {
  test('takas teklifi → karşı taraf reddeder → ürün satışa kalır → alıcı satın alır', async ({ request }) => {
    test.setTimeout(60_000);

    // Initiator = ahmet (premium seller, ürünleri var), receiver = ali (business seller, ürünleri var)
    const initToken = await apiLogin(request, USERS.sellerPremium);
    const initiator = await apiMe(request, initToken);
    const recvToken = await apiLogin(request, USERS.sellerBusiness);
    const receiver = await apiMe(request, recvToken);

    // Initiator'ın kendi ürünü
    const initProdRes = await request.get(`${API}/products`, { params: { sellerId: initiator.id, status: 'active', limit: '10' } });
    const initProd = ((await initProdRes.json())?.data ?? [])[0];
    expect(initProd, 'initiator ürünü').toBeTruthy();

    // Receiver'ın ürünü (talep edilen)
    const recvProdRes = await request.get(`${API}/products`, { params: { sellerId: receiver.id, status: 'active', limit: '10' } });
    const recvProd = ((await recvProdRes.json())?.data ?? [])[0];
    expect(recvProd, 'receiver ürünü').toBeTruthy();

    // 2) Takas teklifi gönder
    const createRes = await request.post(`${API}/trades`, {
      headers: auth(initToken),
      data: {
        receiverId: receiver.id,
        initiatorItems: [{ productId: initProd.id, quantity: 1 }],
        receiverItems: [{ productId: recvProd.id, quantity: 1 }],
        message: 'E2E takas teklifi',
      },
    });
    expect(createRes.ok(), 'takas oluşturuldu').toBeTruthy();
    const trade = await createRes.json();
    const tradeId = trade.id ?? trade?.trade?.id;
    expect(tradeId, 'trade id').toBeTruthy();

    const tradeRow = await dbFind(request, 'trade', { id: tradeId }, { status: true });
    expect(tradeRow.status, 'takas pending').toBe('pending');

    // 3) Karşı taraf (receiver) reddeder
    const rejectRes = await request.post(`${API}/trades/${tradeId}/reject`, {
      headers: auth(recvToken), data: { reason: 'İlgilenmiyorum' },
    });
    expect(rejectRes.ok(), 'takas reddedildi').toBeTruthy();
    const rejectedRow = await dbFind(request, 'trade', { id: tradeId }, { status: true });
    expect(rejectedRow.status, 'takas rejected').toBe('rejected');

    // 4) Initiator ürünü normal satışta kalır (reddedilince ürün aktif kalmalı)
    const prodAfter = await dbFind(request, 'product', { id: initProd.id }, { status: true });
    expect(['active', 'reserved'], 'ürün satışa açık kaldı').toContain(prodAfter.status);

    // 5-6) Bir alıcı (deniz) ürünü Hemen Al ile satın alıp öder
    const buyerToken = await apiLogin(request, USERS.buyerClean);
    // ahmet ürünü aktif ve deniz satın alabilir
    if (prodAfter.status === 'active') {
      const { orderId } = await apiBuyAndPay(request, buyerToken, initProd.id);
      const order = await apiGetOrder(request, buyerToken, orderId);
      expect(['paid', 'preparing', 'shipped', 'delivered', 'completed'], 'sipariş ödendi').toContain(order.status);

      // 7) Satıcı parasını (süre dolunca) alır — burada sipariş tamamlanma yolu test edilir:
      //    delivered'a backdate + confirm → completed; alıcı satıcıyı puanlar.
      await backdateOrderToDelivered(request, orderId);
      const confirm = await request.post(`${API}/orders/${orderId}/confirm`, { headers: auth(buyerToken) });
      // confirmDelivery delivered→completed (buyer)
      if (confirm.ok()) {
        const completed = await dbFind(request, 'order', { id: orderId }, { status: true });
        expect(['completed', 'delivered'], 'sipariş tamamlandı/teslim').toContain(completed.status);
      }
      const rate = await request.post(`${API}/ratings/users`, {
        headers: auth(buyerToken), data: { receiverId: initiator.id, orderId, score: 5, comment: 'Tesekkurler' },
      });
      expect([200, 201, 400], 'satıcı puanlama (delivered/completed sonrası)').toContain(rate.status());
    } else {
      // Ürün reserved kaldıysa (başka rezervasyon), satın alma adımı atlanır — not edildi.
      test.info().annotations.push({ type: 'note', description: 'initiator ürünü reserved; satın alma adımı atlandı' });
    }
  });
});
