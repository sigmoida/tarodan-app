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

    // Kuponu kaldırma
    if (!code) {
      const previous = {
        discountCode: order.discountCode,
        discountAmount: order.discountAmount,
      };
      const baseTotal =
        Number(order.totalAmount) + Number(order.discountAmount ?? 0);
      await this.prisma.order.update({
        where: { id: orderId },
        data: {
          discountCode: null,
          discountAmount: new Prisma.Decimal(0),
          discountBreakdown: Prisma.JsonNull,
          ...(order.status === OrderStatus.pending_payment
            ? { totalAmount: new Prisma.Decimal(baseTotal) }
            : {}),
        },
      });
      await this.audit.createAuditLog(
        adminId,
        "order_coupon_removed",
        "Order",
        orderId,
        previous,
        { discountCode: null },
      );
      return { success: true, discountCode: null, discountAmount: 0 };
    }

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

    const productPrice = Number(order.product.price);
    const baseTotal =
      Number(order.totalAmount) + Number(order.discountAmount ?? 0);
    const subtotal = productPrice;

    let discountAmount = 0;
    if (discount.type === "percentage") {
      discountAmount = subtotal * (Number(discount.value) / 100);
    } else if (discount.type === "fixed_amount") {
      discountAmount = Math.min(Number(discount.value), subtotal);
    }

    if (discount.maxDiscountAmount) {
      discountAmount = Math.min(
        discountAmount,
        Number(discount.maxDiscountAmount),
      );
    }

    const newTotal = Math.max(0, baseTotal - discountAmount);

    const previous = {
      discountCode: order.discountCode,
      discountAmount: order.discountAmount,
      totalAmount: order.totalAmount,
    };
    await this.prisma.order.update({
      where: { id: orderId },
      data: {
        discountCode: discount.code,
        discountAmount: new Prisma.Decimal(discountAmount),
        discountBreakdown: {
          couponDiscount: discountAmount,
          appliedDiscountId: discount.id,
        } as any,
        ...(order.status === OrderStatus.pending_payment
          ? { totalAmount: new Prisma.Decimal(newTotal) }
          : {}),
      },
    });

    await this.audit.createAuditLog(
      adminId,
      "order_coupon_applied",
      "Order",
      orderId,
      previous,
      { discountCode: discount.code, discountAmount },
    );
    return {
      success: true,
      discountCode: discount.code,
      discountAmount,
      discountName: discount.name,
    };
  }
}
