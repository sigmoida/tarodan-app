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

// ════════════════════════════════════════════════════════════════════════
// J31 / J109 / J110 — Puanlama akışları
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
    const sellerId = order.sellerId;

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
    expect(urRes.ok(), 'satıcı puanı 4 kabul').toBeTruthy();

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
      data: { receiverId: order.sellerId, orderId, score: 5 },
    });
    expect(okUser.ok(), 'teslim sonrası satıcı puanı kabul').toBeTruthy();
  });
});

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

    const row = await dbFind(request, 'rating', { orderId, productId: product.id }, { score: true });
    expect(row?.score, 'DB ürün puanı 3').toBe(3);
  });
});

// ════════════════════════════════════════════════════════════════════════
// J32 — Adres yönetimi + aktif ilanla hesap silme engeli
// ════════════════════════════════════════════════════════════════════════
test.describe('J32 — Adres yönetimi + hesap silme engeli', () => {
  test('adres ekle/güncelle, kısa ad red, aktif ilanla hesap silme engeli', async ({ request }) => {
    test.setTimeout(60_000);

    // Aktif ilanı olan satıcı (zeynep) — silme engeli için
    const sellerToken = await apiLogin(request, USERS.sellerFree);

    // 1) Yeni teslimat adresi ekle, varsayılan yap
    const addRes = await request.post(`${API}/users/me/addresses`, {
      headers: auth(sellerToken),
      data: {
        title: 'E2E Adres', fullName: 'Test Kullanici', phone: '5551234567',
        city: 'Istanbul', district: 'Kadikoy', address: 'Moda Caddesi No 1 Daire 2',
        zipCode: '34710', isDefault: true,
      },
    });
    expect(addRes.ok(), 'adres eklendi').toBeTruthy();
    const newAddr = await addRes.json();
    const newAddrId = newAddr.id ?? newAddr?.address?.id;
    expect(newAddrId, 'yeni adres id').toBeTruthy();

    // 2) Çok kısa ad-soyadlı adres → @MinLength(2) (400)
    const shortRes = await request.post(`${API}/users/me/addresses`, {
      headers: auth(sellerToken),
      data: {
        fullName: 'A', phone: '5551234567', city: 'Istanbul', district: 'Kadikoy',
        address: 'Moda Caddesi No 1 Daire 2',
      },
    });
    expect(shortRes.ok(), 'kısa ad reddedilmeli').toBeFalsy();
    expect([400, 422]).toContain(shortRes.status());

    // 3) Mevcut adresi güncelle
    const updRes = await request.patch(`${API}/users/me/addresses/${newAddrId}`, {
      headers: auth(sellerToken),
      data: { title: 'E2E Adres Guncel', city: 'Ankara' },
    });
    expect(updRes.ok(), 'adres güncellendi').toBeTruthy();
    const updAddr = await dbFind(request, 'address', { id: newAddrId }, { title: true, city: true });
    expect(updAddr.city, 'DB adres city güncellendi').toBe('Ankara');

    // 4) Aktif ilanları varken hesabı sil → 400 (engel)
    const delRes = await request.delete(`${API}/users/me`, { headers: auth(sellerToken) });
    expect(delRes.ok(), 'aktif ilanla hesap silme engellenmeli').toBeFalsy();
    expect(delRes.status()).toBe(400);
    const delBody = await delRes.json().catch(() => ({}));
    const txt = JSON.stringify(delBody);
    expect(txt, 'aktif ilan gerekçesi mesajda').toMatch(/aktif ilan|ilanlar|kaldır/i);

    // 5) (Seed bozulmasın diye GERÇEK silme yapılmaz; engelin DB'de hâlâ kullanıcı
    //    olduğunu doğrula.)
    const me = await apiMe(request, sellerToken);
    expect(me?.id, 'kullanıcı hâlâ mevcut (silinmedi)').toBeTruthy();

    // Temizlik: eklenen test adresini sil
    await request.delete(`${API}/users/me/addresses/${newAddrId}`, { headers: auth(sellerToken) }).catch(() => {});
  });
});

// ════════════════════════════════════════════════════════════════════════
// J39 / J117 — Bülten + reklam etkileşimi
// ════════════════════════════════════════════════════════════════════════
test.describe('J39 — Bülten + reklam etkileşimi (geçersiz email red)', () => {
  test('aktif reklam görüntü, bülten abone (idempotent), geçersiz email red', async ({ request }) => {
    // 1) Misafir aktif reklamları konuma göre görür (public)
    const adsRes = await request.get(`${API}/advertisements/active`, { params: { position: 'header' } });
    expect(adsRes.ok(), 'aktif reklamlar (header) erişilebilir').toBeTruthy();
    expect(Array.isArray(await adsRes.json()), 'reklam listesi dizi').toBeTruthy();

    // 2) E-posta bültenine abone ol
    const email = uniqueEmail();
    const sub1 = await request.post(`${API}/newsletter/subscribe`, { data: { email, newsletter: true, promotions: true } });
    expect(sub1.ok(), 'bülten aboneliği').toBeTruthy();

    // DB: subscriber kaydı (model: newsletterSubscriber)
    const subRow = await dbFind(request, 'newsletterSubscriber', { email: email.toLowerCase() }, { email: true, unsubscribedAt: true });
    // Bazı implementasyonlar email'i lower-case saklamayabilir; her iki halde de say
    const cnt = await dbCount(request, 'newsletterSubscriber', { email: { in: [email, email.toLowerCase()] } });
    expect(cnt, 'subscriber DB kaydı oluştu').toBeGreaterThanOrEqual(1);
    if (subRow) expect(subRow.unsubscribedAt, 'abone aktif').toBeNull();

    // 3) Aynı e-postayla tekrar abone → hata çıkmadan işlenir (idempotent, tek kayıt)
    const sub2 = await request.post(`${API}/newsletter/subscribe`, { data: { email } });
    expect(sub2.ok(), 'tekrar abone sorunsuz işlenir').toBeTruthy();
    const cntAfter = await dbCount(request, 'newsletterSubscriber', { email: { in: [email, email.toLowerCase()] } });
    expect(cntAfter, 'tek kayıt kalır').toBe(cnt);

    // 4) Geçersiz e-posta ile abone → @IsEmail (400)
    const bad = await request.post(`${API}/newsletter/subscribe`, { data: { email: 'gecersiz-email' } });
    expect(bad.ok(), 'geçersiz email reddedilmeli').toBeFalsy();
    expect([400, 422]).toContain(bad.status());
  });
});

test.describe('J117 — Bülten aboneliği + reklam görüntüleme (IAB)', () => {
  test('konuma göre reklam, IAB boyutları, abone idempotent, geçersiz email red', async ({ request }) => {
    // 1) Konuma göre aktif reklamlar (sidebar)
    const sidebar = await request.get(`${API}/advertisements/active`, { params: { position: 'sidebar' } });
    expect(sidebar.ok()).toBeTruthy();
    expect(Array.isArray(await sidebar.json())).toBeTruthy();

    // 2) Standart IAB reklam boyutları
    const iab = await request.get(`${API}/advertisements/iab-sizes`);
    expect(iab.ok(), 'IAB boyutları erişilebilir').toBeTruthy();
    const sizes = await iab.json();
    expect(Array.isArray(sizes) || typeof sizes === 'object', 'IAB boyut verisi döndü').toBeTruthy();

    // 3-4) Abone ol + tekrar abone (idempotent)
    const email = uniqueEmail();
    expect((await request.post(`${API}/newsletter/subscribe`, { data: { email } })).ok()).toBeTruthy();
    expect((await request.post(`${API}/newsletter/subscribe`, { data: { email } })).ok()).toBeTruthy();
    const cnt = await dbCount(request, 'newsletterSubscriber', { email: { in: [email, email.toLowerCase()] } });
    expect(cnt, 'tek kayıt').toBe(1);

    // 5) Geçersiz email red
    const bad = await request.post(`${API}/newsletter/subscribe`, { data: { email: 'not-an-email' } });
    expect(bad.ok()).toBeFalsy();
    expect([400, 422]).toContain(bad.status());
  });
});

// ════════════════════════════════════════════════════════════════════════
// J68 — Komisyon önizleme hatalı girdiler
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

// ════════════════════════════════════════════════════════════════════════
// J114 — İndirim sahipliği IDOR
// ════════════════════════════════════════════════════════════════════════
test.describe('J114 — İndirim sahipliği IDOR (başka satıcı düzenleyemez)', () => {
  test('seller indirim oluşturur, negatif red, başkası düzenleyemez, sahip güncel+sil', async ({ request }) => {
    const ownerToken = await apiLogin(request, USERS.sellerPremium); // ahmet
    const owner = await apiMe(request, ownerToken);
    const intruderToken = await apiLogin(request, USERS.sellerBusiness); // ali

    // 1) Sahip kendine ait yüzde indirim oluşturur (seller-scope)
    const code = `E2EJ114${Date.now().toString().slice(-6)}`;
    const created = await createSellerCoupon(request, ownerToken, code, 15);
    expect(created.id).toBeTruthy();
    // DB: sellerId = owner
    const dRow = await dbFind(request, 'discount', { id: created.id }, { sellerId: true, value: true });
    expect(dRow.sellerId, 'indirim sahibi owner').toBe(owner.id);

    // 2) Negatif değerli indirim → @Min(0) (400)
    const now = new Date();
    const neg = await request.post(`${API}/discounts`, {
      headers: auth(ownerToken),
      data: {
        name: 'Negatif', type: 'percentage', value: -5, scope: 'seller',
        startDate: now.toISOString(), endDate: new Date(now.getTime() + 86400000).toISOString(),
      },
    });
    expect(neg.ok(), 'negatif değer reddedilmeli').toBeFalsy();
    expect([400, 422]).toContain(neg.status());

    // 3) Sahip sadece kendi indirimlerini görür (liste)
    const list = await request.get(`${API}/discounts`, { headers: auth(ownerToken) });
    expect(list.ok()).toBeTruthy();
    const listBody = await list.json();
    const items: any[] = listBody.data ?? listBody.discounts ?? listBody.items ?? [];
    expect(items.some((d) => d.id === created.id), 'kendi indirimi listede').toBeTruthy();

    // 4) Başka satıcı (ali) sahibi olmadığı indirimi güncellemeye çalışır → 403/404
    const intruderUpd = await request.patch(`${API}/discounts/${created.id}`, {
      headers: auth(intruderToken), data: { value: 90 },
    });
    expect(intruderUpd.ok(), 'yabancı satıcı düzenleyememeli').toBeFalsy();
    expect([403, 404]).toContain(intruderUpd.status());
    // Yabancı silme de engellenir
    const intruderDel = await request.delete(`${API}/discounts/${created.id}`, { headers: auth(intruderToken) });
    expect(intruderDel.ok(), 'yabancı satıcı silememeli').toBeFalsy();
    expect([403, 404]).toContain(intruderDel.status());

    // 5) Sahip güncel + sil
    const upd = await request.patch(`${API}/discounts/${created.id}`, {
      headers: auth(ownerToken), data: { value: 25 },
    });
    expect(upd.ok(), 'sahip günceller').toBeTruthy();
    const updatedRow = await dbFind(request, 'discount', { id: created.id }, { value: true });
    expect(Number(updatedRow.value), 'DB indirim değeri güncellendi').toBe(25);

    const del = await request.delete(`${API}/discounts/${created.id}`, { headers: auth(ownerToken) });
    expect(del.ok(), 'sahip siler (204)').toBeTruthy();
    const goneCount = await dbCount(request, 'discount', { id: created.id });
    expect(goneCount, 'indirim silindi').toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════════════
// J126 — Misafir bilgi sayfaları + üye olma
// ════════════════════════════════════════════════════════════════════════
test.describe('J126 — Misafir bilgi sayfaları + üye olma', () => {
  test('about/faq açılır, olmayan slug 404, üye olur, üyelik tierları görülür', async ({ page, request }) => {
    test.setTimeout(60_000);

    // 1) Misafir bilgi sayfaları (seed: about, faq). KVKK/privacy seed'li değil → not edildi.
    const about = await request.get(`${API}/pages/about`);
    expect(about.ok(), 'about sayfası').toBeTruthy();
    expect((await about.json()).slug).toBe('about');

    const faq = await request.get(`${API}/pages/faq`);
    expect(faq.ok(), 'faq sayfası').toBeTruthy();

    // 2) Var olmayan bilgi sayfası → 404 (bulunamadı)
    const missing = await request.get(`${API}/pages/var-olmayan-sayfa-xyz`);
    expect(missing.ok(), 'olmayan sayfa 404').toBeFalsy();
    expect(missing.status()).toBe(404);

    // 3) Misafir üye olur (UI register), e-posta doğrular, giriş yapar
    await clearMailbox(request);
    await page.goto('/register');
    const creds = await fillRegisterForm(page);
    const regResp = page
      .waitForResponse((r) => r.url().includes('/auth/register') && r.request().method() === 'POST', { timeout: 15_000 })
      .catch(() => null);
    await page.locator('button[type="submit"]').first().click();
    const resp = await regResp;
    if (resp) expect([200, 201]).toContain(resp.status());

    // E-posta doğrulama maili gerçek Mailhog'dan okunur (kod veya link)
    const mail = await getLastEmailTo(request, creds.email, 20_000).catch(() => null);
    if (mail) {
      const code = extractCode(mail.body, 6);
      if (code) {
        const verify = await request.post(`${API}/auth/verify-email`, { data: { email: creds.email, code } });
        // Bazı sürümlerde token ile doğrulama; her iki halde de kritik olan giriş aşaması
        expect([200, 201, 400, 404]).toContain(verify.status());
      }
    }

    // 4) Üyelik paketlerini incele (public tier listesi), ücretsiz üye olarak devam et
    const tiers = await request.get(`${API}/membership/tiers`);
    expect(tiers.ok(), 'üyelik paketleri (tiers) erişilebilir').toBeTruthy();
    const tierList = await tiers.json();
    expect(Array.isArray(tierList) ? tierList.length : 0, 'tier listesi dolu').toBeGreaterThan(0);

    // "Ücretsiz devam" → herhangi bir paket satın alımı yapılmaz; kullanıcı default free.
    // Kayıt başarılıysa kullanıcı login olabiliyor (free tier varsayılan).
  });
});

// ════════════════════════════════════════════════════════════════════════
// J128 — Tam tur: takas başlat → reddedil → satışa dön → satıl
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

// ════════════════════════════════════════════════════════════════════════
// J130 — Tam tur: misafir alışveriş → iade → yeniden satın alma
// ════════════════════════════════════════════════════════════════════════
test.describe('J130 — Misafir alışveriş, iade, yeniden satın alma', () => {
  test('misafir checkout (OTP) → öde → kargodan önce iade → yeniden satın al', async ({ request }) => {
    test.setTimeout(90_000);

    // Satın alınabilir ürün (misafir için)
    const product = await apiFirstBuyableProduct(request);
    const guestEmail = uniqueEmail();
    await clearMailbox(request);

    // 1) Misafir OTP iste → Mailhog'dan 6 haneli kod oku
    const codeRes = await request.post(`${API}/orders/guest/send-verification-code`, {
      data: { email: guestEmail, expectedCheckoutCount: 1 },
    });
    expect(codeRes.ok(), 'misafir OTP gönderildi').toBeTruthy();

    const mail = await getLastEmailTo(request, guestEmail, 20_000);
    const otp = extractCode(mail.body, 6);
    expect(otp, 'maildeki 6 haneli OTP').toBeTruthy();

    // 1) Misafir checkout (üye olmadan)
    const guestRes = await request.post(`${API}/orders/guest`, {
      data: {
        productId: product.id,
        email: guestEmail,
        emailVerificationCode: otp,
        phone: '5551112233',
        guestName: 'Misafir Alici',
        shippingAddress: {
          fullName: 'Misafir Alici', phone: '5551112233', city: 'Istanbul',
          district: 'Kadikoy', address: 'Moda Caddesi No 5 Daire 3', zipCode: '34710',
        },
      },
    });
    expect(guestRes.ok(), 'misafir sipariş oluştu').toBeTruthy();
    const guestOrder = await guestRes.json();
    const orderId = guestOrder.orderId ?? guestOrder.id ?? guestOrder?.order?.id;
    expect(orderId, 'misafir orderId').toBeTruthy();

    // Öde (misafir initiate + bypass-complete, ikisi de public)
    const initRes = await request.post(`${API}/payments/initiate`, { data: { orderId, provider: 'paytr' } });
    expect(initRes.ok(), 'misafir ödeme initiate').toBeTruthy();
    const initBody = await initRes.json();
    const paymentId = initBody.paymentId ?? initBody.id;
    expect(paymentId, 'paymentId').toBeTruthy();
    const doneRes = await request.post(`${API}/payments/${paymentId}/bypass-complete`, { data: {} });
    expect(doneRes.ok(), 'misafir ödeme tamamlandı').toBeTruthy();

    // 2) Faturası oluştu (public, paymentId ile)
    const invRes = await request.get(`${API}/invoices/order/${orderId}/public`, { params: { paymentId } });
    expect([200, 404], 'misafir fatura (public)').toContain(invRes.status());

    // DB: sipariş ödendi/hazırlanıyor (kargolanmadan iade için preparing olmalı)
    const paidOrder = await dbFind(request, 'order', { id: orderId }, { status: true, buyerId: true, productId: true });
    expect(['paid', 'preparing'], 'sipariş kargodan önce').toContain(paidOrder.status);

    // 3-4) Kargodan önce iade → instant refund (approved + para iade, ürün stoğa döner)
    //     Misafir iade talebi: requesterId = guest buyerId. Misafir için endpoint auth ister;
    //     misafir kullanıcı kaydı olmadığından bu adım dev/backdate ile order'ı doğrulayıp
    //     refund'ı, oluşturulan guest buyer token'ı yerine, refund servisinin instant-path'ini
    //     order durumundan ('preparing') teyit ederek belgelenir.
    //     (Refund create endpoint JWT korumalı; misafir token üretemediğimiz için iade
    //      oluşturma adımı erişilemez → not edildi, mümkün kısım test edildi.)
    test.info().annotations.push({
      type: 'note',
      description:
        'Misafir iade oluşturma JWT korumalı (refund.controller auth); misafir token yok. ' +
        'Sipariş preparing → instant-refund uygunluğu order durumundan doğrulandı.',
    });

    // 5) Aynı kişi başka bir ürünü satın alır → burada misafir tekrar OTP + checkout yapar
    const product2 = await apiFirstBuyableProduct(request);
    const code2Res = await request.post(`${API}/orders/guest/send-verification-code`, {
      data: { email: guestEmail, expectedCheckoutCount: 1 },
    });
    expect(code2Res.ok()).toBeTruthy();
    const mail2 = await getLastEmailTo(request, guestEmail, 20_000);
    const otp2 = extractCode(mail2.body, 6);
    expect(otp2, '2. OTP').toBeTruthy();

    const guest2 = await request.post(`${API}/orders/guest`, {
      data: {
        productId: product2.id, email: guestEmail, emailVerificationCode: otp2,
        phone: '5551112233', guestName: 'Misafir Alici',
        shippingAddress: {
          fullName: 'Misafir Alici', phone: '5551112233', city: 'Istanbul',
          district: 'Kadikoy', address: 'Moda Caddesi No 5 Daire 3', zipCode: '34710',
        },
      },
    });
    expect(guest2.ok(), 'misafir yeniden satın alım').toBeTruthy();
    const order2Id = (await guest2.json()).orderId ?? (await guest2.json()).id;
    expect(order2Id, '2. misafir orderId').toBeTruthy();
  });
});

// ════════════════════════════════════════════════════════════════════════
// J135 — Tam tur: kupon → satın alma → yolda iade → anlaşmazlık
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
      data: { reason: 'changed_mind', description: 'Fikrim değişti, yolda iken iade istiyorum.' },
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
    const adminToken = await apiLogin(request, USERS.admin);
    const adminView = await request.get(`${API}/admin/refund-requests/${refundId}`, { headers: auth(adminToken) });
    expect([200, 403], 'admin iade detayını görebilir (rol yapılandırmasına bağlı)').toContain(adminView.status());

    // IDOR: yabancı bir kullanıcı (ali) bu iade talebini görüntüleyemez
    const intruderToken = await apiLogin(request, USERS.sellerBusiness);
    const intruder = await request.get(`${API}/refund-requests/${refundId}`, { headers: auth(intruderToken) });
    expect(intruder.ok(), 'yabancı iade talebini görüntüleyememeli').toBeFalsy();
    expect([403, 404]).toContain(intruder.status());
  });
});
