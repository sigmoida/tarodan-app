/**
 * J17 — Kullanıcı başka birini engelliyor
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

test.describe('J17 — Engelle / engeli kaldır / kendini engelleme reddi', () => {
  test('engelle → listede görünür → engeli kaldır → kendini engelleme reddedilir → profil güncelle', async ({ request }) => {
    test.setTimeout(60_000);

    // Üye (engelleyen) ve rahatsız eden kullanıcı.
    const memberTok = await apiLogin(request, USERS.buyer);
    const me = await apiMe(request, memberTok);
    const targetTok = await apiLogin(request, USERS.sellerPremium);
    const target = await apiMe(request, targetTok);

    // 1) Üye, rahatsız eden bir kullanıcıyı engelledi.
    const blockRes = await request.post(`${API}/users/${target.id}/block`, { headers: auth(memberTok) });
    expect(blockRes.ok(), 'engelle 2xx').toBeTruthy();
    expect((await blockRes.json())?.success).toBe(true);

    // 2) Engellenen kişi engellenenler listesinde göründü.
    let blockedList = await request.get(`${API}/users/me/blocked`, { headers: auth(memberTok) });
    expect(blockedList.ok()).toBeTruthy();
    let blocked = await blockedList.json();
    expect((blocked ?? []).map((u: any) => u.id)).toContain(target.id);

    // 3) Üye daha sonra fikir değiştirip engeli kaldırdı.
    const unblockRes = await request.delete(`${API}/users/${target.id}/block`, { headers: auth(memberTok) });
    expect(unblockRes.ok(), 'engeli kaldır 2xx').toBeTruthy();
    blockedList = await request.get(`${API}/users/me/blocked`, { headers: auth(memberTok) });
    blocked = await blockedList.json();
    expect((blocked ?? []).map((u: any) => u.id)).not.toContain(target.id);

    // Engeli olmayanı tekrar kaldırma → 404 (red kontrolü).
    const unblockAgain = await request.delete(`${API}/users/${target.id}/block`, { headers: auth(memberTok) });
    expect(unblockAgain.ok()).toBeFalsy();
    expect([400, 404]).toContain(unblockAgain.status());

    // 4) Üye kendini engellemeyi denedi, kabul edilmedi (400).
    const selfBlock = await request.post(`${API}/users/${me.id}/block`, { headers: auth(memberTok) });
    expect(selfBlock.ok()).toBeFalsy();
    expect([400, 403]).toContain(selfBlock.status());

    // 5) Üye profil adını ve biyografisini güncelledi, akış bitti.
    const newName = `PW Engel ${Date.now() % 100000}`;
    const newBio = `Test bio ${Date.now()}`;
    const profRes = await request.patch(`${API}/users/me`, {
      headers: auth(memberTok),
      data: { displayName: newName, bio: newBio },
    });
    expect(profRes.ok(), 'profil güncelle 2xx').toBeTruthy();
    const fresh = await apiMe(request, memberTok);
    expect(fresh.displayName).toBe(newName);
    expect(fresh.bio).toBe(newBio);
  });
});
