/**
 * DEV/TEST HOOK CONTROLLER — yalnız NODE_ENV=test'te yüklenir (DevModule AppModule'e
 * koşullu eklenir) VE her endpoint ayrıca guard'lar. Amaç: E2E testlerinin
 * tarayıcıdan tetikleyemediği şeyleri HTTP üzerinden yapması:
 *   - cron/sweep tetikleme (zaman-bazlı akışlar)
 *   - tarih backdate (zaman yolculuğu)
 *   - DB-seviyesi assertion için generic okuma
 * Yeni iş mantığı YOK; mevcut servis metodlarını çağırır.
 */
import { Controller, Post, Body, NotFoundException } from "@nestjs/common";
import { Public } from "../auth/decorators/public.decorator";
import { PrismaService } from "../../prisma";
import { CacheService } from "../cache/cache.service";
import { PaymentService } from "../payment/payment.service";
import { ProductLockService } from "../product/lock/product-lock.service";
import { TradeService } from "../trade/trade.service";
import { MembershipService } from "../membership/membership.service";
import { OfferSchedulerService } from "../offer/offer-scheduler.service";
import { MembershipSchedulerService } from "../membership/membership-scheduler.service";
import { InjectQueue } from "@nestjs/bull";
import { Queue } from "bull";
import { QUEUE_NAMES } from "../../workers/constants";
import { NotificationDispatchService } from "../notification/notification-dispatch.service";
import { isKnownNotificationType } from "../notification/notification-link";
import { isTest, nodeEnv } from "../../config/environment";
import { i18nMessage } from "../i18n";

function assertTestEnv(): void {
  if (!isTest()) {
    throw new NotFoundException();
  }
}

@Public() // NODE_ENV=test guard'ı zaten her endpoint'te var; JWT guard'ı atla
@Controller("dev")
export class DevController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payment: PaymentService,
    private readonly productLock: ProductLockService,
    private readonly trade: TradeService,
    private readonly membership: MembershipService,
    private readonly offerScheduler: OfferSchedulerService,
    private readonly membershipScheduler: MembershipSchedulerService,
    private readonly cache: CacheService,
    private readonly notifications: NotificationDispatchService,
    // Bildirimi PushWorker'ın yazdığı yolu test edebilmek için gerçek kuyruk.
    @InjectQueue(QUEUE_NAMES.PUSH) private readonly pushQueue: Queue,
  ) {}

  // ───────── Scheduler / sweep tetikleyiciler ─────────
  @Post("run/cancel-expired-payments")
  async cancelExpiredPayments() {
    assertTestEnv();
    return this.payment.cancelExpiredPayments();
  }

  @Post("run/release-expired-reservations")
  async releaseExpiredReservations() {
    assertTestEnv();
    return this.payment.releaseExpiredOrderReservations();
  }

  @Post("run/release-holds-due")
  async releaseHoldsDue() {
    assertTestEnv();
    return this.payment.releaseHoldsDue();
  }

  @Post("run/reconcile-paytr")
  async reconcilePaytr() {
    assertTestEnv();
    return this.payment.reconcilePendingPaytrPayments();
  }

  @Post("run/sweep-out-of-stock")
  async sweepOutOfStock() {
    assertTestEnv();
    return this.productLock.sweepOutOfStockProducts();
  }

  @Post("run/expire-offers")
  async expireOffers() {
    assertTestEnv();
    return this.offerScheduler.runHandleExpiredOffers();
  }

  @Post("run/cancel-expired-trades")
  async cancelExpiredTrades() {
    assertTestEnv();
    return this.trade.autoCancelExpiredTrades();
  }

  @Post("run/check-expired-memberships")
  async checkExpiredMemberships() {
    assertTestEnv();
    return this.membership.checkExpiredMemberships();
  }

  @Post("run/process-auto-renewals")
  async processAutoRenewals() {
    assertTestEnv();
    return this.membershipScheduler.runProcessAutoRenewals();
  }

  // ───────── Zaman yolculuğu: tarih backdate ─────────
  /** body: { model, where, data } — data içindeki ISO tarih string'leri Date'e çevrilir. */
  @Post("backdate")
  async backdate(
    @Body()
    body: {
      model: string;
      where: Record<string, any>;
      data: Record<string, any>;
    },
  ) {
    assertTestEnv();
    const m = (this.prisma as any)[body.model];
    if (!m?.updateMany)
      throw new NotFoundException(`Bilinmeyen model: ${body.model}`);
    const data: Record<string, any> = {};
    for (const [k, v] of Object.entries(body.data ?? {})) {
      data[k] =
        typeof v === "string" && /^\d{4}-\d{2}-\d{2}T?/.test(v)
          ? new Date(v)
          : v;
    }
    return m.updateMany({ where: body.where, data });
  }

  // ───────── DB-seviyesi assertion için generic okuma ─────────
  @Post("find")
  async find(
    @Body()
    body: {
      model: string;
      where: Record<string, any>;
      select?: Record<string, any>;
      orderBy?: any;
    },
  ) {
    assertTestEnv();
    const m = (this.prisma as any)[body.model];
    if (!m?.findFirst)
      throw new NotFoundException(`Bilinmeyen model: ${body.model}`);
    return m.findFirst({
      where: body.where,
      select: body.select,
      orderBy: body.orderBy,
    });
  }

  @Post("count")
  async count(@Body() body: { model: string; where?: Record<string, any> }) {
    assertTestEnv();
    const m = (this.prisma as any)[body.model];
    if (!m?.count)
      throw new NotFoundException(`Bilinmeyen model: ${body.model}`);
    return { count: await m.count({ where: body.where }) };
  }

  // ───────── Bildirim tohumlama (link E2E'si için) ─────────
  /**
   * Verilen kullanıcıya belirtilen tipte bildirim üretir.
   *
   * Satırı doğrudan INSERT ETMEZ. Üretimde bildirimi yazan İKİ ayrı yol var ve
   * ikisi de kendi linkini üretiyor:
   *
   *  - `dispatch`: `createInAppNotification` — şablonu olan tipler.
   *  - `worker`:   `push` kuyruğuna `send-notification` işi; satırı
   *                PushWorker yazar. EventService'in ürettiği tipler
   *                (trade_ready_for_shipping, payment_confirmed …) bu yoldan
   *                gelir ve şablonları YOKTUR — testi geçirmek için sahte
   *                şablon eklemek, gerçek yolu test etmemek olurdu.
   *
   * `clear` ile kullanıcının mevcut bildirimleri silinir — test hangi kartın
   * nerede olduğunu bilmeden doğrulama yapamaz.
   */
  @Post("notifications/seed")
  async seedNotifications(
    @Body()
    body: {
      email: string;
      clear?: boolean;
      items: Array<{
        type: string;
        data?: Record<string, any>;
        /** Üretim yolu. Belirtilmezse şablon yolu. */
        path?: "dispatch" | "worker";
        /** Worker yolu için push başlığı/gövdesi (şablon yok). */
        title?: string;
        body?: string;
      }>;
    },
  ) {
    assertTestEnv();
    const user = await this.prisma.user.findUnique({
      where: { email: body.email },
      select: { id: true },
    });
    if (!user)
      throw new NotFoundException(
        i18nMessage("server.dev.userMissing", { email: body.email }),
      );

    if (body.clear) {
      // Yalnız zil/bildirim merkezinin okuduğu kanal; e-posta/SMS logu durur.
      await this.prisma.notificationLog.deleteMany({
        where: { userId: user.id, channel: "in_app" },
      });
    }

    const created: string[] = [];
    const skipped: string[] = [];
    for (const item of body.items ?? []) {
      if (!isKnownNotificationType(item.type)) {
        throw new NotFoundException(`Bilinmeyen bildirim tipi: ${item.type}`);
      }

      if (item.path === "worker") {
        const before = await this.countInApp(user.id, item.type);
        // EventService ne yapıyorsa o: kuyruğa `send-notification` işi.
        await this.pushQueue.add("send-notification", {
          userId: user.id,
          title: item.title ?? item.type,
          body: item.body ?? item.type,
          data: { type: item.type, ...(item.data ?? {}) },
        });
        // Worker asenkron yazar; test kartı arayabilsin diye satır beklenir.
        const written = await this.waitForInApp(user.id, item.type, before);
        (written ? created : skipped).push(item.type);
        continue;
      }

      const ok = await this.notifications.createInAppNotification(
        user.id,
        item.type,
        item.data,
      );
      (ok ? created : skipped).push(item.type);
    }
    return { userId: user.id, created, skipped };
  }

  private countInApp(userId: string, type: string): Promise<number> {
    return this.prisma.notificationLog.count({
      where: { userId, channel: "in_app", type },
    });
  }

  /** Kuyruk işinin yazdığı satırı bekler (worker asenkron). */
  private async waitForInApp(
    userId: string,
    type: string,
    before: number,
    timeoutMs = 15000,
  ): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if ((await this.countInApp(userId, type)) > before) return true;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    return false;
  }

  // ───────── Per-journey state reset (her senaryoyu 0'dan izole koşmak için) ─────────
  /**
   * Volatile (işlemsel) tabloları temizler + seed snapshot'ına döner. Hızlı (~1s).
   * Seed kullanıcı/ürün/kategori/tier/adres KORUNUR; journey'lerin oluşturduğu
   * sipariş/teklif/takas/iade/üyelik/ilan/kayıt temizlenir, seed ürün stoğu geri yüklenir.
   */
  @Post("reset-state")
  async resetState() {
    assertTestEnv();
    const VOLATILE = [
      "orders",
      "payments",
      "payment_holds",
      "payout_transfers",
      "refund_requests",
      "invoices",
      "offers",
      "trades",
      "trade_items",
      "trade_shipments",
      "trade_shipment_events",
      "trade_cash_payments",
      "trade_disputes",
      "trade_messages",
      "message_threads",
      "messages",
      "carts",
      "cart_items",
      "wishlists",
      "wishlist_items",
      "support_tickets",
      "ticket_messages",
      "notification_logs",
      "scheduled_notifications",
      "membership_payments",
      "user_memberships",
      "product_ratings",
      "ratings",
      "product_likes",
      "product_boosts",
      "seller_bank_accounts",
      "user_follows",
      "two_factor_secrets",
      "collections",
      "collection_items",
      "discounts",
      "discount_usages",
      "reports",
    ];
    const inList = VOLATILE.map((t) => `'${t}'`).join(",");

    // 1) Var olan volatile tabloları bul (Prisma DO-block/$$ sevmiyor → tek TRUNCATE)
    const tblRows: any[] = await this.prisma.$queryRawUnsafe(
      `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN (${inList})`,
    );
    const existing: string[] = (tblRows ?? []).map((r) => r.table_name);
    if (existing.length) {
      const cols = existing.map((t) => `"${t}"`).join(", ");
      await this.prisma.$executeRawUnsafe(
        `TRUNCATE TABLE ${cols} RESTART IDENTITY CASCADE`,
      );
    }

    // 2) Seed restore — KOŞULSUZ (snapshot'lar setup'ta hep oluşur; EXISTS-check Prisma'da
    //    güvenilmez parse edildiği için kaldırıldı → flaky free-downgrade'i bitirir).
    //    Snapshot yoksa statement hata verir → catch ile geç (fallback: tüm stok yükselt).
    let snapshot = true;
    let snapErr = "";
    try {
      await this.prisma.$executeRawUnsafe(
        `DELETE FROM products WHERE id NOT IN (SELECT id FROM _seed_products)`,
      );
      await this.prisma.$executeRawUnsafe(
        `DELETE FROM users WHERE id NOT IN (SELECT id FROM _seed_users)`,
      );
      await this.prisma.$executeRawUnsafe(
        `UPDATE products SET quantity = 100000, status = 'active' WHERE id IN (SELECT id FROM _seed_products)`,
      );
    } catch (e) {
      snapshot = false;
      snapErr = (e as Error).message.replace(/[\r\n\t ]+/g, " ").slice(0, 110);
      await this.prisma
        .$executeRawUnsafe(
          `UPDATE products SET quantity = 100000 WHERE status = 'active'`,
        )
        .catch(() => {});
    }

    // 3) Seed üyeliklerini geri yükle (KOŞULSUZ) — truncate user_memberships'i free'ye
    //    düşürüyordu → ahmet=premium/ali=business takas/ilan yapamıyordu. Snapshot'tan restore.
    let memErr = "";
    try {
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO user_memberships SELECT * FROM _seed_memberships ON CONFLICT (user_id) DO NOTHING`,
      );
    } catch (e) {
      memErr = (e as Error).message.replace(/[\r\n\t ]+/g, " ").slice(0, 110);
    }

    // 4) Cache flush — DB sıfırlandı; stale membership/limit/ürün-listesi cache'i kalmasın
    await this.cache.delPattern("*").catch(() => {});

    // DEBUG: ahmet'in restore sonrası tier'ı (membership restore çalıştı mı görmek için)
    let ahmetTier = "NONE";
    try {
      const dbg: any[] = await this.prisma.$queryRawUnsafe(
        `SELECT t.type::text AS tier FROM user_memberships um JOIN users u ON um.user_id=u.id JOIN membership_tiers t ON um.tier_id=t.id WHERE u.email='ahmet@demo.com' LIMIT 1`,
      );
      ahmetTier = dbg?.[0]?.tier ?? "NONE";
    } catch (e) {
      ahmetTier = "ERR:" + (e as Error).message.slice(0, 40);
    }

    let dbInfo = "";
    try {
      const d: any[] = await this.prisma.$queryRawUnsafe(
        `SELECT current_database() AS db, (SELECT count(*)::int FROM information_schema.tables WHERE table_name='_seed_products') AS hasseed`,
      );
      dbInfo = `db=${d?.[0]?.db} hasseed=${d?.[0]?.hasseed} tdb=${(process.env.TEST_DATABASE_URL || "NONE").slice(-22)} ne=${nodeEnv()} pid=${process.pid}`;
    } catch (e) {
      dbInfo = "ERR:" + (e as Error).message.slice(0, 40);
    }

    let offersAfter = -1;
    try {
      offersAfter = await this.prisma.offer.count();
    } catch {}

    return {
      ok: true,
      truncated: existing.length,
      snapshot,
      ahmetTier,
      snapErr,
      memErr,
      dbInfo,
      offersAfter,
    };
  }
}
