/**
 * 18 — Mesajlaşma & Bildirim (MSG) — Test Konsolu senaryoları.
 *
 * Bu dosya 01-auth.e2e-spec.ts FAN-OUT ŞABLONUNU birebir izler. Her test
 * `scenario('<ID>', fn)` ile manifest'e bağlanır (izlenebilirlik + başlık/pri
 * otomatik). beforeEach truncateAll()+seedBaseline() (+ ctx.paytr/ctx.surat reset).
 *
 * GERÇEK KODA GÖRE DENETLENDİ (adversarial statik doğrulama):
 *   - Mesaj uçları: POST /api/messages/threads (@Post default 201),
 *     GET threads, GET threads/:id, GET threads/:id/messages, POST threads/:id/messages,
 *     GET unread-count, GET daily-limit. Admin: GET admin/pending, POST admin/:id/moderate,
 *     GET admin/filters, POST admin/filters/test. Tüm :id ParseUUIDPipe → geçersiz UUID = 400.
 *     Admin uçları @AdminRoute + AdminJwtAuthGuard + RolesGuard; filters yalnız admin/super_admin.
 *   - CreateThreadDto: recipientId/participantId birbirinin ValidateIf koşulu; ikisi de
 *     yoksa @IsUUID her ikisinde tetiklenir → 400. message @MaxLength(1000) DTO seviyesinde.
 *   - SendMessageDto: content @MinLength(1) @MaxLength(1000). >1000 DTO'da 400; servis
 *     max_message_length platform ayarı ile 1000 altına çekilebilir (200-1000 arası → servis 400).
 *   - getThreadMessages yalnız {sent,approved} döndürür + alıcının okunmamışlarını readAt=now yapar.
 *     getUnreadMessageCount: receiverId=me, readAt=null, status∈{sent,approved}.
 *   - İçerik filtresi: profanity (orospu/göt vb.) hardcoded regex → DETERMİNİSTİK pending_approval
 *     (AI kapalı: .env.test AI_MODERATION_ENABLED yok → moderateText null). Telefon/sosyal medya
 *     filtreleri DB'den (content_filters) yüklenir; seedBaseline seed ETMEZ → test içinde satır
 *     ekleyip ContentFilterService.loadFilters() ile belleğe yükleriz.
 *   - moderateMessage: pending değilse 400 "Bu mesaj onay beklemiyordu"; yoksa 404 "Mesaj bulunamadı".
 *   - Bildirim uçları: POST /api/notifications/push-token (@HttpCode 200), GET /api/notifications,
 *     GET unread-count, PATCH :id/read (@HttpCode 200), POST mark-all-read (@HttpCode 200).
 *     NotificationLog: channel='in_app', status∈{sent,read}. unread = status='sent'.
 *     registerPushToken try/catch → geçersiz Expo token {success:false}; upsert @@unique([userId,token]).
 *   - Admin broadcast/schedule: AdminController POST /api/admin/notifications/send (@HttpCode 200),
 *     /schedule (default 201), DELETE /scheduled/:id (@HttpCode 200). Boş hedef → 400
 *     "Hedef kullanıcı bulunamadı". Geçmiş tarih → 400 "Zamanlama tarihi gelecekte olmalıdır".
 *     admin_broadcast ALWAYS_SEND (tercihten muaf). Roller: super_admin/admin/moderator.
 *   - Tercih ayarı: PATCH/GET /api/users/me/settings (kısmi merge, @IsBoolean).
 *     shouldDeliver(): messageAlerts=false → NEW_MESSAGE in_app+push atlanır; orderUpdates=false →
 *     order* atlanır; pushNotifications=false → yalnız push atlanır (in_app kalır).
 *   - Bildirim tetikleyicileri (senkron, in-request): sendMessage → createInAppNotification(NEW_MESSAGE);
 *     shipping.updateTracking → notifyOrderShipped(ORDER_SHIPPED). Bunlar NotificationLog'a
 *     senkron yazar → DB assertion güvenli.
 *   - Kullanıcı engelleme: POST /api/users/:id/block (default 201) — user.service BELLEK-İÇİ Map;
 *     "Kendinizi engelleyemezsiniz"/"zaten engellenmiş"/"{name} engellendi". Engelleme mesajlaşmayı
 *     durdurmaz (createThread/sendMessage block kontrolü yok) — dokümante risk.
 *
 * SKIP GEREKÇELERİ (gerçekten API'den assert EDİLEMEYEN):
 *   - WS senaryoları (MSG-044..052, 106): paylaşılan test app app.listen() çağırmaz + socket.io-client
 *     paketi yok → WS handshake/oda/typing/multi-device gözlemlenemez.
 *   - Saf-UI / i18n-parite / XSS-render (MSG-035, 041, 078, 094, 095, 096, 097, 100, 101, 107):
 *     backend'den assert edilecek davranış yok; ilgili backend davranışı aktif senaryolarla kaplı.
 *   - MSG-055: engellemenin API restart'ta kaybı — paylaşılan app restart edilemez.
 *   - MSG-065/066/067/075/076/081: OFFER_RECEIVED (create) / REFUND / stockout / order-created e-postası
 *     BullMQ event kuyruğu (emailQueue/pushQueue) üzerinden asenkron işlenir; test worker'ı
 *     deterministik koşmaz → NotificationLog senkron doğrulanamaz. (Kanal-gating mantığı MSG-079/080
 *     ve MSG-064 ile fiilen kaplı.)
 *   - MSG-034 AKTİF: AI test'te kapalı (moderateText null döner, throw etmez) → temiz mesaj
 *     status=sent kalır, 500 atmaz. API'den doğrudan gözlemlenebilir.
 */
import * as request from "supertest";
import { MessageStatus } from "@prisma/client";
import { createE2ETestApp, E2ETestApp } from "../../test-utils/create-app";
import {
  truncateAll,
  getPrisma,
  seedBaseline,
  disconnectPrisma,
} from "../../test-utils/db";
import {
  createUser,
  createAdminUser,
  authHeader,
  CreatedTestUser,
} from "../../factories/user.factory";
import { createProduct } from "../../factories/product.factory";
import { createAddress } from "../../factories/address.factory";
import { buyAndPay } from "../../factories/flows";
import { scenario } from "../../test-utils/scenario";
import { ContentFilterService } from "../../../src/modules/messaging/content-filter.service";

describe("18 — Mesajlaşma & Bildirim (MSG)", () => {
  let ctx: E2ETestApp;
  let baseline: { categoryId: string; brandId: string; manufacturerId: string };
  const server = () => ctx.app.getHttpServer();

  beforeAll(async () => {
    ctx = await createE2ETestApp();
  });

  afterAll(async () => {
    await ctx.close();
    await disconnectPrisma();
  });

  beforeEach(async () => {
    await truncateAll();
    baseline = await seedBaseline();
    ctx.paytr.reset();
    ctx.surat.reset();
  });

  // ──────────────────────────── ortak yardımcılar ────────────────────────────

  const NIL_UUID = "00000000-0000-4000-8000-000000000000";
  const OTHER_UUID = "a0000000-0000-4000-8000-000000000000";

  const createThread = (
    initiator: CreatedTestUser,
    body: Record<string, unknown>,
  ) =>
    request(server())
      .post("/api/messages/threads")
      .set(authHeader(initiator))
      .send(body);

  const sendMessage = (
    sender: CreatedTestUser,
    threadId: string,
    content: string,
  ) =>
    request(server())
      .post(`/api/messages/threads/${threadId}/messages`)
      .set(authHeader(sender))
      .send({ content });

  const getMessages = (reader: CreatedTestUser, threadId: string, qs = "") =>
    request(server())
      .get(`/api/messages/threads/${threadId}/messages${qs}`)
      .set(authHeader(reader));

  /** deniz + ahmet üret ve aralarında (mesajlı) bir thread aç. */
  async function twoUsersWithThread(opts: { message?: string } = {}): Promise<{
    deniz: CreatedTestUser;
    ahmet: CreatedTestUser;
    threadId: string;
  }> {
    const deniz = await createUser(ctx.module, { displayName: "Deniz" });
    const ahmet = await createUser(ctx.module, { displayName: "Ahmet" });
    const res = await createThread(deniz, {
      recipientId: ahmet.id,
      ...(opts.message !== undefined ? { message: opts.message } : {}),
    }).expect(201);
    return { deniz, ahmet, threadId: res.body.id };
  }

  /** Bir content_filter satırı ekle ve ContentFilterService'e (bellek) yükle. */
  async function installFilter(rule: {
    filterType: string;
    name: string;
    pattern: string;
    replacement?: string;
    requiresApproval: boolean;
    priority?: number;
  }): Promise<void> {
    const prisma = getPrisma();
    await prisma.contentFilter.create({
      data: {
        filterType: rule.filterType,
        name: rule.name,
        pattern: rule.pattern,
        replacement: rule.replacement ?? "[gizlendi]",
        requiresApproval: rule.requiresApproval,
        priority: rule.priority ?? 100,
        isActive: true,
      },
    });
    await ctx.module.get(ContentFilterService).loadFilters();
  }

  /** Filtreleri bellekte temizle (DB truncate yeterli değil; servis cache'i taşınır). */
  async function clearFilters(): Promise<void> {
    await ctx.module.get(ContentFilterService).loadFilters();
  }

  // ════════════════════════════════════════════════════════════════════════
  // POST /api/messages/threads — thread oluşturma
  // ════════════════════════════════════════════════════════════════════════
  describe("POST /api/messages/threads", () => {
    scenario("MSG-001", async () => {
      const deniz = await createUser(ctx.module, { displayName: "Deniz" });
      const ahmet = await createUser(ctx.module, { displayName: "Ahmet" });

      const res = await createThread(deniz, {
        recipientId: ahmet.id,
        message: "Merhaba, ürününüzle ilgileniyorum",
      }).expect(201);

      expect(res.body.id).toBeTruthy();
      // participant1Id/participant2Id küçükten büyüğe sıralı.
      const [p1, p2] = [deniz.id, ahmet.id].sort();
      expect(res.body.participant1Id).toBe(p1);
      expect(res.body.participant2Id).toBe(p2);
      // Gönderen kendi mesajı için okunmamış sayısı 0.
      expect(res.body.unreadCount).toBe(0);
      expect(res.body.lastMessage?.content).toBe(
        "Merhaba, ürününüzle ilgileniyorum",
      );

      // Adım 3: GET threads/:id aynı thread'i 200 döner.
      const detail = await request(server())
        .get(`/api/messages/threads/${res.body.id}`)
        .set(authHeader(deniz))
        .expect(200);
      expect(detail.body.id).toBe(res.body.id);
    });

    scenario("MSG-002", async () => {
      // participantId alias'ı recipientId olarak çözülür.
      const deniz = await createUser(ctx.module);
      const ahmet = await createUser(ctx.module);
      const res = await createThread(deniz, {
        participantId: ahmet.id,
        message: "Selam",
      }).expect(201);
      expect(res.body.id).toBeTruthy();
      const [p1, p2] = [deniz.id, ahmet.id].sort();
      expect(res.body.participant1Id).toBe(p1);
      expect(res.body.participant2Id).toBe(p2);
    });

    scenario("MSG-003", async () => {
      // Aynı kişi+ürün → idempotent: tek thread satırı.
      const deniz = await createUser(ctx.module);
      const ahmet = await createUser(ctx.module);
      const product = await createProduct({
        sellerId: ahmet.id,
        categoryId: baseline.categoryId,
      });

      const first = await createThread(deniz, {
        recipientId: ahmet.id,
        productId: product.id,
        message: "İlk",
      }).expect(201);

      const second = await createThread(deniz, {
        recipientId: ahmet.id,
        productId: product.id,
        message: "İkinci",
      }).expect(201);
      expect(second.body.id).toBe(first.body.id);

      // Ters yön: ahmet → deniz, aynı ürün → yine aynı thread.
      const reverse = await createThread(ahmet, {
        recipientId: deniz.id,
        productId: product.id,
        message: "Ters",
      }).expect(201);
      expect(reverse.body.id).toBe(first.body.id);

      const prisma = getPrisma();
      const count = await prisma.messageThread.count({
        where: { productId: product.id },
      });
      expect(count).toBe(1);
    });

    scenario("MSG-004", async () => {
      // productId'siz ve productId'li thread'ler ayrıdır.
      const deniz = await createUser(ctx.module);
      const ahmet = await createUser(ctx.module);
      const product = await createProduct({
        sellerId: ahmet.id,
        categoryId: baseline.categoryId,
      });

      const noProduct = await createThread(deniz, {
        recipientId: ahmet.id,
      }).expect(201);
      const withProduct = await createThread(deniz, {
        recipientId: ahmet.id,
        productId: product.id,
      }).expect(201);

      expect(withProduct.body.id).not.toBe(noProduct.body.id);
      const prisma = getPrisma();
      const total = await prisma.messageThread.count({
        where: {
          OR: [{ participant1Id: deniz.id }, { participant2Id: deniz.id }],
        },
      });
      expect(total).toBe(2);
    });

    scenario("MSG-005", async () => {
      const deniz = await createUser(ctx.module);
      const res = await createThread(deniz, { recipientId: deniz.id }).expect(
        400,
      );
      expect(JSON.stringify(res.body)).toContain(
        "Kendinize mesaj gönderemezsiniz",
      );
    });

    scenario("MSG-006", async () => {
      const deniz = await createUser(ctx.module);
      const res = await createThread(deniz, { recipientId: NIL_UUID }).expect(
        404,
      );
      expect(JSON.stringify(res.body)).toContain("Alıcı kullanıcı bulunamadı");
    });

    scenario("MSG-007", async () => {
      const deniz = await createUser(ctx.module);
      const res = await createThread(deniz, {
        recipientId: "not-a-uuid",
      }).expect(400);
      expect(JSON.stringify(res.body)).toContain(
        "Geçerli bir kullanıcı ID giriniz",
      );
    });

    scenario("MSG-008", async () => {
      // recipientId ve participantId ikisi de yok → DTO ValidateIf her ikisini de zorunlu kılar.
      const deniz = await createUser(ctx.module);
      await createThread(deniz, { message: "merhaba" }).expect(400);
    });

    scenario("MSG-009", async () => {
      const deniz = await createUser(ctx.module);
      const ahmet = await createUser(ctx.module);
      const res = await createThread(deniz, {
        recipientId: ahmet.id,
        productId: NIL_UUID,
      }).expect(404);
      expect(JSON.stringify(res.body)).toContain("Ürün bulunamadı");
    });

    scenario("MSG-010", async () => {
      // Mesajsız thread → 201, lastMessage undefined, hiç mesaj yazılmaz.
      const deniz = await createUser(ctx.module);
      const ahmet = await createUser(ctx.module);
      const res = await createThread(deniz, { recipientId: ahmet.id }).expect(
        201,
      );
      expect(res.body.lastMessage).toBeUndefined();

      const prisma = getPrisma();
      const msgCount = await prisma.message.count({
        where: { threadId: res.body.id },
      });
      expect(msgCount).toBe(0);
      // Bildirim tetiklenmez.
      const notifCount = await prisma.notificationLog.count({
        where: { userId: ahmet.id, type: "new_message" },
      });
      expect(notifCount).toBe(0);
    });

    scenario("MSG-099", async () => {
      // Eşzamanlı thread oluşturma (aynı recipient+product) → tek thread satırı.
      const deniz = await createUser(ctx.module);
      const ahmet = await createUser(ctx.module);
      const product = await createProduct({
        sellerId: ahmet.id,
        categoryId: baseline.categoryId,
      });

      const results = await Promise.allSettled([
        createThread(deniz, {
          recipientId: ahmet.id,
          productId: product.id,
          message: "a",
        }),
        createThread(deniz, {
          recipientId: ahmet.id,
          productId: product.id,
          message: "b",
        }),
      ]);
      // En az biri başarılı olmalı; çift thread OLUŞMAMALI (@@unique).
      const ok = results.filter(
        (r) => r.status === "fulfilled" && (r.value as any).status === 201,
      );
      expect(ok.length).toBeGreaterThanOrEqual(1);

      const prisma = getPrisma();
      const count = await prisma.messageThread.count({
        where: { productId: product.id },
      });
      expect(count).toBe(1);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // POST /api/messages/threads/:id/messages — mesaj gönderme
  // ════════════════════════════════════════════════════════════════════════
  describe("POST /api/messages/threads/:id/messages", () => {
    scenario("MSG-011", async () => {
      const { deniz, ahmet, threadId } = await twoUsersWithThread();
      const res = await sendMessage(
        deniz,
        threadId,
        "Fiyatta indirim olur mu?",
      ).expect(201);
      expect(res.body.status).toBe("sent");
      expect(res.body.content).toBe("Fiyatta indirim olur mu?");
      expect(res.body.senderId).toBe(deniz.id);
      expect(res.body.receiverId).toBe(ahmet.id);

      const prisma = getPrisma();
      // Thread lastMessageAt güncellendi (mesaj var).
      const msg = await prisma.message.findFirst({
        where: { threadId, content: "Fiyatta indirim olur mu?" },
      });
      expect(msg).not.toBeNull();
      // ahmet'e NEW_MESSAGE in-app bildirim (senkron createInAppNotification).
      const notif = await prisma.notificationLog.findFirst({
        where: { userId: ahmet.id, type: "new_message", channel: "in_app" },
      });
      expect(notif).not.toBeNull();
    });

    scenario("MSG-012", async () => {
      const { deniz, threadId } = await twoUsersWithThread();
      const res = await sendMessage(deniz, threadId, "a".repeat(1000)).expect(
        201,
      );
      expect(res.body.status).toBe("sent");
    });

    scenario("MSG-013", async () => {
      const { deniz, threadId } = await twoUsersWithThread();
      // 1001 karakter → DTO @MaxLength(1000) devreye girer → 400.
      await sendMessage(deniz, threadId, "a".repeat(1001)).expect(400);
    });

    scenario("MSG-014", async () => {
      const { deniz, threadId } = await twoUsersWithThread();
      await sendMessage(deniz, threadId, "").expect(400);
    });

    scenario("MSG-015", async () => {
      const { deniz, threadId } = await twoUsersWithThread();
      await request(server())
        .post(`/api/messages/threads/${threadId}/messages`)
        .set(authHeader(deniz))
        .send({})
        .expect(400);
    });

    scenario("MSG-016", async () => {
      // Platform ayarı max_message_length=200 → 201-1000 arası servis katmanında reddedilir.
      const prisma = getPrisma();
      await prisma.platformSetting.create({
        data: {
          settingKey: "max_message_length",
          settingValue: "200",
          settingType: "number",
        },
      });
      const { deniz, threadId } = await twoUsersWithThread();
      const res = await sendMessage(deniz, threadId, "a".repeat(201)).expect(
        400,
      );
      expect(JSON.stringify(res.body)).toContain(
        "Mesaj uzunluğu maksimum 200 karakter olabilir",
      );
      // 200 karakter hâlâ geçer.
      await sendMessage(deniz, threadId, "a".repeat(200)).expect(201);
    });

    scenario("MSG-017", async () => {
      const deniz = await createUser(ctx.module);
      const res = await request(server())
        .post(`/api/messages/threads/${OTHER_UUID}/messages`)
        .set(authHeader(deniz))
        .send({ content: "x" })
        .expect(404);
      expect(JSON.stringify(res.body)).toContain("Mesaj konusu bulunamadı");
    });

    scenario("MSG-018", async () => {
      const deniz = await createUser(ctx.module);
      await request(server())
        .post("/api/messages/threads/abc/messages")
        .set(authHeader(deniz))
        .send({ content: "x" })
        .expect(400);
    });

    scenario("MSG-027", async () => {
      // Katılımcı olmayan mesaj gönderemez → 403.
      const { threadId } = await twoUsersWithThread();
      const kaan = await createUser(ctx.module);
      const res = await sendMessage(kaan, threadId, "araya girdim");
      expect([401, 403, 404]).toContain(res.status);
    });

    scenario("MSG-098", async () => {
      // Eşzamanlı çift mesaj → iki ayrı satır.
      const { deniz, threadId } = await twoUsersWithThread();
      await Promise.all([
        sendMessage(deniz, threadId, "aynı içerik").expect(201),
        sendMessage(deniz, threadId, "aynı içerik").expect(201),
      ]);
      const prisma = getPrisma();
      const count = await prisma.message.count({
        where: { threadId, content: "aynı içerik" },
      });
      expect(count).toBe(2);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // GET messages / unread-count / okundu işaretleme
  // ════════════════════════════════════════════════════════════════════════
  describe("GET messages & unread-count", () => {
    scenario("MSG-019", async () => {
      // deniz mesaj listesini açınca kendi alıcı olduğu mesajlar okundu olur.
      const { deniz, ahmet, threadId } = await twoUsersWithThread();
      await sendMessage(ahmet, threadId, "birinci").expect(201);
      await sendMessage(ahmet, threadId, "ikinci").expect(201);

      await getMessages(deniz, threadId).expect(200);

      const prisma = getPrisma();
      const stillUnread = await prisma.message.count({
        where: { threadId, receiverId: deniz.id, readAt: null },
      });
      expect(stillUnread).toBe(0);
    });

    scenario("MSG-020", async () => {
      // Okunmamış sayısı tüm thread'ler üzerinden toplanır.
      const deniz = await createUser(ctx.module);
      const ahmet = await createUser(ctx.module);
      const t = await createThread(ahmet, {
        recipientId: deniz.id,
        message: "m1",
      }).expect(201);
      // ahmet deniz'e 5 mesaj atar → deniz için 5 okunmamış.
      for (let i = 0; i < 4; i++) {
        await sendMessage(ahmet, t.body.id, `m${i + 2}`).expect(201);
      }
      const res = await request(server())
        .get("/api/messages/unread-count")
        .set(authHeader(deniz))
        .expect(200);
      expect(res.body.count).toBe(5);
    });

    scenario("MSG-021", async () => {
      // deniz'in KENDİ gönderdiği mesaj kendi okunmamış sayısını artırmaz.
      const { deniz, threadId } = await twoUsersWithThread();
      await sendMessage(deniz, threadId, "benim mesajım").expect(201);
      const res = await request(server())
        .get("/api/messages/unread-count")
        .set(authHeader(deniz))
        .expect(200);
      expect(res.body.count).toBe(0);
    });

    scenario("MSG-022", async () => {
      // pending_approval/rejected mesajlar okunmamış sayısına dahil edilmez.
      const { deniz, ahmet, threadId } = await twoUsersWithThread();
      const prisma = getPrisma();
      // ahmet→deniz: biri sent, biri pending, biri rejected.
      await prisma.message.createMany({
        data: [
          {
            threadId,
            senderId: ahmet.id,
            receiverId: deniz.id,
            content: "temiz",
            status: MessageStatus.sent,
          },
          {
            threadId,
            senderId: ahmet.id,
            receiverId: deniz.id,
            content: "bekleyen",
            status: MessageStatus.pending_approval,
          },
          {
            threadId,
            senderId: ahmet.id,
            receiverId: deniz.id,
            content: "red",
            status: MessageStatus.rejected,
          },
        ],
      });
      const res = await request(server())
        .get("/api/messages/unread-count")
        .set(authHeader(deniz))
        .expect(200);
      // Yalnız sent/approved sayılır → 1.
      expect(res.body.count).toBe(1);
    });

    scenario("MSG-023", async () => {
      // ?since=... → yalnız createdAt>since mesajlar döner.
      const { deniz, ahmet, threadId } = await twoUsersWithThread();
      const prisma = getPrisma();
      const old = new Date("2026-06-01T00:00:00.000Z");
      await prisma.message.create({
        data: {
          threadId,
          senderId: ahmet.id,
          receiverId: deniz.id,
          content: "eski",
          status: MessageStatus.sent,
          createdAt: old,
        },
      });
      await sendMessage(ahmet, threadId, "yeni").expect(201);

      const res = await getMessages(
        deniz,
        threadId,
        "?since=2026-06-29T00:00:00.000Z",
      ).expect(200);
      const contents = res.body.messages.map((m: any) => m.content);
      expect(contents).toContain("yeni");
      expect(contents).not.toContain("eski");
    });

    scenario("MSG-024", async () => {
      // Sayfalama üst sınırı: mesajlar pageSize>100 ve thread pageSize>50 → 400.
      const { deniz, threadId } = await twoUsersWithThread();
      await getMessages(deniz, threadId, "?pageSize=101").expect(400);
      await request(server())
        .get("/api/messages/threads?pageSize=51")
        .set(authHeader(deniz))
        .expect(400);
    });

    scenario("MSG-102", async () => {
      // Thread listesi 2. sayfa: 25 thread, pageSize=20 → 2. sayfada 5 kayıt.
      const deniz = await createUser(ctx.module);
      for (let i = 0; i < 25; i++) {
        const other = await createUser(ctx.module);
        await createThread(deniz, {
          recipientId: other.id,
          message: `t${i}`,
        }).expect(201);
      }
      const res = await request(server())
        .get("/api/messages/threads?page=2&pageSize=20")
        .set(authHeader(deniz))
        .expect(200);
      expect(res.body.total).toBe(25);
      expect(res.body.threads.length).toBe(5);
    });

    scenario("MSG-100", async () => {
      // Boş durum: hiç thread/bildirim yokken API boş liste döner (hata değil).
      const deniz = await createUser(ctx.module);
      const threads = await request(server())
        .get("/api/messages/threads")
        .set(authHeader(deniz))
        .expect(200);
      expect(threads.body.threads).toEqual([]);
      expect(threads.body.total).toBe(0);

      const notifs = await request(server())
        .get("/api/notifications")
        .set(authHeader(deniz))
        .expect(200);
      expect(notifs.body.notifications).toEqual([]);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // Yetki (Authz) — 401/403/IDOR
  // ════════════════════════════════════════════════════════════════════════
  describe("Yetki (Authz)", () => {
    scenario("MSG-025", async () => {
      await request(server()).get("/api/messages/threads").expect(401);
      await request(server())
        .post("/api/messages/threads")
        .send({ recipientId: NIL_UUID })
        .expect(401);
      await request(server()).get("/api/messages/unread-count").expect(401);
    });

    scenario("MSG-026", async () => {
      const { threadId } = await twoUsersWithThread({ message: "gizli" });
      const kaan = await createUser(ctx.module);
      const detail = await request(server())
        .get(`/api/messages/threads/${threadId}`)
        .set(authHeader(kaan));
      expect([403, 404]).toContain(detail.status);
      const msgs = await getMessages(kaan, threadId);
      expect([403, 404]).toContain(msgs.status);
    });

    scenario("MSG-103", async () => {
      // Thread mesaj enümerasyonu (IDOR): katılımcı olmayan mesaj içeriği alamaz.
      const { threadId } = await twoUsersWithThread({
        message: "çok gizli içerik",
      });
      const kaan = await createUser(ctx.module);
      const res = await getMessages(kaan, threadId);
      expect([403, 404]).toContain(res.status);
      expect(JSON.stringify(res.body)).not.toContain("çok gizli içerik");
    });

    scenario("MSG-028", async () => {
      // Normal kullanıcı admin moderasyon uçlarına erişemez.
      const user = await createUser(ctx.module);
      const pending = await request(server())
        .get("/api/messages/admin/pending")
        .set(authHeader(user));
      expect([401, 403]).toContain(pending.status);

      const moderate = await request(server())
        .post(`/api/messages/admin/${NIL_UUID}/moderate`)
        .set(authHeader(user))
        .send({ action: "approve" });
      expect([401, 403]).toContain(moderate.status);
    });

    scenario("MSG-029", async () => {
      // Moderator pending görebilir ama filters'a erişemez.
      const moderator = await createAdminUser(ctx.module, {
        role: "moderator" as any,
      });
      await request(server())
        .get("/api/messages/admin/pending")
        .set(authHeader(moderator))
        .expect(200);
      await request(server())
        .get("/api/messages/admin/filters")
        .set(authHeader(moderator))
        .expect(403);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // İçerik filtresi & moderasyon
  // ════════════════════════════════════════════════════════════════════════
  describe("İçerik filtresi & moderasyon", () => {
    scenario("MSG-030", async () => {
      await clearFilters();
      const { deniz, threadId } = await twoUsersWithThread();
      const res = await sendMessage(
        deniz,
        threadId,
        "Merhaba, teşekkürler",
      ).expect(201);
      expect(res.body.status).toBe("sent");
    });

    scenario("MSG-034", async () => {
      // AI moderasyon test ortamında kapalı (AI_MODERATION_ENABLED=false → moderateText
      // null döner, ASLA throw etmez). Temiz mesaj bu durumda regex sonucuyla (isClean)
      // status=sent kalır; istek 500 atmaz → API'den gözlemlenebilir davranış.
      await clearFilters();
      const { deniz, threadId } = await twoUsersWithThread();
      const res = await sendMessage(
        deniz,
        threadId,
        "Ürün elimde, ne zaman gönderelim?",
      ).expect(201);
      expect(res.body.status).toBe("sent");
      expect(res.body.flaggedReason).toBeUndefined();
    });

    scenario("MSG-031", async () => {
      // Telefon filtresi requiresApproval=false → sent ama filteredContent maskeler.
      await installFilter({
        filterType: "phone",
        name: "Türk Telefon Numarası",
        pattern: "(\\+90|0)?\\s*5\\d{2}\\s*\\d{3}\\s*\\d{2}\\s*\\d{2}",
        replacement: "[numara gizlendi]",
        requiresApproval: false,
      });
      try {
        const { deniz, ahmet, threadId } = await twoUsersWithThread();
        const res = await sendMessage(
          deniz,
          threadId,
          "Beni 0532 123 45 67 numaradan ara",
        ).expect(201);
        expect(res.body.status).toBe("sent");
        expect(res.body.flaggedReason).toBeTruthy();
        // filteredContent gösterilir → numara ham hâliyle karşı tarafa gitmez.
        const msgs = await getMessages(ahmet, threadId).expect(200);
        const body = JSON.stringify(msgs.body);
        expect(body).not.toContain("0532 123 45 67");
      } finally {
        await clearFilters();
      }
    });

    scenario("MSG-032", async () => {
      // Küfür (deterministik hardcoded liste) → pending_approval.
      await clearFilters();
      const { deniz, threadId } = await twoUsersWithThread();
      const res = await sendMessage(
        deniz,
        threadId,
        "seni orospu çocuğu",
      ).expect(201);
      expect(res.body.status).toBe("pending_approval");
      expect(res.body.flaggedReason).toBe("Uygunsuz dil (küfür)");
      // Placeholder gösterilir, ham içerik değil.
      expect(res.body.content).toBe("[Onay bekliyor]");
    });

    scenario("MSG-033", async () => {
      // Tam-kelime sınırı: "götür" temiz, tek başına yasak kök bayraklanır.
      await clearFilters();
      const { deniz, threadId } = await twoUsersWithThread();
      const clean = await sendMessage(
        deniz,
        threadId,
        "Ürünü kargoya götür lütfen",
      ).expect(201);
      expect(clean.body.status).toBe("sent");
      const flagged = await sendMessage(deniz, threadId, "göt").expect(201);
      expect(flagged.body.status).toBe("pending_approval");
    });

    scenario("MSG-036", async () => {
      // Onaya düşen mesaj onaylanır → alıcıya görünür olur.
      await clearFilters();
      const { deniz, ahmet, threadId } = await twoUsersWithThread();
      const sent = await sendMessage(deniz, threadId, "lan orospu").expect(201);
      expect(sent.body.status).toBe("pending_approval");

      const admin = await createAdminUser(ctx.module, { role: "admin" as any });
      // Admin pending listesinde ham içerik (originalContent) görünür.
      const pending = await request(server())
        .get("/api/messages/admin/pending")
        .set(authHeader(admin))
        .expect(200);
      const row = pending.body.messages.find((m: any) => m.id === sent.body.id);
      expect(row).toBeTruthy();
      expect(row.originalContent).toBe("lan orospu");

      const mod = await request(server())
        .post(`/api/messages/admin/${sent.body.id}/moderate`)
        .set(authHeader(admin))
        .send({ action: "approve" })
        .expect(201);
      expect(mod.body.status).toBe("approved");

      const prisma = getPrisma();
      const dbMsg = await prisma.message.findUnique({
        where: { id: sent.body.id },
      });
      expect(dbMsg?.reviewedById).toBe(admin.id);
      expect(dbMsg?.reviewedAt).not.toBeNull();

      // Alıcı artık mesajı listede görür (approved).
      const msgs = await getMessages(ahmet, threadId).expect(200);
      const found = msgs.body.messages.find((m: any) => m.id === sent.body.id);
      expect(found).toBeTruthy();
    });

    scenario("MSG-037", async () => {
      // Reddedilen mesaj → alıcı listesinde görünmez; tek-mesaj map "[Mesaj reddedildi]".
      await clearFilters();
      const { deniz, ahmet, threadId } = await twoUsersWithThread();
      const sent = await sendMessage(deniz, threadId, "lan orospu").expect(201);

      const admin = await createAdminUser(ctx.module, { role: "admin" as any });
      const mod = await request(server())
        .post(`/api/messages/admin/${sent.body.id}/moderate`)
        .set(authHeader(admin))
        .send({ action: "reject" })
        .expect(201);
      expect(mod.body.status).toBe("rejected");
      expect(mod.body.content).toBe("[Mesaj reddedildi]");

      const msgs = await getMessages(ahmet, threadId).expect(200);
      const found = msgs.body.messages.find((m: any) => m.id === sent.body.id);
      expect(found).toBeUndefined();
    });

    scenario("MSG-038", async () => {
      // Zaten kararlaşmış mesajı tekrar moderasyon → 400.
      await clearFilters();
      const { deniz, threadId } = await twoUsersWithThread();
      const sent = await sendMessage(deniz, threadId, "lan orospu").expect(201);
      const admin = await createAdminUser(ctx.module, { role: "admin" as any });
      await request(server())
        .post(`/api/messages/admin/${sent.body.id}/moderate`)
        .set(authHeader(admin))
        .send({ action: "reject" })
        .expect(201);
      const again = await request(server())
        .post(`/api/messages/admin/${sent.body.id}/moderate`)
        .set(authHeader(admin))
        .send({ action: "reject" })
        .expect(400);
      expect(JSON.stringify(again.body)).toContain(
        "Bu mesaj onay beklemiyordu",
      );
    });

    scenario("MSG-039", async () => {
      const admin = await createAdminUser(ctx.module, { role: "admin" as any });
      const res = await request(server())
        .post(`/api/messages/admin/${NIL_UUID}/moderate`)
        .set(authHeader(admin))
        .send({ action: "approve" })
        .expect(404);
      expect(JSON.stringify(res.body)).toContain("Mesaj bulunamadı");
    });

    scenario("MSG-040", async () => {
      // Admin filtre listeleme & pattern testi.
      await installFilter({
        filterType: "phone",
        name: "Test Numara Filtresi",
        pattern: "\\d{11}",
        requiresApproval: false,
      });
      try {
        const admin = await createAdminUser(ctx.module, {
          role: "admin" as any,
        });
        const list = await request(server())
          .get("/api/messages/admin/filters")
          .set(authHeader(admin))
          .expect(200);
        expect(Array.isArray(list.body)).toBe(true);
        expect(
          list.body.some((f: any) => f.name === "Test Numara Filtresi"),
        ).toBe(true);

        const test = await request(server())
          .post("/api/messages/admin/filters/test")
          .set(authHeader(admin))
          .send({ pattern: "\\d{11}", testContent: "05321234567" })
          .expect(201);
        expect(test.body.matches).toBe(true);

        // Geçersiz regex → testPattern false (throw yok).
        const bad = await request(server())
          .post("/api/messages/admin/filters/test")
          .set(authHeader(admin))
          .send({ pattern: "([", testContent: "x" })
          .expect(201);
        expect(bad.body.matches).toBe(false);
      } finally {
        await clearFilters();
      }
    });

    scenario("MSG-104", async () => {
      // pending mesaj içeriği karşı tarafa sızmaz (liste yalnız sent/approved).
      await clearFilters();
      const { deniz, ahmet, threadId } = await twoUsersWithThread();
      const sent = await sendMessage(
        deniz,
        threadId,
        "lan orospu gizli-ifsa",
      ).expect(201);
      expect(sent.body.status).toBe("pending_approval");
      const msgs = await getMessages(ahmet, threadId).expect(200);
      expect(JSON.stringify(msgs.body)).not.toContain("gizli-ifsa");
    });

    scenario("MSG-105", async () => {
      // İletişim bilgisi maskeleme: boşluklu numara / sosyal medya kalıbı tetiklenir.
      await installFilter({
        filterType: "phone",
        name: "Gizli Numara",
        pattern: "\\d\\s+\\d\\s+\\d\\s+\\d\\s+\\d\\s+\\d\\s+\\d",
        replacement: "[gizli]",
        requiresApproval: true,
      });
      try {
        const { deniz, threadId } = await twoUsersWithThread();
        const res = await sendMessage(
          deniz,
          threadId,
          "0 5 3 2 1 2 3 4 5 6 7",
        ).expect(201);
        // Kalıp eşleşti → onaya düşer veya maskelenir; her hâlükârda temiz 'sent' DEĞİL
        // veya flaggedReason dolu.
        expect(
          res.body.status === "pending_approval" || !!res.body.flaggedReason,
        ).toBe(true);
      } finally {
        await clearFilters();
      }
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // Günlük limit
  // ════════════════════════════════════════════════════════════════════════
  describe("Günlük limit", () => {
    scenario("MSG-042", async () => {
      const { deniz, threadId } = await twoUsersWithThread();
      const before = await request(server())
        .get("/api/messages/daily-limit")
        .set(authHeader(deniz))
        .expect(200);
      expect(before.body).toEqual({ remaining: 50, limit: 50 });

      await sendMessage(deniz, threadId, "bir mesaj").expect(201);
      const after = await request(server())
        .get("/api/messages/daily-limit")
        .set(authHeader(deniz))
        .expect(200);
      expect(after.body.remaining).toBe(49);
    });

    scenario("MSG-043", async () => {
      // Günlük limit GÖNDERİMDE uygulanmıyor (dokümante tutarsızlık): remaining=0 olsa da 201.
      const prisma = getPrisma();
      await prisma.platformSetting.create({
        data: {
          settingKey: "daily_message_limit",
          settingValue: "1",
          settingType: "number",
        },
      });
      const { deniz, threadId } = await twoUsersWithThread();
      await sendMessage(deniz, threadId, "ilk").expect(201);

      const limit = await request(server())
        .get("/api/messages/daily-limit")
        .set(authHeader(deniz))
        .expect(200);
      expect(limit.body.remaining).toBe(0);

      // Limit dolu raporlanmasına rağmen mesaj gönderilir (enforce edilmiyor).
      await sendMessage(deniz, threadId, "ikinci").expect(201);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // Bildirimler — /api/notifications
  // ════════════════════════════════════════════════════════════════════════
  describe("Bildirimler (/api/notifications)", () => {
    async function seedNotif(
      userId: string,
      opts: { read?: boolean; type?: string; data?: any } = {},
    ) {
      return getPrisma().notificationLog.create({
        data: {
          userId,
          channel: "in_app",
          type: opts.type ?? "system_announcement",
          title: "Başlık",
          body: "Gövde",
          status: opts.read ? "read" : "sent",
          data: opts.data ?? undefined,
          sentAt: new Date(),
        },
      });
    }

    scenario("MSG-056", async () => {
      const deniz = await createUser(ctx.module);
      const ceren = await createUser(ctx.module);
      await seedNotif(deniz.id);
      await seedNotif(deniz.id);
      await seedNotif(ceren.id);

      const res = await request(server())
        .get("/api/notifications")
        .set(authHeader(deniz))
        .expect(200);
      expect(res.body.notifications.length).toBe(2);
      // ceren'in bildirimi görünmez.
      const owners = res.body.notifications.map((n: any) => n.id);
      expect(owners.length).toBe(2);
      // Alan yapısı.
      const n = res.body.notifications[0];
      expect(n).toHaveProperty("id");
      expect(n).toHaveProperty("type");
      expect(n).toHaveProperty("title");
      expect(n).toHaveProperty("isRead");
    });

    scenario("MSG-057", async () => {
      const deniz = await createUser(ctx.module);
      await seedNotif(deniz.id);
      await seedNotif(deniz.id);
      await seedNotif(deniz.id, { read: true });
      const res = await request(server())
        .get("/api/notifications/unread-count")
        .set(authHeader(deniz))
        .expect(200);
      expect(res.body.count).toBe(2);
    });

    scenario("MSG-058", async () => {
      const deniz = await createUser(ctx.module);
      const notif = await seedNotif(deniz.id);
      const res = await request(server())
        .patch(`/api/notifications/${notif.id}/read`)
        .set(authHeader(deniz))
        .expect(200);
      expect(res.body.success).toBe(true);

      const prisma = getPrisma();
      const refreshed = await prisma.notificationLog.findUnique({
        where: { id: notif.id },
      });
      expect(refreshed?.status).toBe("read");
    });

    scenario("MSG-059", async () => {
      // IDOR: deniz, ceren'in bildirimini okundu işaretleyemez (where userId filtresi).
      const deniz = await createUser(ctx.module);
      const ceren = await createUser(ctx.module);
      const cerenNotif = await seedNotif(ceren.id);

      await request(server())
        .patch(`/api/notifications/${cerenNotif.id}/read`)
        .set(authHeader(deniz))
        .expect(200); // sessiz no-op

      const prisma = getPrisma();
      const refreshed = await prisma.notificationLog.findUnique({
        where: { id: cerenNotif.id },
      });
      expect(refreshed?.status).toBe("sent"); // değişmedi
    });

    scenario("MSG-060", async () => {
      const deniz = await createUser(ctx.module);
      await seedNotif(deniz.id);
      await seedNotif(deniz.id);
      await request(server())
        .post("/api/notifications/mark-all-read")
        .set(authHeader(deniz))
        .expect(200);
      const cnt = await request(server())
        .get("/api/notifications/unread-count")
        .set(authHeader(deniz))
        .expect(200);
      expect(cnt.body.count).toBe(0);
    });

    scenario("MSG-061", async () => {
      // NEW_MESSAGE collapse: aynı thread'e 3 mesaj → deniz'de TEK bildirim, başlık "(3)".
      const deniz = await createUser(ctx.module, { displayName: "Deniz" });
      const ahmet = await createUser(ctx.module, { displayName: "Ahmet" });
      const t = await createThread(ahmet, {
        recipientId: deniz.id,
        message: "m1",
      }).expect(201);
      await sendMessage(ahmet, t.body.id, "m2").expect(201);
      await sendMessage(ahmet, t.body.id, "m3").expect(201);

      const res = await request(server())
        .get("/api/notifications")
        .set(authHeader(deniz))
        .expect(200);
      const newMsgNotifs = res.body.notifications.filter(
        (n: any) => n.type === "new_message",
      );
      expect(newMsgNotifs.length).toBe(1);
      expect(newMsgNotifs[0].title).toContain("(3)");
      expect(newMsgNotifs[0].data?.messageCount).toBe(3);
    });

    scenario("MSG-062", async () => {
      // Link/ikon interpolasyonu — NEW_MESSAGE şablonu ile doğrula.
      const deniz = await createUser(ctx.module, { displayName: "Deniz" });
      const ahmet = await createUser(ctx.module, { displayName: "Ahmet" });
      const t = await createThread(ahmet, {
        recipientId: deniz.id,
        message: "selam",
      }).expect(201);

      const res = await request(server())
        .get("/api/notifications")
        .set(authHeader(deniz))
        .expect(200);
      const n = res.body.notifications.find(
        (x: any) => x.type === "new_message",
      );
      expect(n).toBeTruthy();
      expect(n.icon).toBe("💬");
      expect(n.link).toBe(`/messages?thread=${t.body.id}`);
    });

    scenario("MSG-063", async () => {
      // Yeni (sent) mesaj → alıcıya NEW_MESSAGE in-app (senkron NotificationLog).
      const { deniz, ahmet, threadId } = await twoUsersWithThread();
      await sendMessage(
        deniz,
        threadId,
        "Merhaba bu bir test mesajıdır",
      ).expect(201);
      const prisma = getPrisma();
      const notif = await prisma.notificationLog.findFirst({
        where: { userId: ahmet.id, type: "new_message", channel: "in_app" },
      });
      expect(notif).not.toBeNull();
      // messagePreview şablona interpolе edilir.
      expect(notif?.body).toContain("Merhaba");
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // Push token
  // ════════════════════════════════════════════════════════════════════════
  describe("Push token (/api/notifications/push-token)", () => {
    const registerToken = (
      user: CreatedTestUser,
      body: Record<string, unknown>,
    ) =>
      request(server())
        .post("/api/notifications/push-token")
        .set(authHeader(user))
        .send(body);

    scenario("MSG-068", async () => {
      const deniz = await createUser(ctx.module);
      const res = await registerToken(deniz, {
        token: "ExponentPushToken[abc123]",
        platform: "ios",
        deviceId: "dev-1",
      }).expect(200);
      expect(res.body.success).toBe(true);

      const prisma = getPrisma();
      const row = await prisma.pushToken.findFirst({
        where: { userId: deniz.id },
      });
      expect(row).not.toBeNull();
      expect(row?.platform).toBe("ios");
      expect(row?.isActive).toBe(true);
    });

    scenario("MSG-069", async () => {
      // Geçersiz Expo formatı → HTTP 200 ama gövde success:false; DB'ye yazılmaz.
      const deniz = await createUser(ctx.module);
      const res = await registerToken(deniz, {
        token: "random-token",
        platform: "ios",
      }).expect(200);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain("Invalid Expo push token format");

      const prisma = getPrisma();
      const count = await prisma.pushToken.count({
        where: { userId: deniz.id },
      });
      expect(count).toBe(0);
    });

    scenario("MSG-070", async () => {
      // token eksik → validasyon 4xx.
      const deniz = await createUser(ctx.module);
      const res = await registerToken(deniz, {});
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    scenario("MSG-071", async () => {
      // Aynı (userId, token) tekrar → upsert, tek satır kalır (platform güncellenir).
      const deniz = await createUser(ctx.module);
      const token = "ExponentPushToken[dedup-1]";
      await registerToken(deniz, { token, platform: "ios" }).expect(200);
      await registerToken(deniz, { token, platform: "android" }).expect(200);

      const prisma = getPrisma();
      const rows = await prisma.pushToken.findMany({
        where: { userId: deniz.id, token },
      });
      expect(rows.length).toBe(1);
      expect(rows[0].platform).toBe("android");
      expect(rows[0].isActive).toBe(true);
    });

    scenario("MSG-072", async () => {
      // revoke=true → token isActive=false.
      const deniz = await createUser(ctx.module);
      const token = "ExponentPushToken[revoke-1]";
      await registerToken(deniz, { token, platform: "ios" }).expect(200);
      const res = await registerToken(deniz, { token, revoke: true }).expect(
        200,
      );
      expect(res.body.success).toBe(true);
      expect(res.body.revoked).toBe(true);

      const prisma = getPrisma();
      const row = await prisma.pushToken.findFirst({
        where: { userId: deniz.id, token },
      });
      expect(row?.isActive).toBe(false);
    });

    scenario("MSG-073", async () => {
      // Token'sız kullanıcıya push best-effort: push başarısız olsa da in-app bildirim kaydedilir.
      // mustafa'nın hiç push token'ı yok; kendisine mesaj gelince NEW_MESSAGE in-app yine oluşur.
      const gonderen = await createUser(ctx.module, {
        displayName: "Gönderen",
      });
      const mustafa = await createUser(ctx.module, { displayName: "Mustafa" });
      const prisma = getPrisma();
      // mustafa'da push token OLMADIĞINI teyit et.
      const tokenCount = await prisma.pushToken.count({
        where: { userId: mustafa.id },
      });
      expect(tokenCount).toBe(0);

      const t = await createThread(gonderen, {
        recipientId: mustafa.id,
        message: "push token yok",
      }).expect(201);
      await sendMessage(gonderen, t.body.id, "ikinci mesaj").expect(201);

      // Push (No push tokens) sessizce başarısız → istek 201; in-app bildirim yine de var.
      const inApp = await prisma.notificationLog.count({
        where: { userId: mustafa.id, type: "new_message", channel: "in_app" },
      });
      expect(inApp).toBeGreaterThanOrEqual(1);
    });

    scenario("MSG-074", async () => {
      await request(server())
        .post("/api/notifications/push-token")
        .send({ token: "X" })
        .expect(401);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // Tercih gating (settings + bildirim baskılama)
  // ════════════════════════════════════════════════════════════════════════
  describe("Tercih gating", () => {
    const setSettings = (
      user: CreatedTestUser,
      body: Record<string, unknown>,
    ) =>
      request(server())
        .patch("/api/users/me/settings")
        .set(authHeader(user))
        .send(body);

    scenario("MSG-083", async () => {
      // PATCH yalnız verilen anahtarı değiştirir, diğerleri korunur.
      const deniz = await createUser(ctx.module);
      const res = await setSettings(deniz, { messageAlerts: false }).expect(
        200,
      );
      expect(res.body.messageAlerts).toBe(false);
      // Diğerleri varsayılan kalır.
      expect(res.body.orderUpdates).toBe(true);
      expect(res.body.emailNotifications).toBe(true);

      const get = await request(server())
        .get("/api/users/me/settings")
        .set(authHeader(deniz))
        .expect(200);
      expect(get.body.messageAlerts).toBe(false);
      expect(get.body.orderUpdates).toBe(true);
    });

    scenario("MSG-082", async () => {
      // Varsayılan tercihler: NEW_MESSAGE gider (messageAlerts=on); PROMOTION gitmez (marketingEmails=off).
      const deniz = await createUser(ctx.module, { displayName: "Deniz" });
      const ahmet = await createUser(ctx.module, { displayName: "Ahmet" });
      const t = await createThread(ahmet, {
        recipientId: deniz.id,
        message: "selam",
      }).expect(201);
      await sendMessage(ahmet, t.body.id, "ikinci").expect(201);

      const prisma = getPrisma();
      const newMsg = await prisma.notificationLog.count({
        where: { userId: deniz.id, type: "new_message", channel: "in_app" },
      });
      expect(newMsg).toBeGreaterThanOrEqual(1);
      // PROMOTION kategorisi (marketingEmails) varsayılan kapalı → hiç PROMOTION log yok.
      const promo = await prisma.notificationLog.count({
        where: { userId: deniz.id, type: "promotion" },
      });
      expect(promo).toBe(0);
    });

    scenario("MSG-079", async () => {
      // messageAlerts=false → NEW_MESSAGE bildirimi hiç oluşmaz (mesaj yine iletilir).
      const deniz = await createUser(ctx.module, { displayName: "Deniz" });
      const ahmet = await createUser(ctx.module, { displayName: "Ahmet" });
      await setSettings(ahmet, { messageAlerts: false }).expect(200);

      const t = await createThread(deniz, {
        recipientId: ahmet.id,
        message: "ilk",
      }).expect(201);
      await sendMessage(deniz, t.body.id, "ikinci mesaj").expect(201);

      const prisma = getPrisma();
      const notif = await prisma.notificationLog.count({
        where: { userId: ahmet.id, type: "new_message" },
      });
      expect(notif).toBe(0);
      // Mesajın kendisi yine de kaydedildi.
      const msgCount = await prisma.message.count({
        where: { threadId: t.body.id, receiverId: ahmet.id },
      });
      expect(msgCount).toBeGreaterThanOrEqual(2);
    });

    scenario("MSG-080", async () => {
      // pushNotifications=false → in-app bildirim oluşur, push gitmez (log tarafı in_app kalır).
      const deniz = await createUser(ctx.module, { displayName: "Deniz" });
      const ahmet = await createUser(ctx.module, { displayName: "Ahmet" });
      await setSettings(ahmet, { pushNotifications: false }).expect(200);

      const t = await createThread(deniz, {
        recipientId: ahmet.id,
        message: "selam",
      }).expect(201);
      await sendMessage(deniz, t.body.id, "ikinci").expect(201);

      const prisma = getPrisma();
      // in-app bildirim yine oluşur (zil kalır).
      const inApp = await prisma.notificationLog.count({
        where: { userId: ahmet.id, type: "new_message", channel: "in_app" },
      });
      expect(inApp).toBeGreaterThanOrEqual(1);
    });

    scenario("MSG-064", async () => {
      // ORDER_SHIPPED push+in-app (senkron notifyOrderShipped): kargo takip no girilince alıcıya bildirim.
      const seller = await createUser(ctx.module, { isSeller: true });
      await createAddress({
        userId: seller.id,
        isDefault: true,
        city: "İstanbul",
      });
      const buyer = await createUser(ctx.module);
      const addr = await createAddress({
        userId: buyer.id,
        isDefault: true,
        city: "Ankara",
      });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        price: 250,
        status: "active",
      });
      const { orderId } = await buyAndPay(ctx, buyer, product.id, addr.id);

      // Kanonik akış: shipment ödemede otomatik oluşur; satıcı takip no girer → ORDER_SHIPPED.
      const ship = await request(server())
        .get(`/api/shipping/order/${orderId}`)
        .set(authHeader(seller))
        .expect(200);
      const shipmentId = ship.body.id;
      expect(shipmentId).toBeTruthy();

      await request(server())
        .patch(`/api/shipping/${shipmentId}/tracking`)
        .set(authHeader(seller))
        .send({ trackingNumber: "TR123456789" })
        .expect(200);

      const prisma = getPrisma();
      const shipped = await prisma.notificationLog.findFirst({
        where: { userId: buyer.id, type: "order_shipped", channel: "in_app" },
      });
      expect(shipped).not.toBeNull();
      expect(shipped?.body).toContain("TR123456789");
    });

    scenario("MSG-081", async () => {
      // orderUpdates=false → ORDER_SHIPPED tamamen baskılanır (hiçbir kanaldan gitmez).
      const seller = await createUser(ctx.module, { isSeller: true });
      await createAddress({
        userId: seller.id,
        isDefault: true,
        city: "İstanbul",
      });
      const buyer = await createUser(ctx.module);
      const addr = await createAddress({
        userId: buyer.id,
        isDefault: true,
        city: "Ankara",
      });
      await request(server())
        .patch("/api/users/me/settings")
        .set(authHeader(buyer))
        .send({ orderUpdates: false })
        .expect(200);
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        price: 250,
        status: "active",
      });
      const { orderId } = await buyAndPay(ctx, buyer, product.id, addr.id);

      // Kanonik akış: shipment ödemede otomatik oluşur.
      const ship = await request(server())
        .get(`/api/shipping/order/${orderId}`)
        .set(authHeader(seller))
        .expect(200);
      const shipmentId = ship.body.id;
      await request(server())
        .patch(`/api/shipping/${shipmentId}/tracking`)
        .set(authHeader(seller))
        .send({ trackingNumber: "TR987654321" })
        .expect(200);

      const prisma = getPrisma();
      const shipped = await prisma.notificationLog.count({
        where: { userId: buyer.id, type: "order_shipped" },
      });
      expect(shipped).toBe(0);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // Admin broadcast & scheduled
  // ════════════════════════════════════════════════════════════════════════
  describe("Admin broadcast & scheduled", () => {
    scenario("MSG-084", async () => {
      // Admin tüm kullanıcılara in_app broadcast.
      const admin = await createAdminUser(ctx.module, { role: "admin" as any });
      const u1 = await createUser(ctx.module);
      const u2 = await createUser(ctx.module);

      const res = await request(server())
        .post("/api/admin/notifications/send")
        .set(authHeader(admin))
        .send({
          title: "Duyuru",
          body: "Herkese",
          channels: ["in_app"],
          targetType: "all",
        })
        .expect(200);
      expect(res.body.success).toBe(true);
      expect(res.body.targetCount).toBeGreaterThanOrEqual(2);

      const prisma = getPrisma();
      const rows = await prisma.notificationLog.count({
        where: { type: "admin_broadcast", channel: "in_app", status: "sent" },
      });
      expect(rows).toBeGreaterThanOrEqual(2);
      // Audit log yazıldı.
      const audit = await prisma.auditLog.count({
        where: { action: "notification_send" },
      });
      expect(audit).toBeGreaterThanOrEqual(1);
      // Hedefe ulaştı.
      const u1count = await prisma.notificationLog.count({
        where: { userId: u1.id, type: "admin_broadcast" },
      });
      expect(u1count).toBeGreaterThanOrEqual(1);
      expect(u2.id).toBeTruthy();
    });

    scenario("MSG-085", async () => {
      // Broadcast tercihten muaf: kapalı tercihli kullanıcıya da in_app satırı oluşur.
      const admin = await createAdminUser(ctx.module, { role: "admin" as any });
      const opted = await createUser(ctx.module);
      await request(server())
        .patch("/api/users/me/settings")
        .set(authHeader(opted))
        .send({
          pushNotifications: false,
          orderUpdates: false,
          messageAlerts: false,
        })
        .expect(200);

      await request(server())
        .post("/api/admin/notifications/send")
        .set(authHeader(admin))
        .send({
          title: "Zorunlu",
          body: "Muaf",
          channels: ["in_app"],
          targetType: "all",
        })
        .expect(200);

      const prisma = getPrisma();
      const row = await prisma.notificationLog.count({
        where: { userId: opted.id, type: "admin_broadcast", channel: "in_app" },
      });
      expect(row).toBeGreaterThanOrEqual(1);
    });

    scenario("MSG-086", async () => {
      // Segment: yalnız satıcılar (isSeller:true).
      const admin = await createAdminUser(ctx.module, { role: "admin" as any });
      const seller = await createUser(ctx.module, { isSeller: true });
      const buyer = await createUser(ctx.module, { isSeller: false });

      const res = await request(server())
        .post("/api/admin/notifications/send")
        .set(authHeader(admin))
        .send({
          title: "Satıcılara",
          body: "Yalnız satıcı",
          channels: ["in_app"],
          targetType: "segment",
          segmentCriteria: { isSeller: true },
        })
        .expect(200);
      expect(res.body.success).toBe(true);

      const prisma = getPrisma();
      const sellerGot = await prisma.notificationLog.count({
        where: { userId: seller.id, type: "admin_broadcast" },
      });
      const buyerGot = await prisma.notificationLog.count({
        where: { userId: buyer.id, type: "admin_broadcast" },
      });
      expect(sellerGot).toBeGreaterThanOrEqual(1);
      expect(buyerGot).toBe(0);
    });

    scenario("MSG-087", async () => {
      // Hedef yoksa (user_ids boş) → 400.
      const admin = await createAdminUser(ctx.module, { role: "admin" as any });
      const res = await request(server())
        .post("/api/admin/notifications/send")
        .set(authHeader(admin))
        .send({
          title: "t",
          body: "b",
          channels: ["in_app"],
          targetType: "user_ids",
          userIds: [],
        })
        .expect(400);
      expect(JSON.stringify(res.body)).toContain("Hedef kullanıcı bulunamadı");
    });

    scenario("MSG-088", async () => {
      // Gelecek tarih → pending ScheduledNotification (201).
      const admin = await createAdminUser(ctx.module, { role: "admin" as any });
      const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const res = await request(server())
        .post("/api/admin/notifications/schedule")
        .set(authHeader(admin))
        .send({
          title: "Planlı",
          body: "İleri",
          channels: ["in_app"],
          targetType: "all",
          scheduledFor: future,
        })
        .expect(201);
      expect(res.body.status).toBe("pending");
      expect(res.body.id).toBeTruthy();

      const prisma = getPrisma();
      const row = await prisma.scheduledNotification.findUnique({
        where: { id: res.body.id },
      });
      expect(row?.status).toBe("pending");
      const audit = await prisma.auditLog.count({
        where: { action: "notification_schedule" },
      });
      expect(audit).toBeGreaterThanOrEqual(1);
    });

    scenario("MSG-089", async () => {
      // Geçmiş tarih → 400.
      const admin = await createAdminUser(ctx.module, { role: "admin" as any });
      const past = new Date(Date.now() - 60 * 1000).toISOString();
      const res = await request(server())
        .post("/api/admin/notifications/schedule")
        .set(authHeader(admin))
        .send({
          title: "x",
          body: "y",
          channels: ["in_app"],
          targetType: "all",
          scheduledFor: past,
        })
        .expect(400);
      expect(JSON.stringify(res.body)).toContain(
        "Zamanlama tarihi gelecekte olmalıdır",
      );
    });

    scenario("MSG-092", async () => {
      // Planlı bildirimi iptal → status=cancelled.
      const admin = await createAdminUser(ctx.module, { role: "admin" as any });
      const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const created = await request(server())
        .post("/api/admin/notifications/schedule")
        .set(authHeader(admin))
        .send({
          title: "İptal edilecek",
          body: "b",
          channels: ["in_app"],
          targetType: "all",
          scheduledFor: future,
        })
        .expect(201);

      const res = await request(server())
        .delete(`/api/admin/notifications/scheduled/${created.body.id}`)
        .set(authHeader(admin))
        .expect(200);
      expect(res.body.success).toBe(true);

      const prisma = getPrisma();
      const row = await prisma.scheduledNotification.findUnique({
        where: { id: created.body.id },
      });
      expect(row?.status).toBe("cancelled");
    });

    scenario("MSG-093", async () => {
      // Yetki: moderator izinli, normal kullanıcı 401/403.
      const moderator = await createAdminUser(ctx.module, {
        role: "moderator" as any,
      });
      await createUser(ctx.module); // en az bir hedef olsun
      await request(server())
        .post("/api/admin/notifications/send")
        .set(authHeader(moderator))
        .send({
          title: "Mod",
          body: "b",
          channels: ["in_app"],
          targetType: "all",
        })
        .expect(200);

      const deniz = await createUser(ctx.module);
      const res = await request(server())
        .post("/api/admin/notifications/send")
        .set(authHeader(deniz))
        .send({
          title: "x",
          body: "y",
          channels: ["in_app"],
          targetType: "all",
        });
      expect([401, 403]).toContain(res.status);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // Kullanıcı engelleme (in-memory)
  // ════════════════════════════════════════════════════════════════════════
  describe("Kullanıcı engelleme", () => {
    scenario("MSG-053", async () => {
      const deniz = await createUser(ctx.module, { displayName: "Deniz" });
      const ahmet = await createUser(ctx.module, { displayName: "Ahmet" });

      const block = await request(server())
        .post(`/api/users/${ahmet.id}/block`)
        .set(authHeader(deniz))
        .expect(201);
      expect(block.body.success).toBe(true);
      expect(block.body.message).toContain("engellendi");

      // Aynı engellemeyi tekrar → 400.
      const dup = await request(server())
        .post(`/api/users/${ahmet.id}/block`)
        .set(authHeader(deniz))
        .expect(400);
      expect(JSON.stringify(dup.body)).toContain("zaten engellenmiş");

      // Kendini engelle → 400.
      const self = await request(server())
        .post(`/api/users/${deniz.id}/block`)
        .set(authHeader(deniz))
        .expect(400);
      expect(JSON.stringify(self.body)).toContain(
        "Kendinizi engelleyemezsiniz",
      );
    });

    scenario("MSG-054", async () => {
      // Engelleme mesajlaşmayı DURDURMAZ (dokümante risk): block sonrası mesaj 201.
      const deniz = await createUser(ctx.module);
      const ahmet = await createUser(ctx.module);
      await request(server())
        .post(`/api/users/${ahmet.id}/block`)
        .set(authHeader(deniz))
        .expect(201);

      const thread = await createThread(deniz, {
        recipientId: ahmet.id,
        message: "engelli olsam da",
      }).expect(201);
      await sendMessage(deniz, thread.body.id, "yine de gider").expect(201);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // SKIP — API'den assert EDİLEMEYEN senaryolar (net gerekçe)
  // ════════════════════════════════════════════════════════════════════════
  scenario.skip(
    "MSG-035",
    "Salt web-client ön-uyarısı (i18n toast); backend kararı MSG-031/105 ile kaplı, API tarafında gözlemlenecek davranış yok.",
  );
  scenario.skip(
    "MSG-041",
    "Salt admin-UI paneli (rozet/aksiyon render); API tarafı MSG-029/036/037 ile kaplı.",
  );
  scenario.skip(
    "MSG-044",
    "WS bağlantı reddi: paylaşılan test app app.listen() çağırmaz + socket.io-client paketi yok → handshake gözlemlenemez.",
  );
  scenario.skip(
    "MSG-045",
    "WS geçersiz token reddi: aynı WS harness kısıtı (bkz. MSG-044).",
  );
  scenario.skip(
    "MSG-046",
    "WS connected/kişisel oda: WS istemcisi yok → event alınamaz.",
  );
  scenario.skip("MSG-047", "WS join:thread yetki reddi: WS istemcisi yok.");
  scenario.skip(
    "MSG-048",
    "WS message:new + thread:updated yayılımı: WS istemcisi yok (senkron in-app bildirim MSG-063 ile kaplı).",
  );
  scenario.skip(
    "MSG-049",
    "WS pending mesajda emit olmaması: WS istemcisi yok (pending davranışı MSG-032/104 ile kaplı).",
  );
  scenario.skip(
    "MSG-050",
    "WS message:read yayılımı: WS istemcisi yok (okundu DB davranışı MSG-019 ile kaplı).",
  );
  scenario.skip("MSG-051", "WS typing:start/stop: WS istemcisi yok.");
  scenario.skip(
    "MSG-052",
    "WS çoklu cihaz/isUserOnline: WS istemcisi yok, in-memory socket haritası gözlemlenemez.",
  );
  scenario.skip(
    "MSG-055",
    "Engellemenin API restart’ta kaybı: paylaşılan test app restart edilemez (in-memory Map).",
  );
  scenario.skip(
    "MSG-065",
    "OFFER_RECEIVED (create) BullMQ emailQueue/pushQueue üzerinden asenkron; create akışı senkron in-app NotificationLog yazmaz → deterministik assert yok.",
  );
  scenario.skip(
    "MSG-066",
    "REFUND_* bildirimleri event/queue tabanlı çok-adımlı akış; test worker deterministik koşmaz → senkron NotificationLog doğrulanamaz.",
  );
  scenario.skip(
    "MSG-067",
    "Stokout/BACK_IN_STOCK bildirimleri sweep-cron + queue + 24s debounce ile asenkron; harness’te deterministik değil.",
  );
  scenario.skip(
    "MSG-075",
    "Sipariş-oluşturuldu e-postası emailQueue üzerinden asenkron işlenir; MailHog’a düşmesi test worker’a bağlı → deterministik değil.",
  );
  scenario.skip(
    "MSG-076",
    "emailNotifications=false EMAIL atlama: EMAIL kanalı queue tabanlı; kategori/kanal gating mantığı MSG-079/080/081 ile fiilen kaplı.",
  );
  scenario.skip(
    "MSG-077",
    "PASSWORD_RESET (ALWAYS_SEND) e-postası: e-posta gönderimi queue/SMTP’ye bağlı asenkron; auth domaininde (01) test edilir.",
  );
  scenario.skip(
    "MSG-078",
    "E-postaların yalnız TR olması: dokümante kısıt, saf içerik/i18n gözlemi; API tarafında assert edilecek davranış yok.",
  );
  scenario.skip(
    "MSG-090",
    "Cron planlı bildirim gönderimi: scheduled-notification cron/processor için /dev hook’u yok (runScheduler listesinde değil) → tetiklenemez.",
  );
  scenario.skip(
    "MSG-091",
    "Cron çift-işlem koruması (isProcessing flag): manuel cron tetikleme hook’u yok → gözlemlenemez.",
  );
  scenario.skip(
    "MSG-094",
    'Mesaj önizleme i18n "📷 Fotoğraf"/"📷 Photo": salt-UI/preview render pariteи; getThreadPreview backend’i mesaj listesi uçlarında ayrı DTO döndürmez.',
  );
  scenario.skip(
    "MSG-095",
    "Web vs Mobile mesaj ekranı paritesi: salt istemci karşılaştırması.",
  );
  scenario.skip(
    "MSG-096",
    "Bildirim metinlerinin TR olması: dokümante i18n kısıtı, saf içerik gözlemi.",
  );
  scenario.skip(
    "MSG-097",
    "Mobil bildirim ayarları ekranı paritesi: salt istemci; ayar backend’i MSG-083 ile kaplı.",
  );
  scenario.skip(
    "MSG-101",
    "Yükleniyor/hata UI durumları: salt istemci render/hata-sınırı davranışı.",
  );
  scenario.skip(
    "MSG-106",
    "WS oda izolasyonu (yetkisiz kullanıcı event almaz): WS istemcisi yok; thread erişim izolasyonu MSG-026/103 ile kaplı.",
  );
  scenario.skip(
    "MSG-107",
    "Mesaj/bildirim XSS koruması: React varsayılan escaping (render katmanı); backend içeriği ham saklar, API’de assert edilecek dönüşüm yok.",
  );
});
