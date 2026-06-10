/**
 * J68 — Komisyon önizleme hatalı girdilerle
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

test.describe('J68 — Komisyon önizleme hatalı girdiler', () => {
  test('geçerli önizleme, negatif/NaN red, batch >50 red, geçerli batch', async ({ request }) => {
    const sellerToken = await apiLogin(request, USERS.sellerPremium);

    // 1) Geçerli tek önizleme → kesinti + net kazanç
    const ok = await request.get(`${API}/orders/commission-preview`, {
      headers: auth(sellerToken), params: { amount: '1000' },
    });
    expect(ok.ok(), 'komisyon önizleme').toBeTruthy();
    const okBody = await ok.json();
    // Net kazanç tutar içinde olmalı (alan adı sellerNetAmount)
    const net = okBody.sellerNetAmount ?? okBody.netAmount ?? okBody.sellerNet;
    expect(net, 'net kazanç döndü').not.toBeUndefined();
    expect(Number(net), 'net kazanç < brüt').toBeLessThanOrEqual(1000);

    // 2) Negatif tutar → 400
    const neg = await request.get(`${API}/orders/commission-preview`, {
      headers: auth(sellerToken), params: { amount: '-50' },
    });
    expect(neg.ok(), 'negatif tutar reddedilmeli').toBeFalsy();
    expect([400, 422]).toContain(neg.status());

    // 3) Sayısal olmayan değer → 400 (parseFloat NaN)
    const nan = await request.get(`${API}/orders/commission-preview`, {
      headers: auth(sellerToken), params: { amount: 'abc' },
    });
    expect(nan.ok(), 'sayısal olmayan değer reddedilmeli').toBeFalsy();
    expect([400, 422]).toContain(nan.status());

    // 4) Toplu önizlemede 51 kalem → 400 (>50)
    const tooMany = Array.from({ length: 51 }, () => ({ amount: 100 }));
    const batchBig = await request.post(`${API}/orders/commission-preview-batch`, {
      headers: auth(sellerToken), data: { items: tooMany },
    });
    expect(batchBig.ok(), '>50 kalem reddedilmeli').toBeFalsy();
    expect([400, 422]).toContain(batchBig.status());

    // 5) Geçerli kalemlerle toplu önizleme
    const items = [{ amount: 100 }, { amount: 250 }, { amount: 500 }];
    const batchOk = await request.post(`${API}/orders/commission-preview-batch`, {
      headers: auth(sellerToken), data: { items },
    });
    expect(batchOk.ok(), 'geçerli batch önizleme').toBeTruthy();
    const batchBody = await batchOk.json();
    const arr = Array.isArray(batchBody) ? batchBody : batchBody.items ?? batchBody.results;
    expect(Array.isArray(arr) ? arr.length : 0, 'batch sonuç sayısı').toBe(3);
  });
});
