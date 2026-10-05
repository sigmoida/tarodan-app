import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { CancellationActor, type Prisma } from "@prisma/client";
import {
  adminCancelRequestProblem,
  adminOrderCancelEligibility,
  normalizeAdminCancelNote,
  type AdminCancelReasonCode,
  type AdminCancelRequestProblem,
  type AdminOrderCancelBlocker,
  type AdminOrderCancelKind,
  type AdminOrderCancelPreview,
  type AdminOrderCancelRequest,
  type AdminOrderCancelResult,
} from "@tarodan/types";
import { PrismaService } from "../../../prisma";
import { AdminAuditService } from "../ops/admin-audit.service";
import { RefundService } from "../../refund/refund.service";
import { OrderService } from "../../order/order.service";
import { NotificationService } from "../../notification/notification.service";
import { ACTIVE_REFUND_REQUEST_STATUSES } from "../../refund/helpers/refund-active-statuses";
import { adminCancelReasonText } from "../../order/helpers/admin-cancel-reason";
import { orderReservationState } from "../../order/helpers/order-reservation";
import { i18nMessage } from "../../i18n";
import { errorMessage } from "../../../common/helpers/error-message";

/**
 * Uygunluk ve kilit altındaki yeniden değerlendirmenin okuduğu sipariş yükü.
 * `cancelUnpaidOrderInTx`'in istediği alanları da taşır (kilit altında taze
 * okunan satır doğrudan çekirdeğe verilir).
 */
const CANCEL_ORDER_SELECT = {
  id: true,
  orderNumber: true,
  status: true,
  origin: true,
  offerId: true,
  buyerId: true,
  sellerId: true,
  productId: true,
  quantity: true,
  version: true,
  checkoutGroupId: true,
  reservationReleasedAt: true,
  cancellationType: true,
  cancelReason: true,
  totalAmount: true,
  shipment: { select: { status: true, shippedAt: true } },
  // Teklif siparişinin rezervi ilk ödeme başlatmada alınır (önizleme metni).
  payment: { select: { id: true } },
  refundRequests: {
    where: { status: { in: ACTIVE_REFUND_REQUEST_STATUSES } },
    select: { id: true, refundNumber: true },
    take: 1,
  },
} satisfies Prisma.OrderSelect;

type CancelOrderRow = Prisma.OrderGetPayload<{
  select: typeof CANCEL_ORDER_SELECT;
}>;

/**
 * İptalin sonucu ve bu çağrının göndermesi gereken platform duyurusu; iptali
 * başka bir yol sonlandırıp duyuruyu kendisi gönderdiyse `notice` null.
 */
interface CancelOutcome {
  result: AdminOrderCancelResult;
  notice: { refundAmount: number | null } | null;
}

/** Doğrulanmış neden: katalog kodu + (iç) not. */
interface AdminCancelReason {
  code: AdminCancelReasonCode;
  note: string | null;
}

/**
 * Engel → admin'e gösterilen hata. `handed_over`/`delivered` iade talebi
 * akışına, `pending_cancellation` yarıda kalmış iptalin talebine yönlendirir.
 */
const BLOCKER_ERRORS: Record<
  AdminOrderCancelBlocker,
  (ctx: {
    refundNumber: string | null;
  }) => BadRequestException | ConflictException
> = {
  closed: () =>
    new ConflictException(
      i18nMessage("server.admin.order.cancelAlreadyClosed"),
    ),
  active_refund: () =>
    new ConflictException(i18nMessage("server.admin.order.cancelActiveRefund")),
  // Önceki iptal denemesi talebi açtı ama para yolu yarıda kaldı (PSP hatası
  // vb.): talep İade Talepleri'nde elle tamamlanmayı bekler.
  pending_cancellation: ({ refundNumber }) =>
    new ConflictException(
      i18nMessage("server.admin.order.cancelPendingManualCompletion", {
        refundNumber: refundNumber ?? "—",
      }),
    ),
  handed_over: () =>
    new BadRequestException(
      i18nMessage("server.admin.order.cancelAfterHandover"),
    ),
  delivered: () =>
    new BadRequestException(
      i18nMessage("server.admin.order.cancelAfterDelivery"),
    ),
  completed: () =>
    new BadRequestException(
      i18nMessage("server.admin.order.cancelAfterCompletion"),
    ),
};

const REQUEST_PROBLEM_KEYS = {
  reason_missing: "server.admin.order.cancelReasonRequired",
  note_required: "server.admin.order.cancelNoteRequired",
  note_too_long: "server.admin.order.cancelNoteTooLong",
} as const satisfies Record<AdminCancelRequestProblem, string>;

function eligibilityOf(order: CancelOrderRow) {
  return adminOrderCancelEligibility({
    status: order.status,
    shipment: order.shipment,
    hasActiveRefund: order.refundRequests.length > 0,
  });
}

/** Uygun değilse engelin hatası; uygunsa türü. */
function cancellableKind(order: CancelOrderRow): AdminOrderCancelKind {
  const eligibility = eligibilityOf(order);
  if (!eligibility.allowed) {
    throw BLOCKER_ERRORS[eligibility.blocker]({
      refundNumber: order.refundRequests[0]?.refundNumber ?? null,
    });
  }
  return eligibility.kind;
}

/**
 * Önizlemedeki tür ile şimdiki tür aynı olmalı: sipariş arada ödendiyse
 * "para yok" onayı SESSİZCE "iade"ye dönüşmez — panel 409'u gösterir ve
 * önizlemeyi tazeler.
 */
function assertExpectedKind(
  expected: AdminOrderCancelKind,
  actual: AdminOrderCancelKind,
): void {
  if (expected !== actual) {
    throw new ConflictException(
      i18nMessage("server.admin.order.cancelKindChanged"),
    );
  }
}

/** Denetimin "önce" görüntüsü — taraflar dahil. */
function auditBefore(order: CancelOrderRow) {
  return {
    status: order.status,
    origin: order.origin,
    offerId: order.offerId,
    cancellationType: order.cancellationType,
    cancelReason: order.cancelReason,
    shipmentStatus: order.shipment?.status ?? null,
    checkoutGroupId: order.checkoutGroupId,
    totalAmount: Number(order.totalAmount),
    buyerId: order.buyerId,
    sellerId: order.sellerId,
  };
}

/**
 * Admin "Siparişi iptal et" — sipariş (sepet kalemi) başına platform iptali.
 * Uygunluk panelle ORTAK kuraldır (`adminOrderCancelEligibility`); para,
 * stok, kupon, defter, fatura ve kargo mantığı burada YOKTUR, türün mevcut
 * çekirdeği çalışır:
 * - `unpaid` → OrderService.cancelUnpaidOrderInTx (alıcı iptaliyle aynı),
 * - `paid_pre_handover` → RefundService.createPlatformCancellationRefund
 *   (alıcı iptaliyle aynı para yolu).
 * Teklif siparişi aynı yoldan geçer; bağlı teklifi çekirdekler kapatır.
 *
 * Burada yaşayanlar: istek doğrulaması, kilit altındaki yeniden
 * değerlendirme (tür değişti mi?), zorunlu denetim kaydı, başarısız denemenin
 * kaydı ve iki tarafa TEK platform duyurusu.
 *
 * Denetim ↔ para atomikliği:
 * - `unpaid`: iptal ve denetim AYNI işlemdedir (fail-closed: denetim
 *   yazılamazsa iptal geri alınır).
 * - `paid_pre_handover`: para yolu dış PSP çağrısı içerir, tek işleme
 *   sığmaz. Kapı ZORUNLU niyet kaydıdır (`order_cancel_requested`):
 *   yazılamazsa çekirdek hiç çağrılmaz. Para çıktıktan sonra tamamlanma kaydı
 *   (`order_cancel`) yazılamazsa iptal geri alınamaz; hata loglanır, iz niyet
 *   kaydı + iade talebinde (`decidedBy` = yönetici) kalır.
 */
@Injectable()
export class AdminOrderCancelService {
  private readonly logger = new Logger(AdminOrderCancelService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
    private readonly refundService: RefundService,
    private readonly orderService: OrderService,
    private readonly notificationService: NotificationService,
  ) {}

  async previewCancel(orderId: string): Promise<AdminOrderCancelPreview> {
    const order = await this.loadOrder(orderId);
    const kind = cancellableKind(order);
    const quantity = order.quantity ?? 1;
    if (kind === "unpaid") {
      // Çekirdekle AYNI kural: ödemesi başlatılmamış teklif siparişi rezerv
      // tutmaz, "serbest kalacak" denmez.
      return {
        kind,
        quantity,
        reservation: orderReservationState({
          reservationReleasedAt: order.reservationReleasedAt,
          offerId: order.offerId,
          hasPayment: order.payment !== null,
        }),
      };
    }
    const money =
      await this.refundService.previewPlatformCancellationRefund(orderId);
    return { kind, quantity, ...money };
  }

  async cancelOrder(
    adminId: string,
    orderId: string,
    request: AdminOrderCancelRequest,
  ): Promise<AdminOrderCancelResult> {
    const reason = this.validReason(request);
    const order = await this.loadOrder(orderId);

    let outcome: CancelOutcome;
    try {
      const kind = cancellableKind(order);
      assertExpectedKind(request.expectedKind, kind);
      outcome =
        kind === "unpaid"
          ? await this.cancelUnpaid(adminId, order, reason)
          : await this.cancelPaid(adminId, order, reason);
    } catch (error: unknown) {
      // Engellenen, yarışı kaybeden ya da PSP'de düşen deneme de denetim
      // izine girer. Best-effort — asıl hata maskelenmez.
      await this.audit.createAuditLog(
        adminId,
        "order_cancel_failed",
        "Order",
        orderId,
        auditBefore(order),
        {
          expectedKind: request.expectedKind,
          reasonCode: reason.code,
          note: reason.note,
          error: errorMessage(error),
        },
      );
      throw error;
    }

    // Stok/rezervasyon çekirdekte serbest kaldı; ürün sayfası tazelensin.
    await this.orderService
      .invalidateProductCaches(order.productId)
      .catch((error: unknown) =>
        this.logger.warn(
          `order ${orderId} admin-cancel cache invalidation failed: ${errorMessage(error)}`,
        ),
      );
    // İki tarafa TEK duyuru (zil + e-posta) — çekirdekler bu iptalde
    // kendi duyurularını göndermez. Not bu çağrıya hiç verilmez. Duyuru
    // yoksa iptali başka bir yol (takılı deneme kurtarması) sonlandırdı ve
    // duyuruyu o gönderdi.
    if (outcome.notice) {
      await this.notificationService
        .notifyOrderCancelledByPlatform({
          orderId,
          reasonCode: reason.code,
          refundAmount: outcome.notice.refundAmount,
        })
        .catch((error: unknown) =>
          this.logger.warn(
            `order ${orderId} admin-cancel notice failed: ${errorMessage(error)}`,
          ),
        );
    }

    return outcome.result;
  }

  /**
   * Ödenmemiş sipariş: kilit altında yeniden değerlendirilir, ortak çekirdek
   * çalışır, denetim AYNI işlemde yazılır. Para hareketi yoktur.
   */
  private async cancelUnpaid(
    adminId: string,
    order: CancelOrderRow,
    reason: AdminCancelReason,
  ): Promise<CancelOutcome> {
    const visibleReason = adminCancelReasonText(reason.code);
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${order.id} FOR UPDATE`;
      const fresh = await tx.order.findUnique({
        where: { id: order.id },
        select: CANCEL_ORDER_SELECT,
      });
      if (!fresh) {
        throw new NotFoundException(i18nMessage("server.order.notFound"));
      }
      // Ön okumadan bu yana: alıcı iptal ettiyse / süpürme kapattıysa →
      // closed; ödeme callback'i tamamladıysa → tür değişti (409).
      assertExpectedKind("unpaid", cancellableKind(fresh));
      // Canlı çekim varsa çekirdek 409 `cancelPaymentInFlight` ile reddeder
      // (alıcı iptaliyle aynı kontrol, bu satır kilidi altında).
      await this.orderService.cancelUnpaidOrderInTx(tx, fresh, {
        reason: visibleReason,
        ledgerReason: "admin_cancelled",
        adminReasonCode: reason.code,
        ...(fresh.offerId ? { offerCancelReason: visibleReason } : {}),
      });
      await this.audit.createRequiredAuditLog(
        adminId,
        "order_cancel",
        "Order",
        fresh.id,
        auditBefore(fresh),
        this.auditAfter("unpaid", reason, fresh),
        tx,
      );
    });
    return {
      result: { orderId: order.id, kind: "unpaid" },
      // İptal bu işlemde kesinleşti: duyuru bu çağrınındır.
      notice: { refundAmount: null },
    };
  }

  /**
   * Kargo öncesi ödenmiş sipariş: zorunlu niyet kaydı → ortak para çekirdeği
   * (satır kilidi, kilit altında yeniden doğrulama, aktif-talep tekil indeksi,
   * talep-bazlı idempotency anahtarı orada) → tamamlanma kaydı.
   */
  private async cancelPaid(
    adminId: string,
    order: CancelOrderRow,
    reason: AdminCancelReason,
  ): Promise<CancelOutcome> {
    const before = auditBefore(order);
    // Fail-closed kapı: yazılamazsa para yoluna hiç girilmez.
    await this.audit.createRequiredAuditLog(
      adminId,
      "order_cancel_requested",
      "Order",
      order.id,
      before,
      {
        kind: "paid_pre_handover",
        reasonCode: reason.code,
        note: reason.note,
        buyerId: order.buyerId,
        sellerId: order.sellerId,
      },
    );

    const refund = await this.refundService.createPlatformCancellationRefund(
      order.id,
      adminId,
      reason.code,
    );
    const refundAmount = Number(refund.amount);

    await this.audit
      .createRequiredAuditLog(
        adminId,
        "order_cancel",
        "Order",
        order.id,
        before,
        {
          ...this.auditAfter("paid_pre_handover", reason, order),
          refundRequestId: refund.id,
          refundNumber: refund.refundNumber,
          refundAmount,
          refundStatus: refund.status,
        },
      )
      .catch((error: unknown) =>
        // Para çıktı; iptal geri alınamaz. Niyet kaydı + iade talebi izi
        // taşır — bu satır alarm içindir.
        this.logger.error(
          `order ${order.id} admin-cancel completed (refund ${refund.refundNumber}) but its audit entry failed: ${errorMessage(error)}`,
        ),
      );

    return {
      result: {
        orderId: order.id,
        kind: "paid_pre_handover",
        refundRequestId: refund.id,
        refundNumber: refund.refundNumber,
        refundAmount,
      },
      // Duyuru YALNIZ bu çağrının iadesi siparişi platform iptali olarak
      // kapattıysa: aynı denemeyi takılı deneme kurtarması önce
      // sonlandırdıysa iptali ve duyuruyu o yaptı (çift mesaj olmaz).
      notice: refund.closedWithAdminReason ? { refundAmount } : null,
    };
  }

  private auditAfter(
    kind: AdminOrderCancelKind,
    reason: AdminCancelReason,
    order: CancelOrderRow,
  ) {
    return {
      kind,
      status: "cancelled",
      cancelledBy: CancellationActor.platform,
      cancellationType: "iptal",
      reasonCode: reason.code,
      note: reason.note,
      buyerId: order.buyerId,
      sellerId: order.sellerId,
      offerId: order.offerId,
    };
  }

  private validReason(request: AdminOrderCancelRequest): AdminCancelReason {
    const problem = adminCancelRequestProblem(request);
    if (problem) {
      throw new BadRequestException(i18nMessage(REQUEST_PROBLEM_KEYS[problem]));
    }
    return {
      code: request.reasonCode,
      note: normalizeAdminCancelNote(request.note),
    };
  }

  private async loadOrder(orderId: string): Promise<CancelOrderRow> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: CANCEL_ORDER_SELECT,
    });
    if (!order) {
      throw new NotFoundException(i18nMessage("server.order.notFound"));
    }
    return order;
  }
}
