# Mesajlaşma & Bildirim Real-Time Katmanı — Tasarım

**Tarih:** 2026-06-19
**Durum:** Onaylandı, implementasyon planı bekliyor

## Problem

Kullanıcı feedback'leri: mesajlaşma sayfası "bazen düzgün bazen yanlış" çalışıyor.
Tipik belirti: yeni mesaj geliyor, sol taraftaki **konuşma önizlemesi** güncelleniyor,
ama sohbet açıkken **mesaj ekranında mesaj görünmüyor**.

### Kök neden

Backend'de WebSocket gateway (`TarodanWebSocketGateway`) yazılmış ama **hiçbir frontend
ona bağlanmıyor**. Web ve mobil tamamen REST + React Query / Zustand cache'ine dayanıyor:

- `messaging.service.sendMessage()` mesajı DB'ye yazıyor ama **hiçbir socket event'i yaymıyor**
  (`message:new` yalnızca kullanılmayan `message:send` socket handler'ında var).
- Web'de açık sohbet `['messages', threadId]` cache'iyle bir kez yükleniyor; gelen mesaj için
  yeniden çekilmiyor → boş kalır.
- Sol önizleme (`message-threads`) ara sıra invalidate olduğu için güncelleniyor → asimetri.

Yani "anlık sistem zor" değil — **anlık katman hiç bağlı değil**, her şey tutarsız polling'e bakıyor.

### Mevcut durum tespiti (kod)

- `apps/api/src/modules/websocket/websocket.gateway.ts`
  - JWT auth **çalışıyor** (`handshake.auth.token`), bağlanınca `user:{userId}` odasına katılıyor.
  - `notification:new` / `sendNotificationToUser()` **yazılmış** ama service'ler çağırmıyor.
  - `message:send` handler'ı (satır 144-159) **DB'ye yazmadan, filtreden geçmeden** ham içerik
    broadcast ediyor — tutarsızlık ve güvenlik riski.
- `apps/web/src/app/messages/page.tsx` — socket yok, sadece REST + manuel invalidate.
- `apps/mobile/src/stores/messagesStore.ts` — socket yok, focus-based fetch + optimistic update.

## Temel Prensip

**Socket haber verir, REST doğrular, DB tek gerçektir.**

Her mesaj REST `POST` → DB → `message:new` event'i yolundan geçer. Hiçbir mesaj socket
üzerinden DB'ye uğramadan yayılmaz. Tüm eklemeler **mesaj id'sine göre dedupe** edilir;
event + catch-up çakışsa bile mükerrer/eksik olmaz.

## Mimari

### 1. Backend — event omurgası (apps/api)

- **`RealtimeService` (ince emitter):** Gateway'i doğrudan service'lere enjekte etmek yerine,
  dairesel bağımlılık riskini önlemek için gateway'i saran küçük servis.
  - `emitNewMessage(threadId, receiverId, messageDto)`
  - `emitMessageRead(threadId, readerId, messageIds)`
  - `emitNotification(userId, notification)`
  - `WebSocketModule` bu servisi (veya gateway'i) export eder; `MessagingModule` ve
    `NotificationModule` import eder.
- **`messaging.service.sendMessage()`** (REST yolu): mesaj DB'ye yazıldıktan sonra (status `sent`):
  - `thread:{threadId}` → `message:new` (tam DTO: id, content, senderId, receiverId, status, createdAt)
  - alıcının `user:{receiverId}` → `thread:updated` (önizleme + okunmamış sayacı tazelensin)
- **`message:send` socket handler'ı kaldırılır** (DB-bypass eden broadcast). `join:thread`,
  `leave:thread`, `typing:start/stop` kalır.
- **`notification.service.createInAppNotification()`**: in-app kaydı oluştururken
  `RealtimeService.emitNotification()` ile `notification:new` yayar. Mevcut push akışı
  **olduğu gibi** korunur (artık in-app rozeti de anlık).
- **`markAsRead`** REST'i çalışınca `thread:{threadId}` → `message:read` (çift tik).

### 2. Olay sözleşmeleri (shared types)

`packages/types` içine tiplenmiş event payload'ları — web + mobil + api aynı sözleşmeyi paylaşır:

- `MessageNewEvent` — `{ threadId, message: MessageDto }`
- `ThreadUpdatedEvent` — `{ threadId, lastMessage, unreadCount }`
- `NotificationNewEvent` — `{ id, type, data, createdAt }`
- `TypingEvent` — `{ threadId, userId, displayName? }`
- `MessageReadEvent` — `{ threadId, readerId, messageIds }`

### 3. Frontend — paylaşılan socket client katmanı

Hem web hem mobilde **tek kalıcı socket.io bağlantısı** (singleton), JWT ile auth, otomatik reconnect.

- **Bağlanınca / reconnect olunca:** açık thread'e `join:thread` + catch-up fetch (bkz. §4).
- **Dinleyiciler:**
  - `message:new` → açık thread ise mesaj listesine ekle (id-dedupe) + önizlemeyi güncelle;
    değilse önizleme + okunmamış rozeti güncelle.
  - `notification:new` → rozet + toast.
  - `typing:started/stopped` → "yazıyor…" göstergesi.
  - `message:read` → çift tik.
- **Web:** `useMessagingSocket` hook'u; React Query cache'ine `setQueryData` ile ekleme +
  güvenlik için ilgili query invalidate. Açık sohbetteki cache sorunu böyle kökten biter.
- **Mobil:** aynı dinleyiciler Zustand `messagesStore`'a bağlanır (mevcut optimistic update
  korunur, id-dedupe eklenir).

### 4. Güvenilirlik — catch-up reconciliation

- Açık sohbette ve thread listesinde **son görülen mesaj id/zamanı** tutulur.
- Reconnect'te veya thread açılışında REST ile eksikler doldurulur. **Karar:** `getThreadMessages`
  endpoint'ine opsiyonel `since` (mesaj id veya createdAt) parametresi eklenir; yoksa son sayfa
  yeniden çekilir. `since` daha verimli olduğu için tercih edilir.
- Event kaçsa bile bir sonraki açılış/reconnect tutarlılığı geri getirir.

### 5. Hata yönetimi & uç durumlar

- Socket bağlanamazsa uygulama REST ile çalışmaya devam eder (graceful degradation) — anlıklık
  kaybolur, veri bozulmaz.
- Token süresi dolarsa reconnect'te yeni token ile auth.
- Çoklu sekme/cihaz: `user:{userId}` odası tüm soketlere yayar.
- `pending_approval` durumundaki mesajlar event yaymaz (yalnızca onaylanınca/`sent` olunca).

### 6. Test

- **Backend:** `sendMessage` → `RealtimeService.emitNewMessage` çağrılıyor mu (mock gateway);
  `notification.service` → `emitNotification`; `message:send` handler'ının kaldırıldığı.
- **Frontend:** gelen `message:new` event'inde açık sohbete eklendiği + id-dedupe; reconnect'te
  catch-up fetch tetiklendiği; socket yokken REST fallback.
- **E2E:** iki kullanıcı, biri mesaj atıyor → diğerinin açık sohbetinde anlık görünüyor
  (mevcut Playwright journey'lerine eklenir).

## Kapsam

- Web + mobil real-time + bildirim katmanı (in-app `notification:new` + mevcut push tetiklemesi).
- Özellikler: mesaj teslimi, okunmamış sayacı, typing göstergesi, okundu (çift tik).

## Kapsam dışı

- Push notification altyapısının kendisi (Expo/Twilio) — mevcut akış korunur, değiştirilmez.
- Order/product/offer/admin real-time event'leri — gateway'de var, bu spec'in konusu değil.
