import { Injectable, Logger } from "@nestjs/common";
import { AdminRole } from "@prisma/client";
import { PrismaService } from "../../prisma";
import { NotificationService } from "../notification/notification.service";
import { StorageService } from "../storage/storage.service";
import {
  PUBLIC_NAME_SELECT,
  publicName,
  toPublicIdentity,
} from "../../common/helpers/public-identity";
import { NotificationType } from "../notification/dto";
import { adminUrl } from "../../config/app-urls";

/**
 * Refund notifications, e-mails and history entries.
 *
 * Split out of `RefundService`, which had grown past 3000 lines by holding the
 * refund rules and the telling-people-about-them together. None of this decides
 * anything: it records what happened and delivers it. Keeping it apart means a
 * change to how a seller is notified cannot touch how a refund is calculated.
 *
 * Every method here is best-effort by design — a failed notification must never
 * fail the refund that triggered it, so they log and return instead of throwing.
 */
@Injectable()
export class RefundNotificationService {
  private readonly logger = new Logger(RefundNotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
    private readonly storageService: StorageService,
  ) {}

  /**
   * Refund yanıtlarında ürün resimlerini ham ProductImage kaydı yerine
   * herkesin doğrudan <img src> olarak kullanabileceği public URL dizisine
   * çevirir. Web/mobil/admin tüm iade ekranları bu şekli bekliyor.
   */
  toProductImageUrls(images: unknown): string[] {
    if (!Array.isArray(images)) return [];
    return images
      .map((img: any) =>
        img?.cardKey ? this.storageService.getPublicAssetUrl(img.cardKey) : "",
      )
      .filter(Boolean);
  }

  /**
   * İade yanıtı iki tarafa da açıktır (alıcı ↔ satıcı): kullanıcı satırları
   * herkese açık kimliğe indirgenir, ürün görselleri public URL'e çevrilir.
   */
  withResolvedImages<T extends Record<string, any>>(rr: T): T {
    const product = rr?.order?.product;
    if (product?.images) {
      product.images = this.toProductImageUrls(product.images);
    }
    if (rr?.order?.buyer) rr.order.buyer = toPublicIdentity(rr.order.buyer);
    if (rr?.order?.seller) rr.order.seller = toPublicIdentity(rr.order.seller);
    if (rr?.requester) (rr as any).requester = toPublicIdentity(rr.requester);
    return rr;
  }

  /**
   * Append a transition entry to RefundRequest.metadata.history. Used as a
   * lightweight audit trail for buyer/seller actions (AuditLog requires an
   * AdminUser FK and isn't applicable here).
   */
  async appendHistory(
    refundRequestId: string,
    entry: { action: string; by: string; details?: Record<string, any> },
  ): Promise<void> {
    const current = await this.prisma.refundRequest.findUnique({
      where: { id: refundRequestId },
      select: { metadata: true },
    });
    const meta = (current?.metadata as Record<string, any>) || {};
    const history = Array.isArray(meta.history) ? meta.history : [];
    history.push({ ...entry, at: new Date().toISOString() });
    await this.prisma.refundRequest.update({
      where: { id: refundRequestId },
      data: { metadata: { ...meta, history } },
    });
  }

  /**
   * Best-effort notification dispatch — failures are logged, never thrown.
   * createInAppNotification artık in_app + canlı websocket + PUSH'u birlikte
   * yapıyor (notification.service), o yüzden burada tek çağrı yeterli.
   * Email ayrı: markalı şablonlar için sendRefundEmail kullanılır.
   */
  async safeNotify(
    userId: string,
    type: NotificationType,
    data?: Record<string, any>,
  ): Promise<void> {
    try {
      await this.notificationService.createInAppNotification(
        userId,
        type,
        data,
      );
    } catch (err: any) {
      this.logger.error(
        `Notification ${type} → ${userId} failed: ${err?.message}`,
      );
    }
  }

  /**
   * Yeni ve kalıcı bir iade talebini satıcıya bildirir. Yönetici incelemesi
   * gerekiyorsa yalnız iade kararı verebilen aktif admin/super-admin hesaplarına
   * ayrıca operasyon uyarısı gönderir. Bildirim arızaları ticaret akışını bozmaz.
   */
  async notifyRefundRequestOpened(input: {
    refundRequestId: string;
    refundNumber: string;
    orderId: string;
    sellerId: string;
    reason: string;
    requiresAdminReview: boolean;
  }): Promise<void> {
    await this.safeNotify(
      input.sellerId,
      NotificationType.REFUND_REQUEST_RECEIVED_SELLER,
      {
        refundNumber: input.refundNumber,
        orderId: input.orderId,
      },
    );
    await this.sendRefundEmail(
      input.refundRequestId,
      "seller",
      "refund-requested-seller",
      { refundNumber: input.refundNumber, refundReason: input.reason },
    );

    if (!input.requiresAdminReview) return;

    try {
      const admins = await this.prisma.adminUser.findMany({
        where: {
          isActive: true,
          role: { in: [AdminRole.super_admin, AdminRole.admin] },
        },
        select: { userId: true },
      });
      const adminBaseUrl = adminUrl();
      const adminLink = `${adminBaseUrl}/operations/refund-requests/${encodeURIComponent(input.refundRequestId)}`;

      for (const admin of admins) {
        await this.safeNotify(
          admin.userId,
          NotificationType.REFUND_REVIEW_REQUIRED_ADMIN,
          {
            refundRequestId: input.refundRequestId,
            refundNumber: input.refundNumber,
            orderId: input.orderId,
            adminLink,
          },
        );
      }
    } catch (error: any) {
      this.logger.error(
        `Refund review admin notifications failed for ${input.refundNumber}: ${error?.message}`,
      );
    }
  }

  /**
   * İade akışı e-postaları. refundRequestId'den order/ürün/taraf bilgilerini
   * tazeden çeker ve ilgili tarafa (alıcı veya satıcı) markalı şablonu gönderir.
   * Asla throw etmez; in-app bildirimlerin yanında çalışır.
   */
  async sendRefundEmail(
    refundRequestId: string,
    recipient: "buyer" | "seller",
    templateKey: string,
    extra?: Record<string, any>,
  ): Promise<void> {
    try {
      const rr = await this.prisma.refundRequest.findUnique({
        where: { id: refundRequestId },
        select: {
          amount: true,
          orderId: true,
          requesterId: true,
          order: {
            select: {
              orderNumber: true,
              sellerId: true,
              buyer: { select: PUBLIC_NAME_SELECT },
              seller: { select: PUBLIC_NAME_SELECT },
              product: { select: { title: true } },
            },
          },
        },
      });
      if (!rr) return;
      const recipientId =
        recipient === "buyer" ? rr.requesterId : rr.order?.sellerId;
      if (!recipientId) return;
      await this.notificationService.sendTemplateEmailToUser(
        recipientId,
        templateKey,
        {
          buyerName: publicName(rr.order?.buyer),
          sellerName: publicName(rr.order?.seller),
          orderNumber: rr.order?.orderNumber,
          orderId: rr.orderId,
          productTitle: rr.order?.product?.title ?? "",
          refundAmount: Number(rr.amount),
          ...extra,
        },
      );
    } catch (err: any) {
      this.logger.error(
        `Refund email ${templateKey} failed for ${refundRequestId}: ${err?.message}`,
      );
    }
  }
}
