import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bull";
import type { Queue } from "bull";
import { PrismaService } from "../../prisma";
import { QUEUE_NAMES } from "../../workers/constants";
import { CRON_CATALOG } from "../../workers/cron-catalog";
import { nodeEnv } from "../../config/environment";
import { i18nMessage } from "../i18n";

/**
 * Admin "Test Araçları / Zaman Makinesi" arka uç mantığı.
 *
 * Süre/zaman-bazlı akışları manuel test etmek için: (1) cron tetikleme, (2) tek bir kaydın
 * ilgili tarih alanını geri/ileri alma. YENİ İŞ MANTIĞI YOK. Cron tetikleme `scheduled`
 * kuyruğuna fiş atar — iş, zamanlanmış koşumla AYNI yoldan (worker process'i, runTrackedJob
 * izlemesi, aynı-ad sıralı işleme) geçer; HTTP process'inde doğrudan servis çağrısı yoktur.
 * Tetiklenebilir liste tek kaynaktan (CRON_CATALOG.triggerable) gelir.
 *
 * Güvenlik: controller süper-admin + audit ile gate'ler. Süre ayarlamada her işlem TEK kayıt
 * hedefler; toplu/where-bazlı güncelleme yoktur (kazara tüm tabloyu vurma imkânsız).
 */

export type TestToolType =
  | "boost"
  | "membership"
  | "refund"
  | "order"
  | "offer"
  | "trade"
  | "hold"
  | "email_verification"
  | "password_reset";

export type AdjustAction = "expire_now" | "set_minutes" | "backdate_days";

export interface SearchItem {
  id: string;
  label: string;
  status?: string;
  /** alan adı → ISO tarih (gösterim için) */
  dates: Record<string, string | null>;
}

@Injectable()
export class AdminTestToolsService {
  private readonly logger = new Logger(AdminTestToolsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_NAMES.SCHEDULED) private readonly scheduledQueue: Queue,
  ) {}

  // ─────────────────────────── Ortam ───────────────────────────
  getEnvironment(): { env: string; isProd: boolean } {
    const env = nodeEnv() ?? "development";
    return { env, isProd: env === "production" };
  }

  // ─────────────────────────── Cron'lar ───────────────────────────
  listCrons() {
    return CRON_CATALOG.filter((c) => c.triggerable).map(
      ({ key, label, description }) => ({ key, label, description }),
    );
  }

  /**
   * Cron'u kuyruğa fiş atarak tetikler. Bilinmeyen anahtar VE triggerable=false
   * aynı hatayı alır: whitelist listCrons'un döndüğüdür — toplu gönderim yapan
   * işler (marketing vb.) API'den de tetiklenemez, yalnız UI'da gizli değildir.
   */
  async runCron(
    key: string,
  ): Promise<{ key: string; jobId: string; queuedAt: string }> {
    const def = CRON_CATALOG.find((c) => c.key === key && c.triggerable);
    if (!def) throw new BadRequestException(`Bilinmeyen cron: ${key}`);
    const job = await this.scheduledQueue.add(
      key,
      {},
      { removeOnComplete: 50, removeOnFail: 50 },
    );
    this.logger.log(`Test aracı cron tetikledi: ${key} (job=${job.id})`);
    return { key, jobId: String(job.id), queuedAt: new Date().toISOString() };
  }

  // ─────────────────────────── Arama ───────────────────────────
  async search(type: TestToolType, q: string): Promise<SearchItem[]> {
    const query = (q ?? "").trim();
    if (query.length < 2) return [];
    const ci = { contains: query, mode: "insensitive" as const };
    const take = 10;

    switch (type) {
      case "boost": {
        const rows = await this.prisma.product.findMany({
          where: {
            boostedUntil: { not: null },
            OR: [{ title: ci }, { slug: ci }],
          },
          select: { id: true, title: true, boostedUntil: true },
          take,
        });
        return rows.map((r) => ({
          id: r.id,
          label: r.title,
          dates: { boostedUntil: iso(r.boostedUntil) },
        }));
      }
      case "membership": {
        const rows = await this.prisma.userMembership.findMany({
          where: { user: { OR: [{ email: ci }, { displayName: ci }] } },
          select: {
            id: true,
            currentPeriodEnd: true,
            status: true,
            user: { select: { email: true } },
          },
          take,
        });
        return rows.map((r) => ({
          id: r.id,
          label: r.user?.email ?? r.id,
          status: r.status,
          dates: { currentPeriodEnd: iso(r.currentPeriodEnd) },
        }));
      }
      case "refund": {
        const rows = await this.prisma.refundRequest.findMany({
          where: { OR: [{ id: ci }, { order: { orderNumber: ci } }] },
          select: {
            id: true,
            createdAt: true,
            status: true,
            order: { select: { orderNumber: true } },
          },
          take,
        });
        return rows.map((r) => ({
          id: r.id,
          label: r.order?.orderNumber ?? r.id,
          status: r.status,
          dates: { createdAt: iso(r.createdAt) },
        }));
      }
      case "order": {
        const rows = await this.prisma.order.findMany({
          where: { orderNumber: ci },
          select: {
            id: true,
            orderNumber: true,
            paymentExpiresAt: true,
            status: true,
          },
          take,
        });
        return rows.map((r) => ({
          id: r.id,
          label: r.orderNumber,
          status: r.status,
          dates: { paymentExpiresAt: iso(r.paymentExpiresAt) },
        }));
      }
      case "offer": {
        const rows = await this.prisma.offer.findMany({
          where: { OR: [{ id: ci }, { product: { title: ci } }] },
          select: {
            id: true,
            expiresAt: true,
            status: true,
            product: { select: { title: true } },
          },
          take,
        });
        return rows.map((r) => ({
          id: r.id,
          label: r.product?.title ?? r.id,
          status: r.status,
          dates: { expiresAt: iso(r.expiresAt) },
        }));
      }
      case "trade": {
        const rows = await this.prisma.trade.findMany({
          where: { id: ci },
          select: {
            id: true,
            status: true,
            responseDeadline: true,
            paymentDeadline: true,
            shippingDeadline: true,
          },
          take,
        });
        return rows.map((r) => ({
          id: r.id,
          label: `Takas ${r.id.slice(0, 8)}`,
          status: r.status,
          dates: {
            responseDeadline: iso(r.responseDeadline),
            paymentDeadline: iso(r.paymentDeadline),
            shippingDeadline: iso(r.shippingDeadline),
          },
        }));
      }
      case "hold": {
        // PaymentHold'da Order ilişkisi yok (yalnız orderId). Önce sipariş no ile order'ı bul,
        // sonra o orderId'nin hold'larını getir; ayrıca hold id ile de aranabilir.
        const orders = await this.prisma.order.findMany({
          where: { orderNumber: ci },
          select: { id: true, orderNumber: true },
          take,
        });
        const labelByOrderId = new Map(
          orders.map((o) => [o.id, o.orderNumber]),
        );
        const rows = await this.prisma.paymentHold.findMany({
          where: {
            OR: [{ id: ci }, { orderId: { in: orders.map((o) => o.id) } }],
          },
          select: { id: true, releaseAt: true, status: true, orderId: true },
          take,
        });
        return rows.map((r) => ({
          id: r.id,
          label: labelByOrderId.get(r.orderId) ?? r.orderId,
          status: r.status,
          dates: { releaseAt: iso(r.releaseAt) },
        }));
      }
      case "email_verification": {
        const rows = await this.prisma.emailVerificationToken.findMany({
          where: { usedAt: null, user: { email: ci } },
          select: {
            id: true,
            expiresAt: true,
            user: { select: { email: true } },
          },
          take,
        });
        return rows.map((r) => ({
          id: r.id,
          label: r.user?.email ?? r.id,
          dates: { expiresAt: iso(r.expiresAt) },
        }));
      }
      case "password_reset": {
        const rows = await this.prisma.passwordResetToken.findMany({
          where: { usedAt: null, user: { email: ci } },
          select: {
            id: true,
            expiresAt: true,
            user: { select: { email: true } },
          },
          take,
        });
        return rows.map((r) => ({
          id: r.id,
          label: r.user?.email ?? r.id,
          dates: { expiresAt: iso(r.expiresAt) },
        }));
      }
      default:
        throw new BadRequestException(`Bilinmeyen tip: ${type}`);
    }
  }

  // ─────────────────────────── Süre ayarlama ───────────────────────────
  /** Aksiyon → hedef tarih (hepsi "şimdi"ye göre, öngörülebilir). */
  private targetDate(action: AdjustAction, value: number): Date {
    return computeTargetDate(action, value);
  }

  /**
   * Tek kaydı hedefler; tipe göre SABİT alan(lar)ı yeni tarihe çeker.
   * Geri dönüş: audit için before/after.
   */
  async adjust(
    type: TestToolType,
    id: string,
    action: AdjustAction,
    value: number,
  ): Promise<{
    type: TestToolType;
    id: string;
    field: string;
    before: string | null;
    after: string;
  }> {
    if (!id) throw new BadRequestException("id zorunlu");
    const target = this.targetDate(action, value);
    const afterIso = target.toISOString();

    switch (type) {
      case "boost": {
        const before = await this.prisma.product.findUnique({
          where: { id },
          select: { boostedUntil: true, homeShowcaseUntil: true },
        });
        if (!before)
          throw new BadRequestException(i18nMessage("server.product.notFound"));
        await this.prisma.product.update({
          where: { id },
          data: {
            boostedUntil: target,
            // Vitrin penceresi de kaydırılır — aksi halde Vitrin dolum testi
            // yanıltıcı olur (boost dolar, vitrin eski tarihte kalırdı).
            ...(before.homeShowcaseUntil ? { homeShowcaseUntil: target } : {}),
          },
        });
        await this.prisma.productBoost.updateMany({
          where: { productId: id, status: "active" },
          data: { endsAt: target },
        });
        return {
          type,
          id,
          field: "boostedUntil",
          before: iso(before.boostedUntil),
          after: afterIso,
        };
      }
      case "membership": {
        const before = await this.prisma.userMembership.findUnique({
          where: { id },
          select: { currentPeriodEnd: true },
        });
        if (!before)
          throw new BadRequestException(
            i18nMessage("server.membership.notFound"),
          );
        await this.prisma.userMembership.update({
          where: { id },
          data: { currentPeriodEnd: target },
        });
        return {
          type,
          id,
          field: "currentPeriodEnd",
          before: iso(before.currentPeriodEnd),
          after: afterIso,
        };
      }
      case "refund": {
        const before = await this.prisma.refundRequest.findUnique({
          where: { id },
          select: { createdAt: true },
        });
        if (!before)
          throw new BadRequestException(i18nMessage("server.refund.notFound"));
        await this.prisma.refundRequest.update({
          where: { id },
          data: { createdAt: target },
        });
        return {
          type,
          id,
          field: "createdAt",
          before: iso(before.createdAt),
          after: afterIso,
        };
      }
      case "order": {
        const before = await this.prisma.order.findUnique({
          where: { id },
          select: { paymentExpiresAt: true },
        });
        if (!before)
          throw new BadRequestException(
            i18nMessage("server.refund.orderNotFound"),
          );
        await this.prisma.order.update({
          where: { id },
          data: { paymentExpiresAt: target },
        });
        return {
          type,
          id,
          field: "paymentExpiresAt",
          before: iso(before.paymentExpiresAt),
          after: afterIso,
        };
      }
      case "offer": {
        const before = await this.prisma.offer.findUnique({
          where: { id },
          select: { expiresAt: true },
        });
        if (!before)
          throw new BadRequestException(
            i18nMessage("server.order.offerNotFound"),
          );
        await this.prisma.offer.update({
          where: { id },
          data: { expiresAt: target },
        });
        return {
          type,
          id,
          field: "expiresAt",
          before: iso(before.expiresAt),
          after: afterIso,
        };
      }
      case "trade": {
        const before = await this.prisma.trade.findUnique({
          where: { id },
          select: {
            status: true,
            responseDeadline: true,
            paymentDeadline: true,
            shippingDeadline: true,
          },
        });
        if (!before)
          throw new BadRequestException(
            i18nMessage("server.payment.tradeNotFound"),
          );
        const field = tradeDeadlineField(before.status);
        await this.prisma.trade.update({
          where: { id },
          data: { [field]: target },
        });
        return {
          type,
          id,
          field,
          before: iso((before as any)[field]),
          after: afterIso,
        };
      }
      case "hold": {
        const before = await this.prisma.paymentHold.findUnique({
          where: { id },
          select: { releaseAt: true },
        });
        if (!before)
          throw new BadRequestException(
            i18nMessage("server.admin.holdNotFound"),
          );
        await this.prisma.paymentHold.update({
          where: { id },
          data: { releaseAt: target },
        });
        return {
          type,
          id,
          field: "releaseAt",
          before: iso(before.releaseAt),
          after: afterIso,
        };
      }
      case "email_verification": {
        const before = await this.prisma.emailVerificationToken.findUnique({
          where: { id },
          select: { expiresAt: true },
        });
        if (!before)
          throw new BadRequestException(
            i18nMessage("server.admin.tokenNotFound"),
          );
        await this.prisma.emailVerificationToken.update({
          where: { id },
          data: { expiresAt: target },
        });
        return {
          type,
          id,
          field: "expiresAt",
          before: iso(before.expiresAt),
          after: afterIso,
        };
      }
      case "password_reset": {
        const before = await this.prisma.passwordResetToken.findUnique({
          where: { id },
          select: { expiresAt: true },
        });
        if (!before)
          throw new BadRequestException(
            i18nMessage("server.admin.tokenNotFound"),
          );
        await this.prisma.passwordResetToken.update({
          where: { id },
          data: { expiresAt: target },
        });
        return {
          type,
          id,
          field: "expiresAt",
          before: iso(before.expiresAt),
          after: afterIso,
        };
      }
      default:
        throw new BadRequestException(`Bilinmeyen tip: ${type}`);
    }
  }
}

function iso(d: Date | null | undefined): string | null {
  return d ? new Date(d).toISOString() : null;
}

/** Aksiyon → hedef tarih (saf, test edilebilir). now enjekte edilebilir. */
export function computeTargetDate(
  action: AdjustAction,
  value: number,
  nowMs: number = Date.now(),
): Date {
  switch (action) {
    case "expire_now":
      return new Date(nowMs);
    case "set_minutes":
      return new Date(nowMs + Math.round(value) * 60_000);
    case "backdate_days":
      return new Date(nowMs - Math.round(value) * 86_400_000);
    default:
      throw new BadRequestException(`Bilinmeyen aksiyon: ${action}`);
  }
}

/** Takas cron'u duruma göre farklı deadline'a bakar; aktif olanı hedefle. */
export function tradeDeadlineField(
  status: string,
): "responseDeadline" | "paymentDeadline" | "shippingDeadline" {
  switch (status) {
    case "awaiting_payment":
      return "paymentDeadline";
    case "accepted":
    case "shipping_to_warehouse":
      return "shippingDeadline";
    case "pending":
    default:
      return "responseDeadline";
  }
}
