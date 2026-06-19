# Real-Time Mesajlaşma & Bildirim Katmanı — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mevcut ama bağlanmamış WebSocket gateway'ini canlandırarak mesajların ve bildirimlerin web + mobilde anlık, tutarlı şekilde görünmesini sağlamak.

**Architecture:** Backend mesaj/bildirim DB'ye yazıldıktan sonra socket event'leri (`message:new`, `thread:updated`, `message:read`, `notification:new`) yayar. Web ve mobil tek kalıcı socket.io bağlantısıyla dinler, gelen event'leri id-dedupe ile state'e ekler. Bağlantı koptuğunda/thread açıldığında REST `since` parametresiyle eksikler doldurulur. Prensip: **socket haber verir, REST doğrular, DB tek gerçektir.**

**Tech Stack:** NestJS + socket.io (server, mevcut), socket.io-client (web + mobil, yeni), React Query (web), Zustand (mobil), Jest (api + mobil testleri), Playwright (web E2E).

## Global Constraints

- `pending_approval` / `rejected` durumundaki mesajlar event YAYMAZ; yalnızca `status === 'sent'` olanlar yayılır.
- Tüm mesaj eklemeleri mesaj `id`'sine göre dedupe edilir (mükerrer engellenir).
- Socket bağlanamazsa uygulama REST ile çalışmaya devam eder; veri bozulmaz (graceful degradation).
- Socket auth mevcut JWT ile: `io(url, { auth: { token } })`. Web token: `useAuthStore.getState().token` (localStorage `auth_token`). Mobil token: `useAuthStore.getState().token`.
- API base URL — web: `process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'` (socket için `/api` EKLENMEZ, kök URL kullanılır). Mobil: `apps/mobile/src/services/api.ts` içindeki çözümlenen URL'den `/api` çıkarılarak kök alınır.
- Event payload tipleri tek kaynak: `@tarodan/types` (`packages/types`). API, web, mobil aynı tipi import eder.
- Yeni socket event isimleri (sözleşme): `message:new`, `thread:updated`, `message:read`, `notification:new`, `typing:started`, `typing:stopped`. Client→server: `join:thread`, `leave:thread`, `typing:start`, `typing:stop` (mevcut, korunur).

---

## File Structure

**Backend (apps/api):**
- Create: `src/modules/websocket/realtime.service.ts` — gateway'i saran ince emitter.
- Modify: `src/modules/websocket/websocket.module.ts` — RealtimeService provide/export.
- Modify: `src/modules/websocket/websocket.gateway.ts` — `message:send` handler kaldırılır; `emitToThread`/`emitToUser` yardımcıları eklenir.
- Modify: `src/modules/messaging/messaging.module.ts` — WebSocketModule import.
- Modify: `src/modules/messaging/messaging.service.ts` — `sendMessage` ve `getThreadMessages` event yayar; `getThreadMessages` `since` destekler.
- Modify: `src/modules/messaging/dto/message-query.dto.ts` — `since?` alanı.
- Modify: `src/modules/notification/notification.module.ts` — WebSocketModule import.
- Modify: `src/modules/notification/notification.service.ts` — `saveInAppNotification` sonrası `notification:new` yayar.

**Shared types (packages/types):**
- Create: `src/websocket.ts` — event payload arayüzleri.
- Modify: `src/index.ts` — `export * from './websocket'`.

**Web (apps/web):**
- Create: `src/lib/socket.ts` — singleton socket.io-client.
- Create: `src/lib/messageMerge.ts` — saf dedupe/merge yardımcıları (test edilebilir).
- Create: `src/hooks/useMessagingSocket.ts` — bağlanma, join, dinleyiciler, catch-up.
- Modify: `src/app/messages/page.tsx` — hook entegrasyonu.
- Modify: `src/lib/api.ts` — `getMessages` `since` param geçişi (zaten params destekliyor, no-op).
- Modify: `package.json` — `socket.io-client`.
- Create: `e2e/realtime-messaging.spec.ts` — Playwright E2E.

**Mobile (apps/mobile):**
- Create: `src/services/socket.ts` — singleton socket.io-client.
- Modify: `src/stores/messagesStore.ts` — socket dinleyici entegrasyonu + dedupe + `applyIncomingMessage` action.
- Modify: `app/messages/[threadId].tsx` — join/leave thread.
- Modify: `app/_layout.tsx` (veya kök) — oturum açıkken socket bağla/kopar.
- Modify: `package.json` — `socket.io-client`.

---

## Task 1: Shared WebSocket event types

**Files:**
- Create: `packages/types/src/websocket.ts`
- Modify: `packages/types/src/index.ts:13` (mesaj exportundan sonra)

**Interfaces:**
- Produces: `MessageDtoLike`, `MessageNewEvent`, `ThreadUpdatedEvent`, `MessageReadEvent`, `NotificationNewEvent`, `TypingEvent`, `ServerToClientEvents`, `ClientToServerEvents`.

- [ ] **Step 1: Create the types file**

```typescript
// packages/types/src/websocket.ts

/** Backend MessageResponseDto ile aynı şekil (alt küme). */
export interface MessageDtoLike {
  id: string;
  threadId: string;
  senderId: string;
  senderName: string;
  receiverId: string;
  receiverName: string;
  content: string;
  status: string;
  readAt?: string | Date;
  createdAt: string | Date;
}

export interface MessageNewEvent {
  threadId: string;
  message: MessageDtoLike;
}

export interface ThreadUpdatedEvent {
  threadId: string;
  lastMessagePreview: string;
  lastMessageAt: string;
  unreadCount: number;
}

export interface MessageReadEvent {
  threadId: string;
  readerId: string;
  messageIds: string[];
}

export interface NotificationNewEvent {
  id: string;
  type: string;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  createdAt: string;
}

export interface TypingEvent {
  threadId: string;
  userId: string;
  displayName?: string;
}

export interface ServerToClientEvents {
  'message:new': (payload: MessageNewEvent) => void;
  'thread:updated': (payload: ThreadUpdatedEvent) => void;
  'message:read': (payload: MessageReadEvent) => void;
  'notification:new': (payload: NotificationNewEvent) => void;
  'typing:started': (payload: TypingEvent) => void;
  'typing:stopped': (payload: TypingEvent) => void;
  connected: (payload: { userId: string }) => void;
  error: (payload: { message: string }) => void;
}

export interface ClientToServerEvents {
  'join:thread': (data: { threadId: string }) => void;
  'leave:thread': (data: { threadId: string }) => void;
  'typing:start': (data: { threadId: string }) => void;
  'typing:stop': (data: { threadId: string }) => void;
}
```

- [ ] **Step 2: Export from index**

`packages/types/src/index.ts` içinde `export * from './message';` satırının hemen altına ekle:

```typescript
export * from './websocket';
```

- [ ] **Step 3: Build the package**

Run: `pnpm --filter @tarodan/types build`
Expected: `DTS ⚡️ Build success` ve hata yok.

- [ ] **Step 4: Commit**

```bash
git add packages/types/src/websocket.ts packages/types/src/index.ts
git commit -m "feat(types): real-time socket event payload tipleri"
```

---

## Task 2: Backend RealtimeService (gateway emitter wrapper)

**Files:**
- Create: `apps/api/src/modules/websocket/realtime.service.ts`
- Modify: `apps/api/src/modules/websocket/websocket.gateway.ts` (emit yardımcıları ekle, `message:send` kaldır)
- Modify: `apps/api/src/modules/websocket/websocket.module.ts`
- Test: `apps/api/src/modules/websocket/realtime.service.spec.ts`

**Interfaces:**
- Consumes: `TarodanWebSocketGateway.server` (socket.io `Server`).
- Produces:
  - `RealtimeService.emitNewMessage(threadId: string, receiverId: string, message: MessageDtoLike, threadUpdate: ThreadUpdatedEvent): void`
  - `RealtimeService.emitMessageRead(threadId: string, readerId: string, messageIds: string[]): void`
  - `RealtimeService.emitNotification(userId: string, n: NotificationNewEvent): void`
  - `TarodanWebSocketGateway.emitToThread(threadId: string, event: string, payload: unknown): void`
  - `TarodanWebSocketGateway.emitToUser(userId: string, event: string, payload: unknown): void`

- [ ] **Step 1: Add emit helpers to the gateway**

`websocket.gateway.ts` içinde `// ==================== UTILITY METHODS ====================` bloğundan ÖNCE şu iki metodu ekle:

```typescript
  // ==================== GENERIC EMITTERS ====================

  emitToThread(threadId: string, event: string, payload: unknown): void {
    this.server.to(`thread:${threadId}`).emit(event, payload);
  }

  emitToUser(userId: string, event: string, payload: unknown): void {
    this.server.to(`user:${userId}`).emit(event, payload);
  }
```

- [ ] **Step 2: Remove the DB-bypassing message:send handler**

`websocket.gateway.ts` satır 144-159 arasındaki `@SubscribeMessage('message:send') handleSendMessage(...) { ... }` bloğunu TAMAMEN sil. (Mesajlar artık yalnızca REST → DB → event yolundan geçer.) `join:thread`, `leave:thread`, `typing:start`, `typing:stop` handler'larına DOKUNMA.

- [ ] **Step 3: Write the failing test for RealtimeService**

```typescript
// apps/api/src/modules/websocket/realtime.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { RealtimeService } from './realtime.service';
import { TarodanWebSocketGateway } from './websocket.gateway';

describe('RealtimeService', () => {
  let service: RealtimeService;
  const gateway = {
    emitToThread: jest.fn(),
    emitToUser: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RealtimeService,
        { provide: TarodanWebSocketGateway, useValue: gateway },
      ],
    }).compile();
    service = module.get(RealtimeService);
  });

  it('emits message:new to thread and thread:updated to receiver', () => {
    const msg = { id: 'm1', threadId: 't1', senderId: 's1' } as any;
    const upd = { threadId: 't1', unreadCount: 2 } as any;
    service.emitNewMessage('t1', 'r1', msg, upd);
    expect(gateway.emitToThread).toHaveBeenCalledWith('t1', 'message:new', { threadId: 't1', message: msg });
    expect(gateway.emitToUser).toHaveBeenCalledWith('r1', 'thread:updated', upd);
  });

  it('emits message:read to thread', () => {
    service.emitMessageRead('t1', 'r1', ['m1', 'm2']);
    expect(gateway.emitToThread).toHaveBeenCalledWith('t1', 'message:read', {
      threadId: 't1', readerId: 'r1', messageIds: ['m1', 'm2'],
    });
  });

  it('emits notification:new to user', () => {
    const n = { id: 'n1', type: 'new_message' } as any;
    service.emitNotification('u1', n);
    expect(gateway.emitToUser).toHaveBeenCalledWith('u1', 'notification:new', n);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm --filter @tarodan/api test -- realtime.service`
Expected: FAIL — `Cannot find module './realtime.service'`.

- [ ] **Step 5: Implement RealtimeService**

```typescript
// apps/api/src/modules/websocket/realtime.service.ts
import { Injectable } from '@nestjs/common';
import type {
  MessageDtoLike,
  ThreadUpdatedEvent,
  NotificationNewEvent,
} from '@tarodan/types';
import { TarodanWebSocketGateway } from './websocket.gateway';

@Injectable()
export class RealtimeService {
  constructor(private readonly gateway: TarodanWebSocketGateway) {}

  emitNewMessage(
    threadId: string,
    receiverId: string,
    message: MessageDtoLike,
    threadUpdate: ThreadUpdatedEvent,
  ): void {
    this.gateway.emitToThread(threadId, 'message:new', { threadId, message });
    this.gateway.emitToUser(receiverId, 'thread:updated', threadUpdate);
  }

  emitMessageRead(threadId: string, readerId: string, messageIds: string[]): void {
    this.gateway.emitToThread(threadId, 'message:read', {
      threadId,
      readerId,
      messageIds,
    });
  }

  emitNotification(userId: string, n: NotificationNewEvent): void {
    this.gateway.emitToUser(userId, 'notification:new', n);
  }
}
```

- [ ] **Step 6: Register in WebSocketModule**

`websocket.module.ts` içinde import ekle ve providers/exports güncelle:

```typescript
import { RealtimeService } from './realtime.service';
// ...
  providers: [TarodanWebSocketGateway, RealtimeService],
  exports: [TarodanWebSocketGateway, RealtimeService],
```

- [ ] **Step 7: Run test to verify it passes**

Run: `pnpm --filter @tarodan/api test -- realtime.service`
Expected: PASS (3 tests).

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/websocket/
git commit -m "feat(api): RealtimeService emitter + gateway emit yardımcıları, message:send handler kaldırıldı"
```

---

## Task 3: Emit message:new + thread:updated from sendMessage

**Files:**
- Modify: `apps/api/src/modules/messaging/messaging.module.ts`
- Modify: `apps/api/src/modules/messaging/messaging.service.ts` (constructor + sendMessage)
- Test: `apps/api/src/modules/messaging/messaging-realtime.spec.ts`

**Interfaces:**
- Consumes: `RealtimeService.emitNewMessage(...)` (Task 2), `MessagingService.mapMessageToDto` (mevcut, satır 587), `MessagingService.getUnreadMessageCount(userId)` (mevcut, satır 353).
- Produces: yan etki — `sendMessage` başarılı `sent` mesajda event yayar.

- [ ] **Step 1: Import WebSocketModule into MessagingModule**

`messaging.module.ts`:

```typescript
import { WebSocketModule } from '../websocket/websocket.module';
// imports dizisine ekle (mevcut forwardRef(() => NotificationModule) yanına):
  imports: [PrismaModule, forwardRef(() => NotificationModule), StorageModule, WebSocketModule],
```

- [ ] **Step 2: Inject RealtimeService into MessagingService**

`messaging.service.ts` constructor'a ekle (mevcut `@Optional() storageService`'ten sonra):

```typescript
import { RealtimeService } from '../websocket/realtime.service';
// constructor parametresi:
    private readonly realtime: RealtimeService,
```

- [ ] **Step 3: Write the failing test**

```typescript
// apps/api/src/modules/messaging/messaging-realtime.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { MessagingService } from './messaging.service';
import { ContentFilterService } from './content-filter.service';
import { NotificationService } from '../notification/notification.service';
import { RealtimeService } from '../websocket/realtime.service';
import { StorageService } from '../storage/storage.service';
import { PrismaService } from '../../prisma';

describe('MessagingService realtime emit', () => {
  let service: MessagingService;
  const realtime = { emitNewMessage: jest.fn(), emitMessageRead: jest.fn() };

  const sentMessage = {
    id: 'm1', threadId: 't1', senderId: 's1', receiverId: 'r1',
    content: 'merhaba', status: 'sent', createdAt: new Date(),
    sender: { id: 's1', displayName: 'Ali' },
    receiver: { id: 'r1', displayName: 'Veli' },
  };
  const mockPrisma = {
    platformSetting: { findUnique: jest.fn().mockResolvedValue(null) },
    messageThread: {
      findUnique: jest.fn().mockResolvedValue({
        id: 't1', participant1Id: 's1', participant2Id: 'r1', messages: [],
      }),
      update: jest.fn().mockResolvedValue({}),
    },
    message: {
      create: jest.fn().mockResolvedValue(sentMessage),
      count: jest.fn().mockResolvedValue(3),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ContentFilterService, useValue: { moderateWithAI: jest.fn().mockResolvedValue({ isClean: true, requiresApproval: false, filteredContent: null, flaggedReason: null }) } },
        { provide: NotificationService, useValue: { createInAppNotification: jest.fn().mockResolvedValue(true) } },
        { provide: RealtimeService, useValue: realtime },
        { provide: StorageService, useValue: { getPublicAssetUrl: jest.fn() } },
      ],
    }).compile();
    service = module.get(MessagingService);
  });

  it('emits message:new with mapped DTO when status is sent', async () => {
    await service.sendMessage('t1', 's1', { content: 'merhaba' } as any);
    expect(realtime.emitNewMessage).toHaveBeenCalledTimes(1);
    const [threadId, receiverId, dto, update] = realtime.emitNewMessage.mock.calls[0];
    expect(threadId).toBe('t1');
    expect(receiverId).toBe('r1');
    expect(dto.id).toBe('m1');
    expect(update.unreadCount).toBe(3);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm --filter @tarodan/api test -- messaging-realtime`
Expected: FAIL — `emitNewMessage` çağrılmadı (0 kez).

- [ ] **Step 5: Emit in sendMessage**

`messaging.service.ts` `sendMessage` içinde, `createInAppNotification` çağrısını saran `if (status === MessageStatus.sent) { try { ... } }` bloğunun İÇİNE, notification çağrısından sonra ekle (return'den önce):

```typescript
        const unreadCount = await this.getUnreadMessageCount(receiverId);
        this.realtime.emitNewMessage(
          threadId,
          receiverId,
          this.mapMessageToDto(message),
          {
            threadId,
            lastMessagePreview: messagePreview,
            lastMessageAt: new Date().toISOString(),
            unreadCount,
          },
        );
```

(Aynı `try/catch` içinde olduğu için socket emit hatası mesaj gönderimini bozmaz.)

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @tarodan/api test -- messaging-realtime`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/messaging/messaging.module.ts apps/api/src/modules/messaging/messaging.service.ts apps/api/src/modules/messaging/messaging-realtime.spec.ts
git commit -m "feat(api): sendMessage message:new + thread:updated yayıyor"
```

---

## Task 4: Emit message:read + add `since` to getThreadMessages

**Files:**
- Modify: `apps/api/src/modules/messaging/dto/message-query.dto.ts`
- Modify: `apps/api/src/modules/messaging/messaging.service.ts` (getThreadMessages)
- Test: `apps/api/src/modules/messaging/messaging-read-since.spec.ts`

**Interfaces:**
- Consumes: `RealtimeService.emitMessageRead(...)` (Task 2).
- Produces: `getThreadMessages` artık `query.since` (ISO createdAt) destekler; okunan mesajlar için `message:read` yayar.

- [ ] **Step 1: Add `since` to MessageQueryDto**

`message-query.dto.ts` içinde `before?` alanından sonra ekle:

```typescript
  @IsOptional()
  @IsString()
  since?: string; // ISO createdAt — bu andan SONRAKİ mesajları getir (catch-up)
```

- [ ] **Step 2: Write the failing test**

```typescript
// apps/api/src/modules/messaging/messaging-read-since.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { MessagingService } from './messaging.service';
import { ContentFilterService } from './content-filter.service';
import { NotificationService } from '../notification/notification.service';
import { RealtimeService } from '../websocket/realtime.service';
import { StorageService } from '../storage/storage.service';
import { PrismaService } from '../../prisma';

describe('MessagingService getThreadMessages read+since', () => {
  let service: MessagingService;
  const realtime = { emitNewMessage: jest.fn(), emitMessageRead: jest.fn() };
  const mockPrisma = {
    messageThread: { findUnique: jest.fn().mockResolvedValue({ id: 't1', participant1Id: 'u1', participant2Id: 'u2' }) },
    message: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'm2', threadId: 't1', senderId: 'u2', receiverId: 'u1', content: 'hi', status: 'sent', createdAt: new Date(), readAt: null, sender: { id: 'u2', displayName: 'V' }, receiver: { id: 'u1', displayName: 'A' } },
      ]),
      count: jest.fn().mockResolvedValue(1),
      findMany2: undefined,
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ContentFilterService, useValue: {} },
        { provide: NotificationService, useValue: {} },
        { provide: RealtimeService, useValue: realtime },
        { provide: StorageService, useValue: {} },
      ],
    }).compile();
    service = module.get(MessagingService);
  });

  it('applies since filter to the message query', async () => {
    const since = '2026-06-19T00:00:00.000Z';
    await service.getThreadMessages('t1', 'u1', { page: 1, pageSize: 50, since } as any);
    const whereArg = mockPrisma.message.findMany.mock.calls[0][0].where;
    expect(whereArg.createdAt).toEqual({ gt: new Date(since) });
  });

  it('emits message:read for newly read message ids', async () => {
    await service.getThreadMessages('t1', 'u1', { page: 1, pageSize: 50 } as any);
    expect(realtime.emitMessageRead).toHaveBeenCalledWith('t1', 'u1', expect.arrayContaining(['m2']));
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @tarodan/api test -- messaging-read-since`
Expected: FAIL — `since` filtresi yok ve `emitMessageRead` çağrılmıyor.

- [ ] **Step 4: Implement since filter + read emit**

`messaging.service.ts` `getThreadMessages` içinde:

(a) `const { page = 1, pageSize = 50 } = query;` satırını şununla değiştir:
```typescript
    const { page = 1, pageSize = 50, since } = query;
```

(b) `const where: Prisma.MessageWhereInput = { threadId, status: {...} };` tanımının hemen ardından ekle:
```typescript
    if (since) {
      where.createdAt = { gt: new Date(since) };
    }
```

(c) "Mark messages as read" bloğunu (mevcut `updateMany`) şununla değiştir — okunan id'leri topla ve event yay:
```typescript
    const unread = await this.prisma.message.findMany({
      where: {
        threadId,
        receiverId: userId,
        readAt: null,
        status: { in: [MessageStatus.sent, MessageStatus.approved] },
      },
      select: { id: true },
    });
    if (unread.length > 0) {
      const ids = unread.map((m) => m.id);
      await this.prisma.message.updateMany({
        where: { id: { in: ids } },
        data: { readAt: new Date() },
      });
      this.realtime.emitMessageRead(threadId, userId, ids);
    }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @tarodan/api test -- messaging-read-since`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/messaging/
git commit -m "feat(api): getThreadMessages since param + message:read event"
```

---

## Task 5: Emit notification:new from createInAppNotification

**Files:**
- Modify: `apps/api/src/modules/notification/notification.module.ts`
- Modify: `apps/api/src/modules/notification/notification.service.ts` (constructor + saveInAppNotification)
- Test: `apps/api/src/modules/notification/notification-realtime.spec.ts`

**Interfaces:**
- Consumes: `RealtimeService.emitNotification(...)` (Task 2).
- Produces: in-app notification kaydı sonrası `notification:new` event'i.

- [ ] **Step 1: Import WebSocketModule into NotificationModule**

`notification.module.ts`:

```typescript
import { WebSocketModule } from '../websocket/websocket.module';
// imports dizisine ekle:
  imports: [PrismaModule, ConfigModule, StorageModule, WebSocketModule],
```

> Not: `MessagingModule` zaten `WebSocketModule`'ü ve `forwardRef(NotificationModule)`'ü import ediyor. WebSocketModule hiçbir feature modülünü import etmediği için döngü oluşmaz.

- [ ] **Step 2: Inject RealtimeService into NotificationService**

`notification.service.ts` constructor'a son parametre olarak ekle:

```typescript
import { RealtimeService } from '../websocket/realtime.service';
// constructor parametresi (storageService'ten sonra):
    private readonly realtime: RealtimeService,
```

- [ ] **Step 3: Write the failing test**

```typescript
// apps/api/src/modules/notification/notification-realtime.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotificationService } from './notification.service';
import { PrismaService } from '../../prisma';
import { SendGridProvider } from './providers/sendgrid.provider';
import { ExpoPushProvider } from './providers/expo-push.provider';
import { SmsProvider } from './providers/sms.provider';
import { SmtpProvider } from './providers/smtp.provider';
import { StorageService } from '../storage/storage.service';
import { RealtimeService } from '../websocket/realtime.service';
import { NotificationType } from './dto/notification.dto';

describe('NotificationService realtime emit', () => {
  let service: NotificationService;
  const realtime = { emitNotification: jest.fn() };
  const mockPrisma = {
    user: { findUnique: jest.fn().mockResolvedValue({ id: 'u1', email: 'a@b.c', displayName: 'A' }) },
    notificationLog: { create: jest.fn().mockResolvedValue({ id: 'log-1', createdAt: new Date() }), findFirst: jest.fn().mockResolvedValue(null) },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: SendGridProvider, useValue: { isConfigured: () => false } },
        { provide: ExpoPushProvider, useValue: { isConfigured: () => false } },
        { provide: SmsProvider, useValue: { isConfigured: () => false } },
        { provide: SmtpProvider, useValue: { isConfigured: () => false } },
        { provide: StorageService, useValue: { getPublicAssetUrl: jest.fn().mockReturnValue(null) } },
        { provide: RealtimeService, useValue: realtime },
      ],
    }).compile();
    service = module.get(NotificationService);
  });

  it('emits notification:new after saving an in-app notification', async () => {
    await service.createInAppNotification('u1', NotificationType.NEW_MESSAGE, { senderName: 'Ali', messagePreview: 'selam', threadId: 't1' });
    expect(realtime.emitNotification).toHaveBeenCalledTimes(1);
    const [userId, payload] = realtime.emitNotification.mock.calls[0];
    expect(userId).toBe('u1');
    expect(payload.type).toBe(NotificationType.NEW_MESSAGE);
    expect(payload.title).toBeTruthy();
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm --filter @tarodan/api test -- notification-realtime`
Expected: FAIL — `emitNotification` çağrılmadı.

- [ ] **Step 5: Emit after saveInAppNotification**

`notification.service.ts` `createInAppNotification` içinde, `const result = await this.saveInAppNotification(...)` satırından SONRA, `return result;`'tan ÖNCE ekle:

```typescript
    if (result) {
      try {
        this.realtime.emitNotification(userId, {
          id: '',
          type,
          title,
          message,
          data,
          createdAt: new Date().toISOString(),
        });
      } catch (e) {
        this.logger.warn(`[createInAppNotification] realtime emit failed: ${e}`);
      }
    }
```

> `id` boş bırakılıyor çünkü `saveInAppNotification` log id'sini döndürmüyor; client `notification:new`'i yalnızca rozet artırma + toast için kullanır, kalıcı liste REST `/notifications`'tan gelir.

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @tarodan/api test -- notification-realtime`
Expected: PASS.

- [ ] **Step 7: Full api typecheck + boot smoke**

Run: `pnpm --filter @tarodan/api build`
Expected: 0 TypeScript errors.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/notification/
git commit -m "feat(api): in-app bildirimlerde notification:new yayını"
```

---

## Task 6: Web socket client singleton + pure merge helpers

**Files:**
- Modify: `apps/web/package.json` (dependency)
- Create: `apps/web/src/lib/socket.ts`
- Create: `apps/web/src/lib/messageMerge.ts`
- Create: `apps/web/src/lib/messageMerge.test.ts` (saf fonksiyon testi)

**Interfaces:**
- Produces:
  - `getSocket(token: string): Socket` — singleton, yoksa oluşturur.
  - `disconnectSocket(): void`
  - `mergeMessages(existing: T[], incoming: T): T[]` — id-dedupe + createdAt sıralı ekleme (generic, `{ id: string; createdAt: string | Date }`).

- [ ] **Step 1: Add socket.io-client dependency**

Run: `pnpm --filter @tarodan/web add socket.io-client`
Expected: `socket.io-client` `apps/web/package.json` dependencies'e eklenir.

- [ ] **Step 2: Write failing test for mergeMessages**

> Web'de jest yok; bu saf fonksiyon için hızlı bir test koşucusu olarak `tsx` ile bir assert script'i kullanıyoruz (CI'da `node --test` uyumlu). Dosyayı `node --test` ile çalıştır.

```typescript
// apps/web/src/lib/messageMerge.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeMessages } from './messageMerge';

test('appends a new message in createdAt order', () => {
  const existing = [{ id: 'a', createdAt: '2026-06-19T10:00:00Z' }];
  const incoming = { id: 'b', createdAt: '2026-06-19T10:01:00Z' };
  const result = mergeMessages(existing, incoming);
  assert.deepEqual(result.map((m) => m.id), ['a', 'b']);
});

test('dedupes by id (no duplicate)', () => {
  const existing = [{ id: 'a', createdAt: '2026-06-19T10:00:00Z' }];
  const incoming = { id: 'a', createdAt: '2026-06-19T10:00:00Z' };
  const result = mergeMessages(existing, incoming);
  assert.equal(result.length, 1);
});

test('inserts out-of-order message at correct position', () => {
  const existing = [
    { id: 'a', createdAt: '2026-06-19T10:00:00Z' },
    { id: 'c', createdAt: '2026-06-19T10:02:00Z' },
  ];
  const incoming = { id: 'b', createdAt: '2026-06-19T10:01:00Z' };
  const result = mergeMessages(existing, incoming);
  assert.deepEqual(result.map((m) => m.id), ['a', 'b', 'c']);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/web && npx tsx --test src/lib/messageMerge.test.ts`
Expected: FAIL — `Cannot find module './messageMerge'`.

- [ ] **Step 4: Implement messageMerge**

```typescript
// apps/web/src/lib/messageMerge.ts
export interface HasIdAndTime {
  id: string;
  createdAt: string | Date;
}

const time = (v: string | Date): number => new Date(v).getTime();

export function mergeMessages<T extends HasIdAndTime>(existing: T[], incoming: T): T[] {
  if (existing.some((m) => m.id === incoming.id)) return existing;
  const next = [...existing, incoming];
  next.sort((a, b) => time(a.createdAt) - time(b.createdAt));
  return next;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/web && npx tsx --test src/lib/messageMerge.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Implement the socket singleton**

```typescript
// apps/web/src/lib/socket.ts
import { io, Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from '@tarodan/types';

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

function socketBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
}

export function getSocket(token: string): Socket<ServerToClientEvents, ClientToServerEvents> {
  if (socket && socket.connected) return socket;
  if (socket) {
    socket.auth = { token };
    socket.connect();
    return socket;
  }
  socket = io(socketBaseUrl(), {
    auth: { token },
    transports: ['websocket', 'polling'],
    autoConnect: true,
  });
  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
```

- [ ] **Step 7: Commit**

```bash
git add apps/web/package.json apps/web/src/lib/socket.ts apps/web/src/lib/messageMerge.ts apps/web/src/lib/messageMerge.test.ts ../../pnpm-lock.yaml
git commit -m "feat(web): socket.io-client singleton + saf mesaj-merge yardımcısı"
```

---

## Task 7: Web useMessagingSocket hook + messages page integration

**Files:**
- Create: `apps/web/src/hooks/useMessagingSocket.ts`
- Modify: `apps/web/src/app/messages/page.tsx`
- Test: `apps/web/e2e/realtime-messaging.spec.ts` (Playwright)

**Interfaces:**
- Consumes: `getSocket`/`disconnectSocket` (Task 6), `mergeMessages` (Task 6), `useAuthStore` (`.token`, `.user`), React Query `queryClient`, query keys `['messages', threadId]` ve `['message-threads']`.
- Produces: `useMessagingSocket({ activeThreadId }): { typingUserIds: string[] }`.

- [ ] **Step 1: Implement the hook**

```typescript
// apps/web/src/hooks/useMessagingSocket.ts
'use client';
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type {
  MessageNewEvent, ThreadUpdatedEvent, MessageReadEvent,
  NotificationNewEvent, TypingEvent,
} from '@tarodan/types';
import { useAuthStore } from '@/stores/authStore';
import { getSocket, disconnectSocket } from '@/lib/socket';
import { mergeMessages } from '@/lib/messageMerge';

export function useMessagingSocket({ activeThreadId }: { activeThreadId?: string | null }) {
  const queryClient = useQueryClient();
  const token = useAuthStore((s) => s.token);
  const currentUserId = useAuthStore((s) => s.user?.id);
  const [typingUserIds, setTypingUserIds] = useState<string[]>([]);
  const activeRef = useRef<string | null | undefined>(activeThreadId);
  activeRef.current = activeThreadId;

  // Connect + global listeners
  useEffect(() => {
    if (!token) return;
    const socket = getSocket(token);

    const onMessageNew = (payload: MessageNewEvent) => {
      // Açık sohbete ekle (id-dedupe)
      if (payload.threadId === activeRef.current) {
        queryClient.setQueryData<any[]>(['messages', payload.threadId], (old) =>
          mergeMessages(old ?? [], payload.message as any),
        );
      }
      // Önizleme listesini tazele
      queryClient.invalidateQueries({ queryKey: ['message-threads'] });
    };
    const onThreadUpdated = (_p: ThreadUpdatedEvent) => {
      queryClient.invalidateQueries({ queryKey: ['message-threads'] });
      queryClient.invalidateQueries({ queryKey: ['unread-count'] });
    };
    const onMessageRead = (p: MessageReadEvent) => {
      if (p.threadId === activeRef.current) {
        queryClient.invalidateQueries({ queryKey: ['messages', p.threadId] });
      }
    };
    const onNotification = (_n: NotificationNewEvent) => {
      queryClient.invalidateQueries({ queryKey: ['unread-count'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    };
    const onTypingStart = (t: TypingEvent) => {
      if (t.threadId === activeRef.current && t.userId !== currentUserId) {
        setTypingUserIds((ids) => (ids.includes(t.userId) ? ids : [...ids, t.userId]));
      }
    };
    const onTypingStop = (t: TypingEvent) => {
      setTypingUserIds((ids) => ids.filter((id) => id !== t.userId));
    };
    // Reconnect → catch-up: açık thread'in mesajlarını yeniden çek
    const onReconnect = () => {
      if (activeRef.current) {
        socket.emit('join:thread', { threadId: activeRef.current });
        queryClient.invalidateQueries({ queryKey: ['messages', activeRef.current] });
      }
      queryClient.invalidateQueries({ queryKey: ['message-threads'] });
    };

    socket.on('message:new', onMessageNew);
    socket.on('thread:updated', onThreadUpdated);
    socket.on('message:read', onMessageRead);
    socket.on('notification:new', onNotification);
    socket.on('typing:started', onTypingStart);
    socket.on('typing:stopped', onTypingStop);
    socket.io.on('reconnect', onReconnect);

    return () => {
      socket.off('message:new', onMessageNew);
      socket.off('thread:updated', onThreadUpdated);
      socket.off('message:read', onMessageRead);
      socket.off('notification:new', onNotification);
      socket.off('typing:started', onTypingStart);
      socket.off('typing:stopped', onTypingStop);
      socket.io.off('reconnect', onReconnect);
    };
  }, [token, currentUserId, queryClient]);

  // Join/leave active thread room
  useEffect(() => {
    if (!token || !activeThreadId) return;
    const socket = getSocket(token);
    socket.emit('join:thread', { threadId: activeThreadId });
    setTypingUserIds([]);
    return () => {
      socket.emit('leave:thread', { threadId: activeThreadId });
    };
  }, [token, activeThreadId]);

  // Disconnect on logout
  useEffect(() => {
    if (!token) disconnectSocket();
  }, [token]);

  return { typingUserIds };
}
```

- [ ] **Step 2: Wire the hook into the messages page**

`apps/web/src/app/messages/page.tsx` içinde, importlara ekle:

```typescript
import { useMessagingSocket } from '@/hooks/useMessagingSocket';
```

`messagesQuery` tanımının hemen ardından ekle (component gövdesinde):

```typescript
  const { typingUserIds } = useMessagingSocket({ activeThreadId: selectedThread?.id });
```

`selectedThread?.id` değişiminde `message-threads`'i invalidate eden mevcut `useEffect` (satır ~224) artık socket tarafından kapsanıyor; DOKUNMA (zararsız ama bırak). "yazıyor…" göstergesini sohbet başlığının altına eklemek istersen `typingUserIds.length > 0` koşuluyla render et (mevcut UI metnini takip et).

- [ ] **Step 3: Write Playwright E2E test**

```typescript
// apps/web/e2e/realtime-messaging.spec.ts
import { test, expect } from '@playwright/test';

// İki kullanıcı: ahmet@demo.com ve mehmet@demo.com (Demo123!). Aralarında thread olmalı.
test('alıcının açık sohbetinde gelen mesaj anlık görünür', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();

  // login helper'ı mevcut e2e pattern'ine göre uyarlanır (storageState veya UI login)
  await loginAs(pageA, 'ahmet@demo.com', 'Demo123!');
  await loginAs(pageB, 'mehmet@demo.com', 'Demo123!');

  await pageA.goto('/messages');
  await pageB.goto('/messages');

  // İki taraf da aynı thread'i açar
  await pageA.getByRole('listitem').first().click();
  await pageB.getByRole('listitem').first().click();

  const unique = `e2e-${Date.now()}`;
  await pageA.getByPlaceholder(/mesaj/i).fill(unique);
  await pageA.getByRole('button', { name: /gönder/i }).click();

  // B'nin AÇIK sohbetinde mesaj REST refetch olmadan görünmeli
  await expect(pageB.getByText(unique)).toBeVisible({ timeout: 5000 });
});

async function loginAs(page: any, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel(/e-?posta|email/i).fill(email);
  await page.getByLabel(/şifre|password/i).fill(password);
  await page.getByRole('button', { name: /giriş/i }).click();
  await page.waitForURL(/\/(|messages|profile)/);
}
```

- [ ] **Step 4: Run the E2E test (API + web dev ayakta olmalı)**

Run: `cd apps/web && npx playwright test e2e/realtime-messaging.spec.ts`
Expected: PASS — B'nin açık sohbetinde `e2e-...` mesajı 5sn içinde görünür.

> Test seçici metinleri (placeholder/buton adları) mevcut UI'a göre ufak ayar gerektirebilir; ilk koşuda gerçek metinlerle hizala. Beklenen DAVRANIŞ değişmez: gelen mesaj açık sohbette anlık belirir.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/hooks/useMessagingSocket.ts apps/web/src/app/messages/page.tsx apps/web/e2e/realtime-messaging.spec.ts
git commit -m "feat(web): mesajlar sayfası real-time socket entegrasyonu + catch-up"
```

---

## Task 8: Mobile socket client singleton

**Files:**
- Modify: `apps/mobile/package.json` (dependency)
- Create: `apps/mobile/src/services/socket.ts`
- Test: `apps/mobile/src/services/__tests__/socket.test.ts`

**Interfaces:**
- Consumes: API base URL çözümü (`apps/mobile/src/services/api.ts`), `useAuthStore.getState().token`.
- Produces:
  - `connectSocket(token: string): Socket`
  - `getSocket(): Socket | null`
  - `disconnectSocket(): void`
  - `socketRootUrl(): string` (test edilebilir saf yardımcı — `/api` ekini kaldırır).

- [ ] **Step 1: Add socket.io-client dependency**

Run: `pnpm --filter @tarodan/mobile add socket.io-client`
Expected: `socket.io-client` `apps/mobile/package.json`'a eklenir.

- [ ] **Step 2: Write failing test for socketRootUrl**

```typescript
// apps/mobile/src/services/__tests__/socket.test.ts
import { socketRootUrl } from '../socket';

describe('socketRootUrl', () => {
  it('strips trailing /api from the API base', () => {
    expect(socketRootUrl('http://192.168.1.5:3001/api')).toBe('http://192.168.1.5:3001');
  });
  it('leaves a root url unchanged', () => {
    expect(socketRootUrl('http://localhost:3001')).toBe('http://localhost:3001');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @tarodan/mobile test -- socket.test`
Expected: FAIL — `Cannot find module '../socket'`.

- [ ] **Step 4: Implement the socket service**

```typescript
// apps/mobile/src/services/socket.ts
import { io, Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from '@tarodan/types';
import { getApiBaseUrl } from './api';

export function socketRootUrl(apiUrl: string): string {
  return apiUrl.replace(/\/api\/?$/, '');
}

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

export function connectSocket(token: string): Socket<ServerToClientEvents, ClientToServerEvents> {
  if (socket) {
    socket.auth = { token };
    if (!socket.connected) socket.connect();
    return socket;
  }
  socket = io(socketRootUrl(getApiBaseUrl()), {
    auth: { token },
    transports: ['websocket'],
    autoConnect: true,
  });
  return socket;
}

export function getSocket() {
  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
```

> `getApiBaseUrl` yoksa: `apps/mobile/src/services/api.ts` içindeki URL çözümleyiciyi `export function getApiBaseUrl()` olarak dışa aç (mevcut `getApiUrl` fonksiyonunu export et veya saran bir export ekle). Bu küçük değişikliği bu adımda yap.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @tarodan/mobile test -- socket.test`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/package.json apps/mobile/src/services/socket.ts apps/mobile/src/services/api.ts apps/mobile/src/services/__tests__/socket.test.ts ../../pnpm-lock.yaml
git commit -m "feat(mobile): socket.io-client servisi + socketRootUrl yardımcısı"
```

---

## Task 9: Mobile store integration + thread screen join/leave

**Files:**
- Modify: `apps/mobile/src/stores/messagesStore.ts` (`applyIncomingMessage` action + dedupe)
- Modify: `apps/mobile/app/messages/[threadId].tsx` (join/leave)
- Modify: `apps/mobile/app/_layout.tsx` (oturum açıkken connect/disconnect + global dinleyiciler)
- Test: `apps/mobile/src/stores/__tests__/applyIncomingMessage.test.ts`

**Interfaces:**
- Consumes: `connectSocket`/`disconnectSocket`/`getSocket` (Task 8), `useMessagesStore`, `useAuthStore`.
- Produces: `useMessagesStore.getState().applyIncomingMessage(threadId: string, message: MessageDtoLike): void` — açık thread ise `messages`'a id-dedupe ile ekler; her durumda ilgili thread'in `lastMessage`'ını günceller.

- [ ] **Step 1: Write failing test for applyIncomingMessage**

```typescript
// apps/mobile/src/stores/__tests__/applyIncomingMessage.test.ts
import { useMessagesStore } from '../messagesStore';

describe('applyIncomingMessage', () => {
  beforeEach(() => {
    useMessagesStore.setState({
      currentThreadId: 't1',
      messages: [{ id: 'm1', threadId: 't1', createdAt: '2026-06-19T10:00:00Z' } as any],
      threads: [],
    });
  });

  it('appends a new message for the open thread with dedupe', () => {
    const store = useMessagesStore.getState();
    store.applyIncomingMessage('t1', { id: 'm2', threadId: 't1', createdAt: '2026-06-19T10:01:00Z' } as any);
    expect(useMessagesStore.getState().messages.map((m: any) => m.id)).toEqual(['m1', 'm2']);
    // dedupe
    store.applyIncomingMessage('t1', { id: 'm2', threadId: 't1', createdAt: '2026-06-19T10:01:00Z' } as any);
    expect(useMessagesStore.getState().messages.length).toBe(2);
  });

  it('does NOT append to messages when thread is not open', () => {
    const store = useMessagesStore.getState();
    store.applyIncomingMessage('OTHER', { id: 'x', threadId: 'OTHER', createdAt: '2026-06-19T10:05:00Z' } as any);
    expect(useMessagesStore.getState().messages.map((m: any) => m.id)).toEqual(['m1']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tarodan/mobile test -- applyIncomingMessage`
Expected: FAIL — `applyIncomingMessage is not a function`.

- [ ] **Step 3: Add applyIncomingMessage to the store**

`messagesStore.ts` içinde interface'e ekle (`markAsRead` yanına):

```typescript
  applyIncomingMessage: (threadId: string, message: any) => void;
```

Store gövdesine ekle (mevcut bir action'ın yanına):

```typescript
  applyIncomingMessage: (threadId, message) => {
    const state = get();
    // Açık thread ise mesaj listesine id-dedupe ile ekle, createdAt'e göre sırala
    if (state.currentThreadId === threadId) {
      const exists = state.messages.some((m: any) => m.id === message.id);
      if (!exists) {
        const next = [...state.messages, message].sort(
          (a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );
        set({ messages: next });
      }
    }
    // Önizleme: ilgili thread'in lastMessage'ını güncelle
    set({
      threads: get().threads.map((t: any) =>
        t.id === threadId ? { ...t, lastMessage: message, lastMessageAt: message.createdAt } : t,
      ),
    });
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @tarodan/mobile test -- applyIncomingMessage`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire global socket listeners at app root**

`apps/mobile/app/_layout.tsx` içine (oturum durumunu okuyan bölüme) bir effect ekle:

```typescript
import { useEffect } from 'react';
import { connectSocket, disconnectSocket } from '../src/services/socket';
import { useAuthStore } from '../src/stores/authStore';
import { useMessagesStore } from '../src/stores/messagesStore';

// RootLayout component gövdesinde:
  const token = useAuthStore((s) => s.token);
  useEffect(() => {
    if (!token) { disconnectSocket(); return; }
    const socket = connectSocket(token);
    const onMessageNew = (p: { threadId: string; message: any }) =>
      useMessagesStore.getState().applyIncomingMessage(p.threadId, p.message);
    const onThreadUpdated = () => useMessagesStore.getState().fetchUnreadCount();
    const onReconnect = () => {
      const tid = useMessagesStore.getState().currentThreadId;
      if (tid) {
        socket.emit('join:thread', { threadId: tid });
        useMessagesStore.getState().fetchMessages(tid);
      }
      useMessagesStore.getState().fetchThreads();
    };
    socket.on('message:new', onMessageNew);
    socket.on('thread:updated', onThreadUpdated);
    socket.io.on('reconnect', onReconnect);
    return () => {
      socket.off('message:new', onMessageNew);
      socket.off('thread:updated', onThreadUpdated);
      socket.io.off('reconnect', onReconnect);
    };
  }, [token]);
```

> `fetchUnreadCount` mevcut (store satır 160). `currentThreadId` mevcut store state.

- [ ] **Step 6: Join/leave thread room on the thread screen**

`apps/mobile/app/messages/[threadId].tsx` içindeki mevcut `useFocusEffect` bloğuna join/leave ekle:

```typescript
import { getSocket } from '../../src/services/socket';

useFocusEffect(
  useCallback(() => {
    if (threadId) {
      fetchThread(threadId);
      fetchMessages(threadId);
      markAsRead(threadId);
      getSocket()?.emit('join:thread', { threadId });
    }
    return () => {
      if (threadId) getSocket()?.emit('leave:thread', { threadId });
    };
  }, [threadId])
);
```

- [ ] **Step 7: Typecheck mobile**

Run: `pnpm --filter @tarodan/mobile exec tsc --noEmit`
Expected: 0 hata (yeni dosyalarla ilgili).

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/src/stores/messagesStore.ts apps/mobile/app/messages/[threadId].tsx apps/mobile/app/_layout.tsx apps/mobile/src/stores/__tests__/applyIncomingMessage.test.ts
git commit -m "feat(mobile): real-time mesaj alımı (applyIncomingMessage) + thread join/leave"
```

---

## Task 10: End-to-end manual verification + cleanup

**Files:** (yalnızca doğrulama; kod değişikliği yoksa commit yok)

- [ ] **Step 1: Boot the full stack**

Run: `pnpm dev` (kökten). API'nin temiz başladığını ([memory: api-107] tablolar mevcut olmalı), `WebSocket Gateway initialized` logunu gör.

- [ ] **Step 2: İki tarayıcı senaryosu (web)**

İki ayrı tarayıcı profilinde `ahmet@demo.com` ve `mehmet@demo.com` ile giriş yap, aynı thread'i AÇ. Birinden mesaj at → diğerinin AÇIK sohbetinde anında görünmeli (sayfa yenilemeden). Bu, raporlanan bug'ın doğrudan testidir.

Expected: Mesaj hem sol önizlemede hem açık sohbette anlık görünür; çift tik okununca güncellenir.

- [ ] **Step 3: Reconnect/catch-up testi**

B kullanıcısının sohbeti açıkken API'yi 5sn durdurup yeniden başlat (veya ağ kes-aç). A bu sırada mesaj atar. B tekrar bağlanınca kaçan mesaj catch-up ile görünmeli.

Expected: Hiç mesaj kaybı yok.

- [ ] **Step 4: Mobil duman testi**

Mobil uygulamada giriş yap, bir thread aç, web'den o kullanıcıya mesaj at → mobilde açık sohbette anlık görünmeli. Bildirim rozeti artmalı.

- [ ] **Step 5: Full test suite**

Run: `pnpm --filter @tarodan/api test && pnpm --filter @tarodan/mobile test`
Expected: Yeni spec'ler dahil tümü PASS.

---

## Notlar

- `message:send` socket handler'ı kaldırıldı; hiçbir client onu çağırmıyordu, kırılma yok.
- Push notification altyapısı (Expo/Twilio) DEĞİŞMEDİ; yalnızca in-app `notification:new` eklendi.
- Order/product/offer real-time event'leri kapsam dışı; gateway'deki ilgili metodlara dokunulmadı.
