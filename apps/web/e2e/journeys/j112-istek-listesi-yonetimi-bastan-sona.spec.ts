/**
 * J112 — İstek listesi yönetimi baştan sona
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

test.describe('J112 — İstek listesi yönetimi (ekle/dedup/sorgu/çıkar/temizle)', () => {
  test('birkaç ürün ekle, dedup, sorgula, bir ürün çıkar, listeyi temizle', async ({ request }) => {
    test.setTimeout(60_000);

    const buyerTok = await apiLogin(request, USERS.buyerClean);
    const buyer = await apiMe(request, buyerTok);

    // Temiz başlangıç: mevcut wishlist'i temizle.
    await request.delete(`${API}/wishlist`, { headers: auth(buyerTok) });

    // Birkaç farklı satın alınabilir ürün topla.
    const listRes = await request.get(`${API}/products`, { params: { status: 'active', limit: '30' } });
    const all: any[] = (await listRes.json())?.data ?? [];
    const buyables = all.filter(
      (p) => p.sellerId !== buyer.id && !String(p.id).startsWith('membership-') && !String(p.id).startsWith('boost-'),
    );
    expect(buyables.length, 'en az 2 ürün gerekli').toBeGreaterThanOrEqual(2);
    const [p1, p2] = buyables;

    // 1) Üye birkaç ürünü istek listesine ekledi.
    expect((await request.post(`${API}/wishlist`, { headers: auth(buyerTok), data: { productId: p1.id } })).ok()).toBeTruthy();
    expect((await request.post(`${API}/wishlist`, { headers: auth(buyerTok), data: { productId: p2.id } })).ok()).toBeTruthy();

    const wl = await dbFind(request, 'wishlist', { userId: buyer.id }, { id: true });
    expect(await dbCount(request, 'wishlistItem', { wishlistId: wl.id })).toBe(2);

    // 2) Aynı ürünü ikinci kez ekledi → tek kayıt.
    expect((await request.post(`${API}/wishlist`, { headers: auth(buyerTok), data: { productId: p1.id } })).ok()).toBeTruthy();
    expect(await dbCount(request, 'wishlistItem', { wishlistId: wl.id })).toBe(2);

    // 3) Bir ürünün listede olup olmadığını sorguladı.
    const check1 = await request.get(`${API}/wishlist/check/${p1.id}`, { headers: auth(buyerTok) });
    expect((await check1.json()).inWishlist).toBe(true);
    // Listede olmayan rastgele bir ürün → false (p2'yi sonra çıkarınca da test ederiz).
    const someOther = buyables.find((p) => p.id !== p1.id && p.id !== p2.id);
    if (someOther) {
      const checkX = await request.get(`${API}/wishlist/check/${someOther.id}`, { headers: auth(buyerTok) });
      expect((await checkX.json()).inWishlist).toBe(false);
    }

    // 4) Bir ürünü listeden çıkardı.
    const rem = await request.delete(`${API}/wishlist/${p2.id}`, { headers: auth(buyerTok) });
    expect(rem.ok()).toBeTruthy();
    expect(await dbCount(request, 'wishlistItem', { wishlistId: wl.id })).toBe(1);
    const check2 = await request.get(`${API}/wishlist/check/${p2.id}`, { headers: auth(buyerTok) });
    expect((await check2.json()).inWishlist).toBe(false);

    // Listede olmayan ürünü tekrar çıkarma → 404 (red kontrolü).
    const remAgain = await request.delete(`${API}/wishlist/${p2.id}`, { headers: auth(buyerTok) });
    expect(remAgain.ok()).toBeFalsy();
    expect([400, 404]).toContain(remAgain.status());

    // 5) Listeyi tümüyle temizledi.
    const clear = await request.delete(`${API}/wishlist`, { headers: auth(buyerTok) });
    expect(clear.ok()).toBeTruthy();
    expect(await dbCount(request, 'wishlistItem', { wishlistId: wl.id })).toBe(0);
  });
});
