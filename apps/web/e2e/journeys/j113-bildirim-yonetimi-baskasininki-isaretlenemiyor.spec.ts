/**
 * J113 — Bildirim yönetimi: başkasınınki işaretlenemiyor
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

test.describe('J113 — Bildirim IDOR + hepsi-okundu + cihaz anahtarı', () => {
  test('bildirimi okundu yap, başkasınınki engellenir, hepsi-okundu, push-token', async ({ request }) => {
    test.setTimeout(90_000);

    const memberTok = await apiLogin(request, USERS.buyerClean);
    const member = await apiMe(request, memberTok);
    const otherTok = await apiLogin(request, USERS.sellerFree);
    const other = await apiMe(request, otherTok);

    // Üyeye bildirim üret: başkası üyeye mesaj atsın → new_message.
    const th = await request.post(`${API}/messages/threads`, {
      headers: auth(otherTok),
      data: { recipientId: member.id, message: 'Bildirim üretmek için mesaj.' },
    });
    expect(th.ok()).toBeTruthy();
    const myNotif = await expectDbEventually(
      request,
      'notificationLog',
      { userId: member.id, type: 'new_message', channel: 'in_app', status: 'sent' },
      (r) => !!r,
      12_000,
    );

    // 1) Üye bildirimlerini ve okunmamış sayısını gördü.
    const unread0 = (await (await request.get(`${API}/notifications/unread-count`, { headers: auth(memberTok) })).json()).count;
    expect(unread0).toBeGreaterThanOrEqual(1);

    // 2) Bir bildirimi okundu işaretledi.
    expect((await request.patch(`${API}/notifications/${myNotif.id}/read`, { headers: auth(memberTok) })).ok()).toBeTruthy();
    expect((await dbFind(request, 'notificationLog', { id: myNotif.id }, { status: true })).status).toBe('read');

    // 3) Başkasının bildirimini işaretlemeye çalıştı → engellendi (DB'de değişmez).
    // member başkasına (other) mesaj atarak other'a bir new_message bildirimi üretelim.
    const th2 = await request.post(`${API}/messages/threads`, {
      headers: auth(memberTok),
      data: { recipientId: other.id, message: 'Karşı tarafa bildirim üret.' },
    });
    expect(th2.ok()).toBeTruthy();
    const victim = await expectDbEventually(
      request,
      'notificationLog',
      { userId: other.id, type: 'new_message', channel: 'in_app', status: 'sent' },
      (r) => !!r,
      12_000,
    );
    await request.patch(`${API}/notifications/${victim.id}/read`, { headers: auth(memberTok) }); // member, other'ınkini deniyor
    const victimRow = await dbFind(request, 'notificationLog', { id: victim.id }, { status: true, userId: true });
    expect(victimRow.userId).toBe(other.id);
    expect(victimRow.status, 'başkasınınki okunmamalı (IDOR korundu)').toBe('sent');

    // 4) Tüm bildirimleri tek seferde okundu yaptı.
    expect((await request.post(`${API}/notifications/mark-all-read`, { headers: auth(memberTok) })).ok()).toBeTruthy();
    expect((await (await request.get(`${API}/notifications/unread-count`, { headers: auth(memberTok) })).json()).count).toBe(0);
    // other'ınki hâlâ okunmamış (scope korundu).
    const victimAfter = await dbFind(request, 'notificationLog', { id: victim.id }, { status: true });
    expect(victimAfter.status).toBe('sent');

    // 5) Mobil bildirim için cihaz anahtarı kaydetti.
    const push = await request.post(`${API}/notifications/push-token`, {
      headers: auth(memberTok),
      data: { token: `ExponentPushToken[pw113-${Date.now()}]`, platform: 'android', deviceId: `dev113-${Date.now()}` },
    });
    expect(push.ok()).toBeTruthy();
    expect((await push.json())?.success).toBe(true);
  });
});
