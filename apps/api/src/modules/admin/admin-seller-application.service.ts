import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { EventService } from "../events/event.service";
import { NotificationService } from "../notification/notification.service";
import {
  NotificationType,
  NotificationChannel,
} from "../notification/dto/notification.dto";
import { AdminAuditService } from "./admin-audit.service";
import { StorageService } from "../storage/storage.service";
import { RatingStatus, SellerApplicationQueryDto } from "./dto";
import { OrderStatus, Prisma, BusinessStatus } from "@prisma/client";
import { paginate, resolveOrderBy } from "../../common/list";

/**
 * Satıcı başvurusu admin operasyonları — AdminService'in SELLER APPLICATIONS
 * bölümünden birebir taşındı. updateUserRatingStatus ve applyOrderCoupon da
 * bu banner aralığında olduğu için bölümle birlikte taşındı.
 * AdminService aynı imzalarla buraya delege eder.
 */
@Injectable()
export class AdminSellerApplicationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventService: EventService,
    private readonly notificationService: NotificationService,
    private readonly audit: AdminAuditService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Full application detail for review: company info, bank/IBAN, and the uploaded
   * documents with short-lived presigned URLs (private `documents` bucket).
   */
  async getSellerApplicationDetail(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        displayName: true,
        email: true,
        phone: true,
        companyName: true,
        taxId: true,
        companyType: true,
        taxOffice: true,
        companyCity: true,
        companyDistrict: true,
        businessStatus: true,
        isSeller: true,
        createdAt: true,
        bankAccount: {
          select: {
            accountHolder: true,
            iban: true,
            tcKimlikNo: true,
            taxId: true,
            isVerified: true,
          },
        },
        sellerDocuments: true,
      },
    });
    if (!user || !user.companyName) {
      throw new NotFoundException("Başvuru bulunamadı");
    }

    const documents = await Promise.all(
      (user.sellerDocuments ?? []).map(async (d) => ({
        documentType: d.documentType,
        fileName: d.fileName,
        mimeType: d.mimeType,
        status: d.status,
        uploadedAt: d.uploadedAt,
        url: await this.storage.getPresignedDownloadUrl(
          "documents",
          d.s3Key,
          3600,
        ),
      })),
    );

    const { sellerDocuments, ...rest } = user;
    return { ...rest, documents };
  }

  // ==================== SELLER APPLICATIONS ====================

  async getSellerApplications(query: SellerApplicationQueryDto) {
    const search = query.search?.trim();
    const status = query.status as BusinessStatus | undefined;

    const where: Prisma.UserWhereInput = {
      companyName: { not: null },
      businessStatus: status ?? undefined,
    };

    if (search) {
      const normalized = search.toLowerCase();
      where.OR = [
        { displayName: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { companyName: { contains: search, mode: "insensitive" } },
        { taxId: { contains: search, mode: "insensitive" } },
      ];
      if (Object.values(BusinessStatus).includes(normalized as BusinessStatus))
        where.OR.push({ businessStatus: normalized as BusinessStatus });
    }

    const orderBy = resolveOrderBy<Prisma.UserOrderByWithRelationInput>(
      "User",
      query,
      {
        defaultSort: { createdAt: "desc" },
      },
    );

    return paginate(
      this.prisma.user,
      {
        where,
        orderBy,
        select: {
          id: true,
          displayName: true,
          email: true,
          phone: true,
          companyName: true,
          taxId: true,
          businessStatus: true,
          isSeller: true,
          createdAt: true,
        },
      },
      query,
    );
  }

  async approveSellerApplication(adminId: string, userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("Kullanıcı bulunamadı");
    if (!user.companyName)
      throw new BadRequestException("Bu kullanıcı kurumsal hesap değil");
    if (user.businessStatus === BusinessStatus.approved)
      throw new BadRequestException("Bu başvuru zaten onaylanmış");

    const previous = {
      businessStatus: user.businessStatus,
      isSeller: user.isSeller,
    };
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        businessStatus: BusinessStatus.approved,
        isSeller: true,
        sellerType: "individual",
      },
    });
    await this.audit.createAuditLog(
      adminId,
      "seller_application_approve",
      "User",
      userId,
      previous,
      { businessStatus: "approved", isSeller: true },
    );

    // In-app + push bildirimi
    await this.notificationService.send({
      userId,
      type: NotificationType.SELLER_APPLICATION_APPROVED,
      channels: [NotificationChannel.IN_APP, NotificationChannel.PUSH],
      data: {},
    });
    // E-posta template sistemi üzerinden (admin panelinden özelleştirilebilir)
    await this.eventService.queueEmail({
      to: user.email,
      subject: "",
      template: "seller-application-approved",
      templateData: {
        name: user.displayName || user.email,
        companyName: user.companyName || "",
      },
    });
    return { success: true };
  }

  async rejectSellerApplication(
    adminId: string,
    userId: string,
    reason: string,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("Kullanıcı bulunamadı");
    if (!user.companyName)
      throw new BadRequestException("Bu kullanıcı kurumsal hesap değil");
    if (user.businessStatus === BusinessStatus.rejected)
      throw new BadRequestException("Bu başvuru zaten reddedilmiş");

    const previous = { businessStatus: user.businessStatus };
    await this.prisma.user.update({
      where: { id: userId },
      data: { businessStatus: BusinessStatus.rejected, isSeller: false },
    });
    await this.audit.createAuditLog(
      adminId,
      "seller_application_reject",
      "User",
      userId,
      previous,
      { businessStatus: "rejected", reason },
    );

    // In-app + push bildirimi
    await this.notificationService.send({
      userId,
      type: NotificationType.SELLER_APPLICATION_REJECTED,
      channels: [NotificationChannel.IN_APP, NotificationChannel.PUSH],
      data: { reason: reason ? ` Neden: ${reason}` : "" },
    });
    // E-posta template sistemi üzerinden (admin panelinden özelleştirilebilir)
    await this.eventService.queueEmail({
      to: user.email,
      subject: "",
      template: "seller-application-rejected",
      templateData: {
        name: user.displayName || user.email,
        companyName: user.companyName || "",
        reason: reason || "",
      },
    });
    return { success: true };
  }

  /**
   * Update seller (user) rating status (approve/reject)
   */
  async updateUserRatingStatus(
    adminId: string,
    ratingId: string,
    status: RatingStatus,
  ) {
    const rating = await this.prisma.rating.findUnique({
      where: { id: ratingId },
    });
    if (!rating) throw new NotFoundException("Kullanıcı yorumu bulunamadı");
    const previous = { ...rating };
    await this.prisma.rating.update({
      where: { id: ratingId },
      data: { status },
    });
    await this.audit.createAuditLog(
      adminId,
      "user_rating_status_update",
      "Rating",
      ratingId,
      previous,
      { status },
    );
    return { success: true };
  }

  async applyOrderCoupon(
    orderId: string,
    adminId: string,
    code: string | null,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { product: true },
    });

    if (!order) throw new NotFoundException("Sipariş bulunamadı");

    // Admin kupon değişikliği YALNIZ ödemesi beklenen siparişte yapılabilir (F4.6):
    // ödenmiş siparişte totalAmount + Payment zaten tahsil edildiğinden metadata'yı
    // değiştirmek order↔payment↔group tutarsızlığı doğurur (müşteri çekilen tutar ≠
    // gösterilen indirim). Ödenmiş siparişte iade/ayarlama akışı kullanılmalıdır.
    if (order.status !== OrderStatus.pending_payment) {
      throw new BadRequestException(
        "Kupon yalnızca ödemesi beklenen siparişlerde değiştirilebilir",
      );
    }

    // Kupon değişiminde ürün (indirim/sale) payı KORUNUR; yalnız kupon payı değişir.
    // Eski hata: kaldırmada tüm discountAmount (ürün indirimi dahil) geri eklenip
    // tutar fazla yükseliyordu. totalAmount yalnız couponDiscount kadar düşürülmüştü.
    const breakdown =
      (order.discountBreakdown as Record<string, unknown>) ?? {};
    const productDiscount = Number(breakdown.productDiscount ?? 0);
    const oldCouponDiscount = Number(
      breakdown.couponDiscount ?? order.discountAmount ?? 0,
    );
    // Kupon yokken toplam = mevcut toplam + eski kupon payı (ürün indirimi ürün
    // fiyatına zaten gömülü, geri eklenmez).
    const baseTotal = Number(order.totalAmount) + oldCouponDiscount;
    const quantity = order.quantity ?? 1;
    const lineSubtotal = Number(order.product.price) * quantity;

    let newCouponDiscount = 0;
    let discountCode: string | null = null;
    let appliedDiscountId: string | undefined;
    let discountName: string | undefined;

    if (code) {
      const discount = await this.prisma.discount.findUnique({
        where: { code: code.toUpperCase() },
      });
      if (!discount) throw new BadRequestException("Kupon kodu bulunamadı");
      if (!discount.isActive)
        throw new BadRequestException("Bu kupon aktif değil");
      const now = new Date();
      if (now < discount.startDate)
        throw new BadRequestException("Bu kupon henüz başlamadı");
      if (now > discount.endDate)
        throw new BadRequestException("Bu kuponun süresi doldu");
      if (
        discount.usageLimitTotal &&
        discount.usedCount >= discount.usageLimitTotal
      ) {
        throw new BadRequestException("Bu kupon kullanım limitine ulaştı");
      }

      // Kupon payı: satır toplamına (fiyat × adet) capli — birim fiyata değil (adet
      // yoksayımı düzeltildi). fixed_amount tek seferde ve eligible-subtotal ile capli.
      if (discount.type === "percentage") {
        newCouponDiscount = lineSubtotal * (Number(discount.value) / 100);
      } else if (discount.type === "fixed_amount") {
        newCouponDiscount = Math.min(Number(discount.value), lineSubtotal);
      }
      if (discount.maxDiscountAmount) {
        newCouponDiscount = Math.min(
          newCouponDiscount,
          Number(discount.maxDiscountAmount),
        );
      }
      discountCode = discount.code;
      appliedDiscountId = discount.id;
      discountName = discount.name;
    }

    const newTotal = Math.max(0, baseTotal - newCouponDiscount);
    const newDiscountAmount = productDiscount + newCouponDiscount;

    const previous = {
      discountCode: order.discountCode,
      discountAmount: order.discountAmount,
      totalAmount: order.totalAmount,
    };

    // Sipariş + grup toplamını ATOMİK güncelle — grup toplamı üyelerin totalAmount
    // toplamıdır; senkronsuz kalırsa PayTR yanlış tutarla başlatılır.
    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data: {
          discountCode,
          discountAmount: new Prisma.Decimal(newDiscountAmount),
          discountBreakdown:
            newDiscountAmount > 0
              ? ({
                  productDiscount,
                  couponDiscount: newCouponDiscount,
                  ...(appliedDiscountId ? { appliedDiscountId } : {}),
                } as Prisma.InputJsonValue)
              : Prisma.JsonNull,
          totalAmount: new Prisma.Decimal(newTotal),
        },
      });
      if (order.checkoutGroupId) {
        const agg = await tx.order.aggregate({
          where: { checkoutGroupId: order.checkoutGroupId },
          _sum: { totalAmount: true },
        });
        await tx.checkoutGroup.update({
          where: { id: order.checkoutGroupId },
          data: {
            totalAmount: agg._sum.totalAmount ?? new Prisma.Decimal(newTotal),
          },
        });
      }
    });

    await this.audit.createAuditLog(
      adminId,
      code ? "order_coupon_applied" : "order_coupon_removed",
      "Order",
      orderId,
      previous,
      { discountCode, discountAmount: newCouponDiscount },
    );
    return {
      success: true,
      discountCode,
      discountAmount: newCouponDiscount,
      discountName,
    };
  }
}
