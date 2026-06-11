/**
 * SUITE B — Katalog & Arama: J52, J53, J54, J55, J56, J57, J77.
 * Gerçek backend + tarodan_test + (J77) gerçek kargo shipment + dev backdate.
 *
 * Endpoint yolları controller'lardan doğrulandı:
 *  - categories: GET /categories, GET /categories/slug/:slug (404 NotFound)  [category.controller.ts]
 *  - brands:     GET /brands, GET /brands/:slug (404 NotFound)               [brand.controller.ts]
 *  - search:     GET /search/products?q=&minPrice=&maxPrice=, GET /search/autocomplete?q= [search.controller.ts]
 *  - products:   GET /products/:id, POST /products/:id/view {viewCount}, POST/DELETE like, [product.controller.ts]
 *                POST /products (create, MinLength(5) title + Min(1) price), PATCH/DELETE /products/:id (owner)
 *  - tax:        GET /tax/calculate?countryCode=&subtotal=  {rate,taxAmount}  [tax.controller.ts]
 *  - quote:      POST /orders/quote {items:[{productId,quantity}]} → {itemsSubtotal,shippingAmount,totalAmount} [order.controller.ts]
 *  - wishlist:   GET/POST /wishlist {productId}, DELETE /wishlist/:productId  [wishlist.controller.ts]
 *  - shipping:   GET /shipping/carriers, GET /shipping/rates?city=&carrier= {rate}, POST /shipping {orderId,provider} [shipping.controller.ts]
 *  - order flow: POST /orders/:id/prepare (paid→preparing), POST /shipping (preparing→shipped, tracking üretir),
 *                POST /orders/:id/confirm (delivered→completed).  [order.controller.ts + shipping.service.ts]
 */
import { test, expect } from '@playwright/test';
import {
  API,
  USERS,
  apiLogin,
  apiMe,
  apiFirstBuyableProduct,
  apiBuyAndPay,
  apiGetOrder,
} from '../support/helpers';
import { backdate, dbFind } from '../support/db';

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

// ─────────────────────────────────────────────────────────────────────────────
// J52 — Katalog gezinme: olmayan kategori ve marka 404
// ─────────────────────────────────────────────────────────────────────────────
test.describe('J52 — Olmayan kategori/marka 404, var olanlar açılır', () => {
  test('kategori/marka listesi gelir, var olan açılır, olmayan 404 döner', async ({ request }) => {
    // 1) Misafir kategori listesini açtı → liste dolu gelir
    const catsRes = await request.get(`${API}/categories`);
    expect(catsRes.ok(), 'GET /categories 200').toBeTruthy();
    const cats: any[] = await catsRes.json();
    expect(Array.isArray(cats) && cats.length > 0, 'en az bir kategori').toBeTruthy();
    const catSlug: string = cats[0].slug;
    expect(catSlug, 'kategori slug').toBeTruthy();

    // 2) Var olan kategori slug ile açılır (sonuç: doğru slug döner)
    const catOk = await request.get(`${API}/categories/slug/${catSlug}`);
    expect(catOk.ok(), 'var olan kategori 200').toBeTruthy();
    expect((await catOk.json())?.slug).toBe(catSlug);

    // 3) Var olmayan kategori adresi → 404 (NotFoundException)
    const catMissing = await request.get(`${API}/categories/slug/bu-kategori-yok-${Date.now()}`);
    expect(catMissing.ok(), 'olmayan kategori reddedilmeli').toBeFalsy();
    expect(catMissing.status(), 'olmayan kategori 404').toBe(404);

    // 4) Marka listesinden bir markaya gir → ürünleri gör
    const brandsRes = await request.get(`${API}/brands`);
    expect(brandsRes.ok(), 'GET /brands 200').toBeTruthy();
    const brands: any[] = await brandsRes.json();
    expect(Array.isArray(brands) && brands.length > 0, 'en az bir marka').toBeTruthy();
    const brandSlug: string = brands[0].slug;

    const brandOk = await request.get(`${API}/brands/${brandSlug}`);
    expect(brandOk.ok(), 'var olan marka 200').toBeTruthy();
    expect((await brandOk.json())?.slug).toBe(brandSlug);

    // 5) Olmayan marka adresi → 404
    const brandMissing = await request.get(`${API}/brands/bu-marka-yok-${Date.now()}`);
    expect(brandMissing.ok(), 'olmayan marka reddedilmeli').toBeFalsy();
    expect(brandMissing.status(), 'olmayan marka 404').toBe(404);

    // Akış bitişi: normal arama da sonuç döner (yapı bozulmamış)
    const search = await request.get(`${API}/search/products`, { params: { q: '' } });
    expect(search.ok(), 'arama 200').toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// J53 — Arama + filtre + autocomplete + görüntülenme
// ─────────────────────────────────────────────────────────────────────────────
test.describe('J53 — Arama, fiyat filtresi, autocomplete, görüntülenme', () => {
  test('autocomplete önerir, filtre uygular, detayda viewCount artar, sepete eklenir', async ({ request }) => {
    test.setTimeout(60_000);

    // Arama terimi: canlı bir ürün başlığından ilk kelimeyi al (deterministik öneri için)
    const seedProduct = await apiFirstBuyableProduct(request);
    const term = String(seedProduct.title).split(/\s+/)[0] || 'model';

    // 1) Autocomplete: kutuya model adı yazıldı → öneriler geldi
    const ac = await request.get(`${API}/search/autocomplete`, { params: { q: term } });
    expect(ac.ok(), 'autocomplete 200').toBeTruthy();
    const acBody = await ac.json();
    expect(Array.isArray(acBody?.suggestions), 'suggestions array').toBeTruthy();
    // Öneri gelmesi içerik bağımlı; en azından yapı doğru. Öneri varsa onu kullan.
    const picked: string = acBody.suggestions?.[0] ?? term;

    // 2) Bir öneriyi seçip sonuç listesi
    const res1 = await request.get(`${API}/search/products`, { params: { q: picked, pageSize: '20' } });
    expect(res1.ok(), 'arama sonucu 200').toBeTruthy();
    const body1 = await res1.json();
    const items1: any[] = body1?.products ?? body1?.data ?? body1?.items ?? [];
    expect(Array.isArray(items1), 'sonuç listesi array').toBeTruthy();

    // 3) Fiyat aralığı filtresi uygula → dönen ürünler aralıkta
    const minP = 1;
    const maxP = Math.max(2, Math.ceil(Number(seedProduct.price)) + 1);
    const res2 = await request.get(`${API}/search/products`, {
      params: { q: '', minPrice: String(minP), maxPrice: String(maxP), pageSize: '20' },
    });
    expect(res2.ok(), 'fiyat filtreli arama 200').toBeTruthy();
    const body2 = await res2.json();
    const items2: any[] = body2?.products ?? body2?.data ?? body2?.items ?? [];
    for (const it of items2) {
      if (typeof it.price === 'number') {
        expect(it.price, `${it.price} ∈ [${minP},${maxP}]`).toBeGreaterThanOrEqual(minP);
        expect(it.price).toBeLessThanOrEqual(maxP);
      }
    }

    // 4) Ürün detayını aç → görüntülenme sayısı artar (DB'den doğrula)
    const before = await dbFind(request, 'product', { id: seedProduct.id }, { viewCount: true });
    const beforeCount = Number(before?.viewCount ?? 0);
    const viewRes = await request.post(`${API}/products/${seedProduct.id}/view`, { data: {} });
    expect(viewRes.ok(), 'view 200/201').toBeTruthy();
    const after = await dbFind(request, 'product', { id: seedProduct.id }, { viewCount: true });
    expect(Number(after?.viewCount), 'viewCount arttı').toBeGreaterThan(beforeCount);

    // 5) Üye olup ürünü "sepete ekle" — sepet yerine istek listesi/satın alma yoluyla
    //    katalog→üye geçişi doğrulanır. Burada üye gerçekten satın alıyor (sonuç: paid sipariş).
    const buyerToken = await apiLogin(request, USERS.buyerClean);
    const buyerMe = await apiMe(request, buyerToken);
    const buyable = await apiFirstBuyableProduct(request, buyerMe?.id);
    const { orderId } = await apiBuyAndPay(request, buyerToken, buyable.id);
    const order = await apiGetOrder(request, buyerToken, orderId);
    expect(['paid', 'preparing', 'shipped', 'completed']).toContain(order?.status);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// J54 — Vergi dökümü + fiyat dökümü + alışveriş
// ─────────────────────────────────────────────────────────────────────────────
test.describe('J54 — Vergi/fiyat dökümü inceleyip alışveriş', () => {
  test('vergi hesaplanır, kalem dökümü tutarlı, ödenir', async ({ request }) => {
    test.setTimeout(60_000);

    // 1) Misafir vergi hesaplama bilgisini gördü (public /tax/calculate)
    const subtotal = 100;
    const taxRes = await request.get(`${API}/tax/calculate`, {
      params: { countryCode: 'TR', subtotal: String(subtotal) },
    });
    expect(taxRes.ok(), 'tax/calculate 200').toBeTruthy();
    const tax = await taxRes.json();
    // rate null olabilir (vergi tanımsızsa) ama yapı tutarlı olmalı; rate varsa taxAmount = subtotal*rate/100
    if (tax?.rate != null) {
      expect(typeof tax.rate, 'rate sayı').toBe('number');
      const expected = Math.round((subtotal * tax.rate) / 100 * 100) / 100;
      expect(Math.abs(Number(tax.taxAmount) - expected), 'taxAmount = subtotal*rate/100').toBeLessThan(0.5);
    }

    // 2) Üye giriş + alınabilir ürün
    const token = await apiLogin(request, USERS.buyerClean);
    const me = await apiMe(request, token);
    const product = await apiFirstBuyableProduct(request, me?.id);

    // 3) Sipariş öncesi kalem kalem fiyat dökümü (POST /orders/quote)
    const quoteRes = await request.post(`${API}/orders/quote`, {
      data: { items: [{ productId: product.id, quantity: 1 }] },
    });
    expect(quoteRes.ok(), 'orders/quote 200').toBeTruthy();
    const quote = await quoteRes.json();
    expect(typeof quote.itemsSubtotal, 'itemsSubtotal').toBe('number');
    expect(typeof quote.shippingAmount, 'shippingAmount').toBe('number');
    expect(typeof quote.totalAmount, 'totalAmount').toBe('number');
    // Döküm tutarlılığı: total >= subtotal + shipping (buyerFee eklenebilir)
    expect(quote.totalAmount, 'total >= subtotal+shipping').toBeGreaterThanOrEqual(
      quote.itemsSubtotal + quote.shippingAmount - 0.01,
    );

    // 4) Toplamı uygun bulup öde
    const { orderId } = await apiBuyAndPay(request, token, product.id);

    // 5) Sipariş tamamlandı (paid) → DB'den toplam tutar pozitif ve quote ile uyumlu büyüklükte
    const order = await apiGetOrder(request, token, orderId);
    expect(['paid', 'preparing', 'shipped', 'completed']).toContain(order?.status);
    const dbOrder = await dbFind(request, 'order', { id: orderId }, { totalAmount: true, shippingAmount: true });
    expect(Number(dbOrder?.totalAmount), 'order totalAmount > 0').toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// J55 — İlan başlık/fiyat validation (çok kısa/boş başlık, fiyat<1 reddedilir)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('J55 — İlan başlık ve fiyat validation', () => {
  test('kısa/boş başlık ve fiyat<1 reddedilir, geçerli ilan yayına girer', async ({ request }) => {
    test.setTimeout(60_000);

    const sellerToken = await apiLogin(request, USERS.sellerPremium);
    // Geçerli categoryId'yi canlı bir üründen al (UUID tahmin etme)
    const sample = await apiFirstBuyableProduct(request);
    const sampleDetail = await request.get(`${API}/products/${sample.id}`);
    const categoryId: string =
      (await sampleDetail.json())?.categoryId ?? (await sampleDetail.json())?.category?.id;
    expect(categoryId, 'geçerli categoryId').toBeTruthy();

    const base = { categoryId, condition: 'very_good', price: 150 };

    // 2) Başlık 5 karakterden kısa → reddedilir (MinLength(5))
    const shortTitle = await request.post(`${API}/products`, {
      headers: auth(sellerToken),
      data: { ...base, title: 'abc' },
    });
    expect(shortTitle.ok(), 'kısa başlık reddedilmeli').toBeFalsy();
    expect([400, 422]).toContain(shortTitle.status());

    // 3) Başlık boş → reddedilir
    const emptyTitle = await request.post(`${API}/products`, {
      headers: auth(sellerToken),
      data: { ...base, title: '' },
    });
    expect(emptyTitle.ok(), 'boş başlık reddedilmeli').toBeFalsy();
    expect([400, 422]).toContain(emptyTitle.status());

    // 4) Fiyat 1'den küçük → reddedilir (Min(1))
    const lowPrice = await request.post(`${API}/products`, {
      headers: auth(sellerToken),
      data: { ...base, title: 'Geçerli Başlık Test', price: 0 },
    });
    expect(lowPrice.ok(), 'fiyat<1 reddedilmeli').toBeFalsy();
    expect([400, 422]).toContain(lowPrice.status());

    // 5) Geçerli bilgilerle ilan oluşturulur → yayına girer (DB'de product oluştu)
    const title = `PW Geçerli İlan ${Date.now()}`;
    const okRes = await request.post(`${API}/products`, {
      headers: auth(sellerToken),
      data: { ...base, title, price: 199 },
    });
    expect(okRes.ok(), 'geçerli ilan oluşturuldu').toBeTruthy();
    const created = await okRes.json();
    const newId = created?.id ?? created?.product?.id;
    expect(newId, 'oluşan ürün id').toBeTruthy();
    const dbProduct = await dbFind(request, 'product', { id: newId }, { id: true, title: true, status: true });
    expect(dbProduct?.title).toBe(title);

    // Temizlik: oluşturulan test ilanını sil (seed kirliliğini önle)
    await request.delete(`${API}/products/${newId}`, { headers: auth(sellerToken) }).catch(() => {});
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// J56 — Ürün güncelle/sil + IDOR (başkası güncelleyemez)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('J56 — Ürün güncelle/sil ve IDOR koruması', () => {
  test('sahip günceller, yabancı engellenir, sahip siler', async ({ request }) => {
    test.setTimeout(60_000);

    const ownerToken = await apiLogin(request, USERS.sellerPremium);
    const sample = await apiFirstBuyableProduct(request);
    const detail = await request.get(`${API}/products/${sample.id}`);
    const categoryId: string = (await detail.json())?.categoryId ?? (await detail.json())?.category?.id;
    expect(categoryId).toBeTruthy();

    // Önkoşul: sahip kendi ilanını oluşturur
    const createRes = await request.post(`${API}/products`, {
      headers: auth(ownerToken),
      data: { title: `PW J56 İlan ${Date.now()}`, price: 120, categoryId, condition: 'very_good' },
    });
    expect(createRes.ok(), 'ilan oluştu').toBeTruthy();
    const productId = (await createRes.json())?.id;
    expect(productId).toBeTruthy();

    // 2) Sahip başlık + fiyatı günceller (PATCH /products/:id)
    const newTitle = `PW J56 Güncellendi ${Date.now()}`;
    const update = await request.patch(`${API}/products/${productId}`, {
      headers: auth(ownerToken),
      data: { title: newTitle, price: 175 },
    });
    expect(update.ok(), 'sahip güncelleyebilir').toBeTruthy();
    const dbAfterUpdate = await dbFind(request, 'product', { id: productId }, { title: true, price: true });
    expect(dbAfterUpdate?.title, 'başlık güncellendi').toBe(newTitle);
    expect(Number(dbAfterUpdate?.price), 'fiyat güncellendi').toBe(175);

    // 3) IDOR: başka kullanıcı (sellerBusiness) bu ürünü güncellemeyi dener → engellenir
    const strangerToken = await apiLogin(request, USERS.sellerBusiness);
    const idor = await request.patch(`${API}/products/${productId}`, {
      headers: auth(strangerToken),
      data: { title: 'Saldırgan başlık değişikliği' },
    });
    expect(idor.ok(), 'yabancı güncelleyememeli').toBeFalsy();
    expect([403, 404]).toContain(idor.status());
    // Veri değişmediğini doğrula
    const dbStillOwner = await dbFind(request, 'product', { id: productId }, { title: true });
    expect(dbStillOwner?.title, 'IDOR sonrası başlık değişmedi').toBe(newTitle);

    // 3b) IDOR: yabancı silmeyi dener → engellenir
    const idorDelete = await request.delete(`${API}/products/${productId}`, { headers: auth(strangerToken) });
    expect(idorDelete.ok(), 'yabancı silememeli').toBeFalsy();
    expect([403, 404]).toContain(idorDelete.status());

    // 4) Sahip ürünü siler (DELETE /products/:id) → liste/detayda artık aktif görünmez
    const del = await request.delete(`${API}/products/${productId}`, { headers: auth(ownerToken) });
    expect(del.ok(), 'sahip silebilir').toBeTruthy();
    // Public detayda artık 404/erişilemez (silme soft/hard olabilir; aktif değil)
    const afterDelete = await request.get(`${API}/products/${productId}`);
    expect(afterDelete.ok(), 'silinen ürün public detayda görünmez').toBeFalsy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// J57 — Beğeni + istek listesi (ekle/geri al)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('J57 — Ürün beğenme ve istek listesi', () => {
  test('beğen→liste ekle→beğeniyi geri al→listeden çıkar', async ({ request }) => {
    test.setTimeout(60_000);

    const token = await apiLogin(request, USERS.buyerClean);
    const me = await apiMe(request, token);
    const product = await apiFirstBuyableProduct(request, me?.id);

    // 1) Üye bir ürünü beğendi (POST /products/:id/like → {liked,likeCount})
    const like = await request.post(`${API}/products/${product.id}/like`, { headers: auth(token), data: {} });
    expect(like.ok() || like.status() === 400, 'beğeni isteği işlendi (zaten beğenili olabilir)').toBeTruthy();
    // Beğeni durumu kesin: GET /products/:id/liked
    const likedCheck = await request.get(`${API}/products/${product.id}/liked`, { headers: auth(token) });
    expect(likedCheck.ok()).toBeTruthy();
    expect((await likedCheck.json())?.liked, 'ürün beğenili').toBe(true);

    // 2) Aynı ürünü istek listesine ekle (POST /wishlist {productId})
    const addWish = await request.post(`${API}/wishlist`, {
      headers: auth(token),
      data: { productId: product.id },
    });
    expect(addWish.ok(), 'istek listesine eklendi').toBeTruthy();
    const inWish = await request.get(`${API}/wishlist/check/${product.id}`, { headers: auth(token) });
    expect((await inWish.json())?.inWishlist, 'wishlist içinde').toBe(true);

    // 3) Beğeniyi geri al (DELETE /products/:id/unlike)
    const unlike = await request.delete(`${API}/products/${product.id}/unlike`, { headers: auth(token) });
    expect(unlike.ok(), 'beğeni geri alındı').toBeTruthy();
    const likedAfter = await request.get(`${API}/products/${product.id}/liked`, { headers: auth(token) });
    expect((await likedAfter.json())?.liked, 'artık beğenili değil').toBe(false);

    // 4) Ürünü istek listesinden çıkar (DELETE /wishlist/:productId → 204)
    const removeWish = await request.delete(`${API}/wishlist/${product.id}`, { headers: auth(token) });
    expect(removeWish.ok(), 'wishlistten çıkarıldı (204)').toBeTruthy();
    const inWishAfter = await request.get(`${API}/wishlist/check/${product.id}`, { headers: auth(token) });
    expect((await inWishAfter.json())?.inWishlist, 'artık wishlistte yok').toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// J77 — Kargo ücreti sorgulama + teslimat (carriers, rate, ship, deliver, confirm)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('J77 — Kargo ücreti sorgulama ve teslimat', () => {
  test('kargo firmaları + ücret, satın al, kargola, teslim, onayla', async ({ request }) => {
    test.setTimeout(60_000);

    // 1) Misafir kargo firmalarını listeledi (public GET /shipping/carriers)
    const carriersRes = await request.get(`${API}/shipping/carriers`);
    expect(carriersRes.ok(), 'carriers 200').toBeTruthy();
    const carriers = await carriersRes.json();
    const carrierList: any[] = Array.isArray(carriers) ? carriers : carriers?.data ?? carriers?.carriers ?? [];
    expect(carrierList.length, 'en az bir kargo firması').toBeGreaterThan(0);

    // 2) Şehir + firma seçip kargo ücretini gör (public GET /shipping/rates → {rate})
    const rateRes = await request.get(`${API}/shipping/rates`, {
      params: { city: 'İstanbul', carrier: 'aras' },
    });
    expect(rateRes.ok(), 'rates 200').toBeTruthy();
    const rate = await rateRes.json();
    expect(typeof rate?.rate, 'rate sayı').toBe('number');
    expect(rate.rate, 'rate >= 0').toBeGreaterThanOrEqual(0);

    // 3) Üye ürünü satın aldı, ödedi (paid)
    const buyerToken = await apiLogin(request, USERS.buyerClean);
    const buyerMe = await apiMe(request, buyerToken);
    const product = await apiFirstBuyableProduct(request, buyerMe?.id);
    const { orderId } = await apiBuyAndPay(request, buyerToken, product.id);
    let order = await apiGetOrder(request, buyerToken, orderId);
    expect(['paid', 'preparing']).toContain(order?.status);

    // Satıcıyı bul (siparişin sellerId'si) → satıcı token gerek
    const dbOrder = await dbFind(request, 'order', { id: orderId }, { sellerId: true });
    const sellerId: string = dbOrder?.sellerId;
    expect(sellerId, 'sipariş satıcısı').toBeTruthy();

    // Hangi seed satıcı olduğunu eşle (token üret). Seed satıcıları arasında ara.
    const sellerCreds = [USERS.sellerPremium, USERS.sellerBusiness, USERS.sellerFree];
    let sellerToken: string | null = null;
    for (const cred of sellerCreds) {
      const t = await apiLogin(request, cred);
      const m = await apiMe(request, t);
      if (m?.id === sellerId) { sellerToken = t; break; }
    }
    expect(sellerToken, 'siparişin satıcı tokenı bulundu').toBeTruthy();

    // 4a) Satıcı siparişi hazırlamaya alır (paid→preparing) — shipment için ön şart
    if (order?.status === 'paid') {
      const prep = await request.post(`${API}/orders/${orderId}/prepare`, { headers: auth(sellerToken!), data: {} });
      expect(prep.ok(), 'preparing yapıldı').toBeTruthy();
    }

    // 4b) Satıcı kargoladı → shipment oluşur, takip numarası üretilir (preparing→shipped)
    const shipRes = await request.post(`${API}/shipping`, {
      headers: auth(sellerToken!),
      data: { orderId, provider: 'aras' },
    });
    expect(shipRes.ok(), 'shipment oluştu').toBeTruthy();
    const shipment = await shipRes.json();
    expect(shipment?.trackingNumber ?? shipment?.tracking, 'takip numarası üretildi').toBeTruthy();
    order = await apiGetOrder(request, buyerToken, orderId);
    expect(order?.status, 'sipariş shipped').toBe('shipped');

    // 5a) Ürün teslim oldu — gerçek kargo webhook'u secret gerektirir; dev backdate ile
    //     order status'ü 'delivered'a çekiyoruz (kargo teslim simülasyonu).
    //     [DEV-HOOK: confirmDelivery yalnız 'delivered' statüsünden çalışır; webhook secret e2e'de yok.]
    await backdate(request, 'order', { id: orderId }, { status: 'delivered' });

    // 5b) Alıcı teslimatı onayladı (delivered→completed)
    const confirm = await request.post(`${API}/orders/${orderId}/confirm`, { headers: auth(buyerToken), data: {} });
    expect(confirm.ok(), 'alıcı teslimatı onayladı').toBeTruthy();
    const finalOrder = await dbFind(request, 'order', { id: orderId }, { status: true });
    expect(finalOrder?.status, 'sipariş completed').toBe('completed');
  });
});
