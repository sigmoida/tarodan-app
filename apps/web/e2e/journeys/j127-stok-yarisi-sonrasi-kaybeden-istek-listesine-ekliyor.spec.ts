/**
 * J127 — Stok yarışı sonrası kaybeden istek listesine ekliyor
 * Kaynak: suite-i-messaging.spec.ts (otomatik ayrıştırıldı). Tek senaryo = tek dosya.
 */
/**
 * Suite I — Mesaj / Bildirim / İstek Listesi journey'leri (hibrit: API + UI).
 *
 * Kapsanan journey'ler:
 *  J16  — İçerik filtresi: telefon no + aralıklı yazma filtreye takılır, moderasyona düşer.
 *  J17  — Engelle / engeli kaldır + kendini engelleme reddi + profil güncelleme.
 *  J21  — İstek listesi: stok bitince ekleme, dedup, tekrar stokta bildirimi, Hemen Al, çıkar.
 *  J38  — Bildirim okundu + IDOR + hepsi-okundu + cihaz (push) anahtarı + wishlist stok ayarı.
 *  J103 — Mesajlaşma: katılımcı olmayan IDOR (gönder/görüntüle) + günlük limit görüntüleme.
 *  J112 — İstek listesi yönetimi: ekle, dedup, sorgu, çıkar, tümünü temizle.
 *  J113 — Bildirim yönetimi: başkasınınki işaretlenemez + hepsi-okundu + cihaz anahtarı.
 *  J127 — Stok yarışı: kaybeden istek listesine ekler, stok gelince bildirim, sonra satın alır.
 *
 * Gerçek backend + tarodan_test DB + Mailhog. Endpointler controller'dan doğrulandı:
 *  - messages: POST /messages/threads, POST /messages/threads/:id/messages,
 *    GET /messages/threads/:id, GET /messages/daily-limit, GET /messages/admin/pending (admin).
 *  - notifications: GET /notifications, GET /notifications/unread-count,
 *    PATCH /notifications/:id/read, POST /notifications/mark-all-read, POST /notifications/push-token.
 *  - wishlist: POST /wishlist {productId}, GET /wishlist, GET /wishlist/check/:productId,
 *    DELETE /wishlist/:productId, DELETE /wishlist.
 *  - block: POST /users/:id/block, DELETE /users/:id/block, GET /users/me/blocked.
 *
 * DB notları (controller/service okunarak doğrulandı):
 *  - in-app bildirimler `notificationLog` modelinde (channel='in_app', status 'sent'|'read').
 *  - mesajlar `message` modelinde; telefon → seed filtresi requiresApproval=true → status pending_approval.
 *  - kullanıcı engelleri DB'de DEĞİL (in-memory Map) → assertion GET /users/me/blocked üzerinden.
 *  - back-in-stock: ürün inactive/sold iken PATCH /products/:id {status:active, quantity>0} →
 *    broadcastBackInStock → notificationLog BACK_IN_STOCK satırı (async, expectDbEventually).
 */
import { test, expect } from '@playwright/test';
import {
  API,
  USERS,
  apiLogin,
  apiMe,
  apiFirstBuyableProduct,
  apiBuyAndPay,
  apiDefaultAddressId,
} from '../support/helpers';
import { dbFind, dbCount, expectDbEventually, backdate } from '../support/db';

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

/** Bir satıcıya ait, alıcının satın alabileceği ürün bul (thread/wishlist için). */
async function buyableProduct(request: any, buyerId: string) {
  return apiFirstBuyableProduct(request, buyerId);
}

// ===========================================================================
// J16 — İçerik filtresi: iletişim bilgisi paylaşımı engelleniyor
// ===========================================================================

test.describe('J127 — Stok yarışı: kaybeden istek listesine ekler, stok gelince satın alır', () => {
  test('iki alıcı son adedi ister, biri kazanır, kaybeden wishlist + back-in-stock + satın alır', async ({ request }) => {
    test.setTimeout(120_000);

    // İki alıcı: buyer (kazanan), buyerClean (kaybeden). Satıcı ürün sahibi.
    const winnerTok = await apiLogin(request, USERS.buyer);
    const winner = await apiMe(request, winnerTok);
    const loserTok = await apiLogin(request, USERS.buyerClean);
    const loser = await apiMe(request, loserTok);

    // Son adetli (quantity=1) bir ürün hazırla: bir ürünü seç, satıcı token'ıyla quantity=1 yap.
    const product = await apiFirstBuyableProduct(request, winner.id);
    expect(product.sellerId).not.toBe(winner.id);
    expect(product.sellerId).not.toBe(loser.id);
    const ownerTok = await apiLoginAsOwner(request, product.sellerId);

    // Stok=1 ayarla (manuel turdaki "son adet").
    const setOne = await request.patch(`${API}/products/${product.id}`, {
      headers: auth(ownerTok),
      data: { status: 'active', quantity: 1 },
    });
    if (!setOne.ok()) {
      await backdate(request, 'product', { id: product.id }, { status: 'active', quantity: 1 });
    }
    const oneDb = await dbFind(request, 'product', { id: product.id }, { quantity: true });
    expect(Number(oneDb.quantity)).toBe(1);

    // 1) İki alıcı son adedi aynı anda almak istedi → ikisi de orders/buy denesin.
    const winnerAddr = await apiDefaultAddressId(request, winnerTok);
    const loserAddr = await apiDefaultAddressId(request, loserTok);
    const [buyA, buyB] = await Promise.all([
      request.post(`${API}/orders/buy`, { headers: auth(winnerTok), data: { productId: product.id, shippingAddressId: winnerAddr } }),
      request.post(`${API}/orders/buy`, { headers: auth(loserTok), data: { productId: product.id, shippingAddressId: loserAddr } }),
    ]);

    // 2) Biri kazandı, diğeri 'stok yok' aldı. (Hangisinin kazandığı yarışa bağlı; sonucu duruma göre belirle.)
    const aOk = buyA.ok();
    const bOk = buyB.ok();
    // Tam olarak biri başarılı olmalı (son adet, tek sipariş).
    expect(aOk !== bOk, 'son adette tam olarak bir alıcı kazanmalı').toBe(true);

    const loserActualTok = aOk ? loserTok : winnerTok;
    const loserActual = aOk ? loser : winner;
    const failed = aOk ? buyB : buyA;
    expect(failed.ok()).toBeFalsy();
    expect([400, 409]).toContain(failed.status());

    // Kazanan ödesin ki ürün gerçekten tükensin (sold/inactive).
    const winnerActualTok = aOk ? winnerTok : loserTok;
    const winBuyBody = await (aOk ? buyA : buyB).json();
    const winOrderId = winBuyBody?.orderId ?? winBuyBody?.id;
    expect(winOrderId).toBeTruthy();
    const initRes = await request.post(`${API}/payments/initiate`, {
      headers: auth(winnerActualTok),
      data: { orderId: winOrderId, provider: 'paytr' },
    });
    expect(initRes.ok()).toBeTruthy();
    const paymentId = (await initRes.json())?.paymentId;
    await request.post(`${API}/payments/${paymentId}/bypass-complete`, { data: {} });

    // 3) Kaybeden ürünü istek listesine ekledi.
    const add = await request.post(`${API}/wishlist`, { headers: auth(loserActualTok), data: { productId: product.id } });
    expect(add.ok(), 'kaybeden wishlist ekle').toBeTruthy();
    const loserWl = await dbFind(request, 'wishlist', { userId: loserActual.id }, { id: true });
    expect(await dbCount(request, 'wishlistItem', { wishlistId: loserWl.id, productId: product.id })).toBe(1);

    // 4) Stok geri gelince 'tekrar stokta' bildirimi aldı.
    // Satıcı stoğu yeniler → reactivation → broadcastBackInStock.
    const reactivate = await request.patch(`${API}/products/${product.id}`, {
      headers: auth(ownerTok),
      data: { status: 'active', quantity: 2 },
    });
    if (!reactivate.ok()) {
      // Ürün sold ise update servisi sadece sold/inactive→active reaktivasyona izin verir; teyit et.
      const st = await dbFind(request, 'product', { id: product.id }, { status: true });
      expect(['sold', 'inactive', 'active']).toContain(st.status);
      // Doğrudan back-in-stock fan-out'unu tetiklemek için tekrar dene (status'u sold'a indirip).
      await backdate(request, 'product', { id: product.id }, { status: 'inactive', quantity: 0 });
      const retry = await request.patch(`${API}/products/${product.id}`, {
        headers: auth(ownerTok),
        data: { status: 'active', quantity: 2 },
      });
      expect(retry.ok(), 'reactivate (retry)').toBeTruthy();
    }
    const backStock = await expectDbEventually(
      request,
      'notificationLog',
      { userId: loserActual.id, type: 'back_in_stock', channel: 'in_app' },
      (r) => !!r,
      15_000,
    );
    expect(backStock.type).toBe('back_in_stock');

    // 5) Ürünü bu kez satın aldı, akış tamamlandı.
    const { orderId } = await apiBuyAndPay(request, loserActualTok, product.id);
    const order = await dbFind(request, 'order', { id: orderId }, { status: true, buyerId: true });
    expect(order.buyerId).toBe(loserActual.id);
    expect(['paid', 'preparing', 'shipped', 'completed']).toContain(order.status);
  });
});

// ===========================================================================
// Yardımcı: ürün sahibi satıcının token'ını e-posta eşleştirmesiyle al.
// (Seed satıcıları arasından sellerId'ye karşılık geleni bul; bulunamazsa ahmet'e düş.)
// ===========================================================================
async function apiLoginAsOwner(request: any, sellerId: string): Promise<string> {
  const candidates = [USERS.sellerPremium, USERS.sellerBusiness, USERS.sellerFree];
  for (const c of candidates) {
    const tok = await apiLogin(request, c);
    const me = await apiMe(request, tok);
    if (me.id === sellerId) return tok;
  }
  // Eşleşme yoksa: bu satıcı seed seller'larından biri değil; premium token'ı dön (PATCH 403 olursa
  // çağıran taraf backdate fallback'ine düşer).
  return apiLogin(request, USERS.sellerPremium);
}
