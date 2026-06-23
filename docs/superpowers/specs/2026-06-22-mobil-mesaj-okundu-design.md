# Mobil Mesajlarda "Okundu" (Read Receipt) — Tasarım

**Tarih:** 2026-06-22
**Kapsam:** `apps/mobile` — mesajlaşma thread ekranına okundu göstergesi (read receipt), web parity.

## Problem

Web'de mesajlar okundu çift mavi çentik (`MessageTicks`, [apps/web/src/app/messages/page.tsx](../../../apps/web/src/app/messages/page.tsx)) ile gösteriliyor ve `message:read` socket olayıyla canlı güncelleniyor. Mobilde bu yok:

- [messages/[threadId].tsx](../../../apps/mobile/app/messages/[threadId].tsx) `getMessageStatus` ✓/✓✓ gösteriyor ama `delivered` ve `read` ikisi de aynı gri `✓✓` — okundu görsel olarak ayırt edilmiyor.
- [_layout.tsx](../../../apps/mobile/app/_layout.tsx) socket'te `message:new` + `thread:updated` dinliyor; **`message:read` dinlenmiyor** → karşı taraf okuyunca gönderenin tiki canlı dönmüyor.
- `messagesStore.markAsRead` thread açılınca thread'deki **tüm** mesajları `status:'read'` yapıyor; bu, kullanıcının **kendi gönderdiği** mesajları da (karşı taraf okumamış olsa bile) okundu gösterir — yanlış.
- Mobil `Message` tipinde `readAt` alanı yok; tik yalnız `status` string'inden sürülüyor, ilk yüklemede backend `readAt` bilgisi kullanılmıyor.

## Backend (hazır, değişmeyecek)

- Thread mesajları çekilince (`getThreadMessages`) okunmamış mesajlar (`receiverId=userId, readAt=null`) `readAt` ile işaretlenir.
- `realtime.emitMessageRead(threadId, readerId, messageIds)` → thread odasına `message:read` olayı yayılır, payload: `{ threadId, readerId, messageIds }`.
- Mesaj DTO'su `readAt?: Date` döndürür.
- Mobil thread ekranı zaten `join:thread` emit ediyor, yani thread odasındaki `message:read` olayını alabilir.

## Çözüm

### 1. Görsel ayrım — `getMessageStatus` + balon render

Kendi gönderilen mesajda (`isOwn`):
- Okunmadı → gri tek çentik `✓`
- Okundu → **mavi çift çentik `✓✓`** (web `text-sky-400` parity — mobil tema mavi tonu kullanılır)
- `pending_approval` → `⏳`, `rejected` → `❌` (korunur)

Render zaten yalnız `isOwn` mesajlarda tik gösteriyor; değişiklik tik içeriği + okundu durumunda renk. "Okundu" ölçütü: mesajın `status === 'read'` olması (aşağıdaki kaynaklarla set edilir).

### 2. Canlı güncelleme — socket `message:read`

- `messagesStore`'a yeni action: `applyMessagesRead(threadId: string, messageIds: string[])` — verilen id'lere sahip mesajların `status`'unu `'read'` yapar (yalnız o thread'de).
- [_layout.tsx](../../../apps/mobile/app/_layout.tsx) global socket kurulumunda `socket.on('message:read', onMessageRead)` eklenir; handler payload'tan `{ threadId, messageIds }` alıp `applyMessagesRead`'i çağırır. `socket.off('message:read', ...)` ile temizlenir (mevcut `message:new` deseni gibi). Web `useMessagingSocket` parity.

Böylece kullanıcı thread'i açıkken karşı taraf okursa gönderen tarafın tikleri anında maviye döner.

### 3. İlk yükleme doğruluğu — `readAt` → `status:'read'` map

- Mobil `Message` modeline `readAt?: string` eklenir (opsiyonel).
- `fetchMessages` normalizasyonunda: backend'den gelen mesajın `readAt` doluysa `status` `'read'` olarak set edilir. Böylece thread ilk açıldığında, karşı tarafın daha önce okuduğu mesajlar doğru (mavi çift çentik) gösterilir — socket olayı beklenmeden.

### 4. `markAsRead` düzeltmesi

`messagesStore.markAsRead(threadId)` thread açılınca artık **kendi gönderilen** mesajları `status:'read'` yapmaz. Yalnız okunmamış sayaç muhasebesi (thread `unreadCount` → 0, `totalUnreadCount` düşüşü) korunur. Kullanıcının kendi mesajının okundu tiki **yalnızca** karşı tarafın okuması (socket `message:read` veya yüklemede `readAt`) ile mavi olur.

> Not: Halen received (karşı tarafın) mesajlarını yerelde `'read'` işaretlemek zararsız (tik yalnız `isOwn`'da gösterilir) ama gereksiz; düzeltme, güncellemeyi `senderId === currentUserId` olan mesajlardan dışlamak yerine, "kendi mesajlarımı socket/`readAt` dışında read yapma" kuralıyla yapılır. Pratikte: `markAsRead` mesaj `status` alanına dokunmaz; sadece sayaç alanlarını günceller.

### 5. Test

- `messagesStore`:
  - `applyMessagesRead(threadId, ids)` yalnız verilen id'leri `'read'` yapar, başka thread/mesajı etkilemez.
  - `markAsRead(threadId)` kendi gönderilen mesajların `status`'unu değiştirmez (read receipt'i bozmaz); sayaçları günceller.
  - `fetchMessages` (veya normalizasyon helper'ı) `readAt` dolu mesajı `status:'read'` map'ler.
- Thread ekranı (varsa mevcut test desenine uygun): okundu mesaj mavi çift çentik render eder; okunmamış gri tek çentik.

## Kapsam Dışı (YAGNI)

- Backend değişmez (endpoint + socket hazır).
- "Yazıyor…" (typing indicator) eklenmez.
- Bu oturumda raporlanan diğer iki konu (duplicate thread görünümü, mesaj rozeti) ayrı işlerdir; bu spec'e dahil değil.

## Etkilenen Dosyalar

- `apps/mobile/src/stores/messagesStore.ts` — `Message.readAt`, `applyMessagesRead`, `markAsRead` düzeltmesi, `fetchMessages` readAt→status map.
- `apps/mobile/app/_layout.tsx` — `message:read` socket listener.
- `apps/mobile/app/messages/[threadId].tsx` — `getMessageStatus` + tik render (okundu mavi çift çentik).
- `apps/mobile/src/stores/__tests__/` — store testleri (yeni/var olana ek).
