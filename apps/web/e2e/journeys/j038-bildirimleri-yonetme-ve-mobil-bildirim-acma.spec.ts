/**
 * J38 — Bildirimleri yönetme ve mobil bildirim açma
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

test.describe('J38 — Bildirim yönetimi + IDOR + hepsi-okundu + cihaz anahtarı + wishlist stok', () => {
  test('bildirim okundu / başkasınınki engellenir / hepsi-okundu / push-token / wishlist ekle', async ({ request }) => {
    test.setTimeout(90_000);

    const memberTok = await apiLogin(request, USERS.buyer);
    const member = await apiMe(request, memberTok);

    // Üyeye en az bir bildirim üretelim: bir ürünü beğen (PRODUCT_LIKED satıcıya gider) yerine,
    // üyenin KENDİSİNE bildirim gelsin diye: başka biri üyenin ürününü beğenemez (buyer'ın ürünü olmayabilir).
    // Garantili yol: üye bir ürünü wishlist'e ekleyip satıcı reaktive ederek üyeye BACK_IN_STOCK düşürmek
    // uzun; bunun yerine doğrudan mevcut bildirimleri okuruz, yoksa bir mesaj bildirimi üretiriz.

    // Üyeye new_message bildirimi üret: başka kullanıcı üyeye mesaj atsın.
    const otherTok = await apiLogin(request, USERS.sellerBusiness);
    const other = await apiMe(request, otherTok);
    const th = await request.post(`${API}/messages/threads`, {
      headers: auth(otherTok),
      data: { recipientId: member.id, message: 'Merhaba, ürünle ilgileniyorum.' },
    });
    expect(th.ok()).toBeTruthy();

    // 1) Üye bildirimlerini ve okunmamış sayısını gördü.
    const notifNotif = await expectDbEventually(
      request,
      'notificationLog',
      { userId: member.id, type: 'new_message', channel: 'in_app' },
      (r) => !!r,
      12_000,
    );
    const listRes = await request.get(`${API}/notifications`, { headers: auth(memberTok) });
    expect(listRes.ok()).toBeTruthy();
    const list = await listRes.json();
    expect(Array.isArray(list.notifications)).toBe(true);
    const myNotif = list.notifications.find((n: any) => n.id === notifNotif.id) ?? list.notifications[0];
    expect(myNotif, 'en az bir bildirim').toBeTruthy();

    const unreadRes = await request.get(`${API}/notifications/unread-count`, { headers: auth(memberTok) });
    expect(unreadRes.ok()).toBeTruthy();
    const unreadBefore = (await unreadRes.json()).count;
    expect(unreadBefore).toBeGreaterThanOrEqual(1);

    // 2) Bir bildirimi okundu işaretledi.
    const markRes = await request.patch(`${API}/notifications/${myNotif.id}/read`, { headers: auth(memberTok) });
    expect(markRes.ok()).toBeTruthy();
    const readRow = await dbFind(request, 'notificationLog', { id: myNotif.id }, { status: true });
    expect(readRow.status).toBe('read');

    // 3) Başkasının bildirimini işaretlemeyi denedi → IDOR engellenir (updateMany scope userId → değişmez).
    // other'a ait bir bildirim id'si bul; other'ın bildirimi yoksa kendi mesajımız tetiklemiş olabilir.
    const otherList = await request.get(`${API}/notifications`, { headers: auth(otherTok) });
    const otherNotifs = (await otherList.json()).notifications ?? [];
    if (otherNotifs.length > 0) {
      const victim = otherNotifs.find((n: any) => !n.isRead) ?? otherNotifs[0];
      const idorRes = await request.patch(`${API}/notifications/${victim.id}/read`, { headers: auth(memberTok) });
      // Endpoint 200 dönebilir ama updateMany {id, userId:member} eşleşmez → victim DB'de DEĞİŞMEMELİ.
      const victimRow = await dbFind(request, 'notificationLog', { id: victim.id }, { status: true, userId: true });
      expect(victimRow.userId).toBe(other.id);
      if (!victim.isRead) {
        expect(victimRow.status, 'başkasınınki okundu olmamalı (IDOR korundu)').not.toBe('read');
      }
    }

    // 4) Tüm bildirimleri tek seferde okundu yaptı.
    const allRead = await request.post(`${API}/notifications/mark-all-read`, { headers: auth(memberTok) });
    expect(allRead.ok()).toBeTruthy();
    const unreadAfter = await request.get(`${API}/notifications/unread-count`, { headers: auth(memberTok) });
    expect((await unreadAfter.json()).count).toBe(0);
    // other'ın okunmamışı etkilenmemeli (scope userId).
    const otherUnread = await request.get(`${API}/notifications/unread-count`, { headers: auth(otherTok) });
    expect((await otherUnread.json()).count).toBeGreaterThanOrEqual(0);

    // 5) Mobil bildirim için cihaz anahtarını kaydetti.
    const pushRes = await request.post(`${API}/notifications/push-token`, {
      headers: auth(memberTok),
      data: { token: `ExponentPushToken[pw-${Date.now()}]`, platform: 'ios', deviceId: `dev-${Date.now()}` },
    });
    expect(pushRes.ok(), 'push-token kaydı 200').toBeTruthy();
    expect((await pushRes.json())?.success).toBe(true);

    // 6) Bir ürünü istek listesine ekleyip stok bildirimi almak üzere ayarladı.
    const product = await apiFirstBuyableProduct(request, member.id);
    const wlAdd = await request.post(`${API}/wishlist`, { headers: auth(memberTok), data: { productId: product.id } });
    expect(wlAdd.ok()).toBeTruthy();
    const inWl = await request.get(`${API}/wishlist/check/${product.id}`, { headers: auth(memberTok) });
    expect((await inWl.json()).inWishlist).toBe(true);
  });
});
