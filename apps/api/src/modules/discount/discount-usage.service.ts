import {
  BadRequestException,
  Injectable,
  Logger,
  Optional,
} from "@nestjs/common";
import { i18nMessage } from "../i18n";
import { CouponReservationStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma";
import { REFERENCE_PREFIX } from "../../common/helpers/code-prefixes";
import { generateReferenceCode } from "../../common/helpers/generate-reference";
import { automaticBudgetEntriesOf } from "./engine/fee-discount.engine";
import { FeeDiscountResolver } from "./engine/fee-discount.resolver";
import type { RestoredCoupon } from "./discount.service";

/**
 * Kupon KULLANIM defteri — DiscountService'ten birebir taşındı. Bir kuponun
 * kapasitesini ödeme beklerken REZERVE eder, ödeme tamamlanınca TÜKETİR,
 * sipariş iptal/iade olunca GERİ VERİR ya da SERBEST BIRAKIR.
 *
 * Rezerve ile tüketim bilinçli olarak ayrıdır: `reserveUsage` `usedCount`'a ve
 * DiscountUsage'a DOKUNMAZ. Ödemesi tamamlanmamış bir sipariş kuponu harcamış
 * sayılamaz, ama kapasiteyi de tutmak zorundadır — aksi halde son bir adetlik
 * kupon aynı anda iki sepette geçerli görünür ve biri ödeme sırasında patlar.
 *
 * Geri verme yönü de aynı sebeple ikiye ayrılır: iptal edilen bir rezervasyon
 * SERBEST bırakılır (hiç harcanmadı), tamamlanmış bir siparişin iadesi ise
 * kuponu GERİ VERİR (harcanmıştı, kusur alıcıda değilse hak iade edilir).
 */
/**
 * Kusursuz alıcıya iade edilen kupon, kampanya bittiyse koda özel bu kadar gün
 * daha yaşar (indirim-teknik §9).
 */
const COUPON_REISSUE_DAYS = 30;

@Injectable()
export class DiscountUsageService {
  private readonly logger = new Logger(DiscountUsageService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    private readonly feeDiscountBudget?: FeeDiscountResolver,
  ) {}

  /**
   * Check user's usage of a specific discount
   */
  async checkUsageLimit(discountId: string, userId: string): Promise<boolean> {
    const discount = await this.prisma.discount.findUnique({
      where: { id: discountId },
    });

    if (!discount || !discount.usageLimitPerUser) {
      return true;
    }

    const usageCount = await this.prisma.discountUsage.count({
      where: { discountId, userId },
    });

    return usageCount < discount.usageLimitPerUser;
  }

  /**
   * Reserve coupon capacity for a pending-payment order without consuming it.
   * `usedCount` and DiscountUsage are intentionally untouched here.
   */
  async reserveUsage(
    discountId: string,
    userId: string,
    orderId: string,
    amount: number,
    voucherCodeId: string | undefined,
    expiresAt: Date,
    client?: Prisma.TransactionClient,
  ): Promise<void> {
    const run = async (tx: Prisma.TransactionClient) => {
      await tx.$queryRaw`SELECT id FROM discounts WHERE id = ${discountId} FOR UPDATE`;

      const existing = await tx.couponReservation.findUnique({
        where: { orderId },
      });
      if (existing) {
        if (
          existing.discountId === discountId &&
          existing.status === CouponReservationStatus.active
        ) {
          return;
        }
        throw new BadRequestException(
          i18nMessage("server.discount.reservationExists"),
        );
      }

      const now = new Date();
      await tx.couponReservation.updateMany({
        where: {
          discountId,
          status: CouponReservationStatus.active,
          expiresAt: { lte: now },
        },
        data: {
          status: CouponReservationStatus.released,
          releasedAt: now,
        },
      });

      const discount = await tx.discount.findUnique({
        where: { id: discountId },
        select: {
          usedCount: true,
          usageLimitTotal: true,
          usageLimitPerUser: true,
        },
      });
      if (!discount) {
        throw new BadRequestException(
          i18nMessage("server.discount.couponNotFound"),
        );
      }

      const activeWhere = {
        discountId,
        status: CouponReservationStatus.active,
        expiresAt: { gt: now },
      };
      if (discount.usageLimitTotal) {
        const reserved = await tx.couponReservation.count({
          where: activeWhere,
        });
        if (discount.usedCount + reserved >= discount.usageLimitTotal) {
          throw new BadRequestException(
            i18nMessage("server.discount.couponLimitReached"),
          );
        }
      }

      if (discount.usageLimitPerUser) {
        const [usedByUser, reservedByUser] = await Promise.all([
          tx.discountUsage.count({ where: { discountId, userId } }),
          tx.couponReservation.count({
            where: { ...activeWhere, userId },
          }),
        ]);
        if (usedByUser + reservedByUser >= discount.usageLimitPerUser) {
          throw new BadRequestException(
            i18nMessage("server.discount.couponAlreadyUsed"),
          );
        }
      }

      if (voucherCodeId) {
        await tx.$queryRaw`SELECT id FROM discount_codes WHERE id = ${voucherCodeId} FOR UPDATE`;
        const voucher = await tx.discountCode.findUnique({
          where: { id: voucherCodeId },
          select: { isRedeemed: true },
        });
        const reservedVoucher = await tx.couponReservation.count({
          where: {
            voucherCodeId,
            status: CouponReservationStatus.active,
            expiresAt: { gt: now },
          },
        });
        if (!voucher || voucher.isRedeemed || reservedVoucher > 0) {
          throw new BadRequestException(
            i18nMessage("server.discount.couponCodeSpent"),
          );
        }
      }

      await tx.couponReservation.create({
        data: {
          discountId,
          userId,
          orderId,
          amount: new Prisma.Decimal(amount),
          voucherCodeId: voucherCodeId ?? null,
          expiresAt,
        },
      });

      // Bütçe, rezerve edilen + tüketilen toplamıdır: ödeme ekranındaki sepet de
      // kampanyanın parasını tutar, aksi halde tavan aşılabilirdi.
      await this.feeDiscountBudget?.spendBudget([{ discountId, amount }], tx);
    };

    if (client) {
      await run(client);
    } else {
      await this.prisma.$transaction(run);
    }
  }

  /**
   * Convert active reservations into real coupon usage after payment capture.
   * The status CAS makes duplicate callbacks idempotent.
   */
  async consumeReservedUsageForOrders(
    orderIds: string[],
    client?: Prisma.TransactionClient,
  ): Promise<void> {
    if (!orderIds.length) return;
    const run = async (tx: Prisma.TransactionClient) => {
      const reservations = await tx.couponReservation.findMany({
        where: {
          orderId: { in: orderIds },
          status: CouponReservationStatus.active,
        },
      });
      for (const reservation of reservations) {
        const consumed = await tx.couponReservation.updateMany({
          where: {
            id: reservation.id,
            status: CouponReservationStatus.active,
          },
          data: {
            status: CouponReservationStatus.consumed,
            consumedAt: new Date(),
          },
        });
        if (consumed.count === 0) continue;
        await this.recordUsage(
          reservation.discountId,
          reservation.userId,
          reservation.orderId,
          Number(reservation.amount),
          reservation.voucherCodeId ?? undefined,
          tx,
        );
      }
    };

    if (client) {
      await run(client);
    } else {
      await this.prisma.$transaction(run);
    }
  }

  /**
   * Kusursuz alıcıya kuponu GERİ VERİR.
   *
   * Kullanım kaydı silinmez, iptal işareti alır (denetim izi kalır) ve kotadan
   * düşer. Kampanyanın toplam sayacı ile bütçesi geri açılır. Tek-kullanımlık kod
   * yeniden kullanılabilir hale gelir; kampanya bu arada sona ermişse koda ÖZEL
   * 30 günlük bir süre tanınır (kampanyanın tarihi herkes için değişmez).
   * Paylaşımlı kodlu kampanyada süre bittiyse kullanıcıya tek-kullanımlık yeni
   * bir kod üretilir.
   */
  async revokeUsageForOrders(
    orderIds: string[],
    reason: string,
    client?: Prisma.TransactionClient,
  ): Promise<{
    revoked: number;
    reissuedCodes: string[];
    /**
     * Bildirim için: kupon hakkı geri verilen kullanıcılar ve tekrar
     * kullanabilecekleri kod. Çağıran, TRANSACTION COMMIT olduktan sonra
     * `notifyCouponReturned` ile haber verir — tx içinde bildirim atılmaz.
     */
    restoredCoupons: RestoredCoupon[];
  }> {
    // Typed: the empty arrays would otherwise infer as `never[]`, and since
    // this constant is returned first it would define the whole result shape.
    const empty: {
      revoked: number;
      reissuedCodes: string[];
      restoredCoupons: RestoredCoupon[];
    } = { revoked: 0, reissuedCodes: [], restoredCoupons: [] };
    if (!orderIds.length) return empty;

    const run = async (tx: Prisma.TransactionClient): Promise<typeof empty> => {
      const usages = await tx.discountUsage.findMany({
        where: { orderId: { in: orderIds }, revokedAt: null },
        select: {
          id: true,
          discountId: true,
          userId: true,
          orderId: true,
          amount: true,
          discount: {
            select: { id: true, code: true, endDate: true, isActive: true },
          },
        },
      });
      if (!usages.length) return empty;

      const now = new Date();
      const reissuedCodes: string[] = [];
      const restoredCoupons: RestoredCoupon[] = [];

      for (const usage of usages) {
        const marked = await tx.discountUsage.updateMany({
          where: { id: usage.id, revokedAt: null },
          data: { revokedAt: now, revokeReason: reason },
        });
        if (marked.count === 0) continue;

        // Toplam sayaç geri açılır (negatife düşmeden).
        await tx.$executeRaw`
          UPDATE discounts
          SET used_count = GREATEST(used_count - 1, 0), updated_at = NOW()
          WHERE id = ${usage.discountId}
        `;
        await this.feeDiscountBudget?.releaseBudget(
          [{ discountId: usage.discountId, amount: Number(usage.amount) }],
          tx,
        );

        const campaignOver =
          !usage.discount.isActive || now > usage.discount.endDate;
        const personalWindow = campaignOver
          ? new Date(now.getTime() + COUPON_REISSUE_DAYS * 24 * 60 * 60 * 1000)
          : null;

        // Bu siparişte harcanmış tek-kullanımlık kod varsa onu geri aç.
        const voucher = await tx.discountCode.findFirst({
          where: { discountId: usage.discountId, orderId: usage.orderId },
          select: { id: true, code: true },
        });
        if (voucher) {
          await tx.discountCode.update({
            where: { id: voucher.id },
            data: {
              isRedeemed: false,
              redeemedById: null,
              redeemedAt: null,
              orderId: null,
              ...(personalWindow ? { expiresAt: personalWindow } : {}),
            },
          });
          reissuedCodes.push(voucher.code);
          restoredCoupons.push({
            userId: usage.userId,
            code: voucher.code,
            expiresAt: personalWindow,
          });
          continue;
        }

        // Paylaşımlı kodlu kampanya bitmişse hak, kişiye özel yeni bir kodla
        // yaşatılır — aksi halde "geri verildi" dediğimiz hak kullanılamazdı.
        if (campaignOver && personalWindow) {
          const code = generateReferenceCode(REFERENCE_PREFIX.voucher);
          await tx.discountCode.create({
            data: {
              discountId: usage.discountId,
              code,
              expiresAt: personalWindow,
            },
          });
          reissuedCodes.push(code);
          restoredCoupons.push({
            userId: usage.userId,
            code,
            expiresAt: personalWindow,
          });
        } else if (usage.discount.code) {
          // Kampanya hâlâ yürürlükte: kota geri açıldı, kullanıcı paylaşılan
          // kodu yeniden kullanabilir.
          restoredCoupons.push({
            userId: usage.userId,
            code: usage.discount.code,
            expiresAt: usage.discount.endDate,
          });
        }
      }

      return { revoked: usages.length, reissuedCodes, restoredCoupons };
    };

    return client ? run(client) : this.prisma.$transaction(run);
  }

  /** Release pending-payment reservations without changing real usage. */
  async releaseReservedUsageForOrders(
    orderIds: string[],
    client?: Prisma.TransactionClient,
  ): Promise<void> {
    if (!orderIds.length) return;
    const run = async (tx: Prisma.TransactionClient) => {
      // Serbest bırakılan rezervasyonun tuttuğu bütçe kampanyaya geri döner.
      const releasing = await tx.couponReservation.findMany({
        where: {
          orderId: { in: orderIds },
          status: CouponReservationStatus.active,
        },
        select: { discountId: true, amount: true },
      });
      const result = await tx.couponReservation.updateMany({
        where: {
          orderId: { in: orderIds },
          status: CouponReservationStatus.active,
        },
        data: {
          status: CouponReservationStatus.released,
          releasedAt: new Date(),
        },
      });
      await this.feeDiscountBudget?.releaseBudget(
        releasing.map((row) => ({
          discountId: row.discountId,
          amount: Number(row.amount),
        })),
        tx,
      );
      // Kodsuz (otomatik) kampanyaların bütçesi sipariş OLUŞURKEN harcanır;
      // ödenmeyen sipariş kapanırken buradan geri döner. Sipariş başına damga
      // (feeDiscountBudgetReleasedAt) claim görevi görür: iki yol aynı siparişi
      // aynı anda kapatsa bile bütçe bir kez iade edilir.
      const withBreakdown = await tx.order.findMany({
        where: { id: { in: orderIds }, feeDiscountBudgetReleasedAt: null },
        select: { id: true, feeDiscountBreakdown: true },
      });
      for (const order of withBreakdown) {
        const entries = automaticBudgetEntriesOf(order.feeDiscountBreakdown);
        if (!entries.length) continue;
        const claimed = await tx.order.updateMany({
          where: { id: order.id, feeDiscountBudgetReleasedAt: null },
          data: { feeDiscountBudgetReleasedAt: new Date() },
        });
        if (claimed.count === 0) continue;
        await this.feeDiscountBudget?.releaseBudget(entries, tx);
      }
      return result;
    };
    if (client) {
      await run(client);
    } else {
      await this.prisma.$transaction(run);
    }
  }

  /**
   * Record discount usage after successful payment.
   *
   * INVARIANT (ödeme sonrası kupon geri kazanılmaz): coupon usage is intentionally
   * NON-REVERSIBLE. On order refund/cancellation we deliberately DO NOT
   * decrement `usedCount` nor delete the `DiscountUsage` row — the coupon stays
   * consumed. Do not add usage-restoration logic to any refund/cancel path.
   *
   * @param voucherCodeId - Tek-kullanımlık voucher kodu ise ilgili DiscountCode
   *   id'si. Verilirse kod ATOMİK olarak "kullanıldı" işaretlenir (zaten
   *   kullanılmışsa throw) → aynı voucher iki siparişte kullanılamaz.
   */
  async recordUsage(
    discountId: string,
    userId: string,
    orderId: string,
    amount: number,
    voucherCodeId?: string,
    client?: Prisma.TransactionClient,
  ): Promise<void> {
    const run = async (tx: Prisma.TransactionClient) => {
      if (voucherCodeId) {
        // Atomik tek-kullanım: yalnızca henüz kullanılmamışsa işaretle.
        const claimed = await tx.discountCode.updateMany({
          where: { id: voucherCodeId, isRedeemed: false },
          data: {
            isRedeemed: true,
            redeemedById: userId,
            redeemedAt: new Date(),
            orderId,
          },
        });
        if (claimed.count === 0) {
          throw new BadRequestException(
            i18nMessage("server.discount.couponCodeSpent"),
          );
        }
      }
      // Atomik toplam-limit koruması: usedCount artışı, limit dolmadıysa TEK
      // ifadede yapılır (column-to-column karşılaştırma Prisma where'de olmadığı
      // için raw SQL). validateCoupon ile recordUsage arasındaki yarışta iki
      // eşzamanlı sipariş limiti aşamaz — limit doluysa 0 satır etkilenir → throw.
      const updated = await tx.$executeRaw`
        UPDATE discounts
        SET used_count = used_count + 1, updated_at = NOW()
        WHERE id = ${discountId}
          AND (usage_limit_total IS NULL OR used_count < usage_limit_total)
      `;
      if (updated === 0) {
        throw new BadRequestException(
          i18nMessage("server.discount.couponLimitReached"),
        );
      }
      // Per-user limit (F4.5): the UPDATE above locked the discount row, so this
      // count-then-insert is serialized across concurrent redemptions of the SAME
      // coupon → no TOCTOU race. This is the authoritative enforcement (validateCoupon
      // only pre-checks for UX). Guests never reach here for per-user coupons — they
      // are rejected up front in validateCoupon (shared identity is unenforceable).
      const perUser = await tx.discount.findUnique({
        where: { id: discountId },
        select: { usageLimitPerUser: true },
      });
      if (perUser?.usageLimitPerUser) {
        const userUsage = await tx.discountUsage.count({
          where: { discountId, userId, revokedAt: null },
        });
        if (userUsage >= perUser.usageLimitPerUser) {
          throw new BadRequestException(
            i18nMessage("server.discount.couponAlreadyUsed"),
          );
        }
      }
      await tx.discountUsage.create({
        data: {
          discountId,
          userId,
          orderId,
          amount: new Prisma.Decimal(amount),
        },
      });
    };
    // Join the caller's transaction so usage is ATOMIC with order creation (F4.4):
    // if the order tx rolls back, the usedCount increment / voucher redeem / usage
    // row roll back too — no phantom-consumed coupon on a rolled-back checkout.
    // Standalone callers (no tx) still get their own transaction.
    if (client) {
      await run(client);
    } else {
      await this.prisma.$transaction(run);
    }

    this.logger.log(
      `Discount usage recorded: ${discountId} by ${userId} for order ${orderId}`,
    );
  }
}
