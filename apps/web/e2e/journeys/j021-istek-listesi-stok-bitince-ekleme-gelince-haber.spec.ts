/**
 * J21 — İstek listesi: stok bitince ekleme, gelince haber alma
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

test.describe('J21 — İstek listesi back-in-stock + dedup + satın al + çıkar', () => {
  test('stok bitik ürünü ekle (dedup) → stok gelince bildirim → satın al → listeden çıkar', async ({ request }) => {
    test.setTimeout(90_000);

    // buyerClean: ilanı yok, her ürünü alabilir.
    const buyerTok = await apiLogin(request, USERS.buyerClean);
    const buyer = await apiMe(request, buyerTok);

    // Satıcı (sellerPremium) ürünü; stoğunu bitirip wishlist akışını tetikleyeceğiz.
    const sellerTok = await apiLogin(request, USERS.sellerPremium);
    const seller = await apiMe(request, sellerTok);
    const product = await apiFirstBuyableProduct(request, buyer.id);
    // Ürünün satıcısı sellerPremium değilse, kendi token'ıyla güncelleyemeyiz → satıcı token'ını ürüne göre seç.
    const ownerTok = product.sellerId === seller.id ? sellerTok : await apiLoginAsOwner(request, product.sellerId);

    // 1) Üye beğendiği ürünü istek listesine ekledi (henüz stoklu; sonra stoğu sıfırlanacak senaryo).
    const add1 = await request.post(`${API}/wishlist`, { headers: auth(buyerTok), data: { productId: product.id } });
    expect(add1.ok(), 'wishlist ekle 2xx').toBeTruthy();

    // 2) Aynı ürünü ikinci kez eklemeyi denedi → idempotent, tek kayıt.
    const add2 = await request.post(`${API}/wishlist`, { headers: auth(buyerTok), data: { productId: product.id } });
    expect(add2.ok()).toBeTruthy();
    const wl = await dbFind(request, 'wishlist', { userId: buyer.id }, { id: true });
    const itemCount = await dbCount(request, 'wishlistItem', { wishlistId: wl.id, productId: product.id });
    expect(itemCount, 'dedup → tek kayıt').toBe(1);

    // Ürünü stokta yok (inactive) yap: önce mevcut quantity'yi sıfırla, status inactive.
    // (Manuel turda satıcı stoğu bitirmiş ürünü temsil eder.)
    const setOut = await request.patch(`${API}/products/${product.id}`, {
      headers: auth(ownerTok),
      data: { status: 'inactive', quantity: 0 },
    });
    // Bazı durumlar inactive'e doğrudan izin vermeyebilir; izin vermezse backdate yerine reactivate yine de test edilir.
    if (!setOut.ok()) {
      // dev hook ile stok ve status'u doğrudan sıfırla (zaman/durum yolculuğu).
      await backdate(request, 'product', { id: product.id }, { status: 'inactive', quantity: 0 });
    }
    const outDb = await dbFind(request, 'product', { id: product.id }, { status: true, quantity: true });
    expect(['inactive', 'sold']).toContain(outDb.status);

    // 3) Satıcı stok ekledi → ürün tekrar müsait (reactivation → broadcastBackInStock tetiklenir).
    const reactivate = await request.patch(`${API}/products/${product.id}`, {
      headers: auth(ownerTok),
      data: { status: 'active', quantity: 3 },
    });
    expect(reactivate.ok(), 'reactivate (status active + quantity>0)').toBeTruthy();
    const backDb = await dbFind(request, 'product', { id: product.id }, { status: true, quantity: true });
    expect(backDb.status).toBe('active');
    expect(Number(backDb.quantity)).toBeGreaterThan(0);

    // 4) Sisteme 'tekrar stokta' bildirimi geldi (async fan-out) → notificationLog BACK_IN_STOCK.
    const stockNotif = await expectDbEventually(
      request,
      'notificationLog',
      { userId: buyer.id, type: 'back_in_stock', channel: 'in_app' },
      (row) => !!row,
      12_000,
    );
    expect(stockNotif.type).toBe('back_in_stock');

    // 5) Üye ürünü istek listesinden açıp 'Hemen Al' yaptı, ödedi.
    const { orderId } = await apiBuyAndPay(request, buyerTok, product.id);
    const order = await dbFind(request, 'order', { id: orderId }, { status: true, buyerId: true });
    expect(order.buyerId).toBe(buyer.id);
    expect(['paid', 'preparing', 'shipped', 'completed']).toContain(order.status);

    // 6) Sipariş tamamlandı, üye ürünü istek listesinden çıkardı.
    const remove = await request.delete(`${API}/wishlist/${product.id}`, { headers: auth(buyerTok) });
    expect(remove.ok(), 'wishlist çıkar 204').toBeTruthy();
    const afterCount = await dbCount(request, 'wishlistItem', { wishlistId: wl.id, productId: product.id });
    expect(afterCount).toBe(0);
  });
});
