/**
 * J103 — Mesajlaşma: katılımcı olmayan engelleniyor
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

test.describe('J103 — Mesajlaşma katılımcı IDOR + günlük limit', () => {
  test('yabancı thread\'e mesaj/görüntüleme engellenir, kalan günlük hak görünür', async ({ request }) => {
    test.setTimeout(60_000);

    // 1) Üye satıcıyla konuşma açtı, mesaj gönderdi.
    const buyerTok = await apiLogin(request, USERS.buyer);
    const buyer = await apiMe(request, buyerTok);
    const product = await apiFirstBuyableProduct(request, buyer.id);
    const thRes = await request.post(`${API}/messages/threads`, {
      headers: auth(buyerTok),
      data: { recipientId: product.sellerId, productId: product.id, message: 'Selam, fiyatta esneklik var mı?' },
    });
    expect(thRes.ok()).toBeTruthy();
    const threadId = (await thRes.json()).id;
    expect(threadId).toBeTruthy();

    // 2) Konuşmaya dahil olmayan biri mesaj göndermeye çalıştı → 403.
    const outsiderTok = await apiLogin(request, USERS.buyerClean);
    const outsider = await apiMe(request, outsiderTok);
    // Outsider gerçekten katılımcı değil mi? (buyerClean ≠ buyer ≠ seller)
    expect(outsider.id).not.toBe(buyer.id);
    expect(outsider.id).not.toBe(product.sellerId);

    const sendForbidden = await request.post(`${API}/messages/threads/${threadId}/messages`, {
      headers: auth(outsiderTok),
      data: { content: 'Ben de varım' },
    });
    expect(sendForbidden.ok()).toBeFalsy();
    expect([403, 404]).toContain(sendForbidden.status());

    // 3) Aynı kişi konuşmayı görmeye çalıştı → 403.
    const viewForbidden = await request.get(`${API}/messages/threads/${threadId}`, { headers: auth(outsiderTok) });
    expect(viewForbidden.ok()).toBeFalsy();
    expect([403, 404]).toContain(viewForbidden.status());

    // Mesaj listesi de korunmalı.
    const msgsForbidden = await request.get(`${API}/messages/threads/${threadId}/messages`, { headers: auth(outsiderTok) });
    expect(msgsForbidden.ok()).toBeFalsy();
    expect([403, 404]).toContain(msgsForbidden.status());

    // 4) Üye günlük kalan mesaj hakkını gördü, akış bitti.
    const limitRes = await request.get(`${API}/messages/daily-limit`, { headers: auth(buyerTok) });
    expect(limitRes.ok()).toBeTruthy();
    const limit = await limitRes.json();
    expect(typeof limit.remaining).toBe('number');
    expect(typeof limit.limit).toBe('number');
    expect(limit.remaining).toBeLessThanOrEqual(limit.limit);
    expect(limit.remaining).toBeGreaterThanOrEqual(0);
  });
});
