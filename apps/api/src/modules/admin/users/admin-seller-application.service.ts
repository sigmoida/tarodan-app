import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import * as crypto from "crypto";
import { PrismaService } from "../../../prisma";
import { EventService } from "../../events/event.service";
import { NotificationService } from "../../notification/notification.service";
import { NotificationType } from "../../notification/dto";
import { AdminAuditService } from "../ops/admin-audit.service";
import { StorageService } from "../../storage/storage.service";
import { RatingStatus, SellerApplicationQueryDto } from "../dto";
import {
  OrderStatus,
  Prisma,
  CorporateApplicationStatus,
  SellerDocumentType,
  SellerDocumentStatus,
} from "@prisma/client";
import { paginate } from "../../../common/list";
import { promoteUserCodeToCorporate } from "../../../common/helpers/code-prefixes";
import { outboundPackageShipping } from "../../shipping/helpers/shipping-tariff.helper";
import {
  frontendUrl as resolveFrontendUrl,
  CANONICAL_FRONTEND_URL,
} from "../../../config/app-urls";
import { i18nMessage } from "../../i18n";

/**
 * Satıcı başvurusu admin operasyonları — AdminService'in SELLER APPLICATIONS
 * bölümünden birebir taşındı. updateUserRatingStatus ve applyOrderCoupon da
 * bu banner aralığında olduğu için bölümle birlikte taşındı.
 * AdminService aynı imzalarla buraya delege eder.
 */
@Injectable()
export class AdminSellerApplicationService {
  private readonly logger = new Logger(AdminSellerApplicationService.name);

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
  async getSellerApplicationDetail(applicationId: string) {
    const application = await this.prisma.corporateApplication.findUnique({
      where: { id: applicationId },
      include: {
        user: {
          select: {
            id: true,
            adminCode: true,
            username: true,
            businessStatus: true,
            isSeller: true,
          },
        },
        documents: {
          where: { isCurrent: true },
          orderBy: { uploadedAt: "desc" },
        },
        stakeholders: { include: { documents: true } },
        events: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!application) {
      throw new NotFoundException(
        i18nMessage("server.admin.sellerApplication.notFound"),
      );
    }

    const documents = await Promise.all(
      application.documents.map(async (d) => ({
        id: d.id,
        documentType: d.documentType,
        fileName: d.fileName,
        mimeType: d.mimeType,
        status: d.status,
        reviewNote: d.reviewNote,
        appealNote: d.appealNote,
        stakeholderId: d.stakeholderId,
        version: d.version,
        reviewedAt: d.reviewedAt,
        uploadedAt: d.uploadedAt,
        url: await this.storage.getPresignedDownloadUrl(
          "documents",
          d.s3Key,
          3600,
        ),
      })),
    );

    const { documents: _documents, ...rest } = application;
    return { ...rest, documents };
  }

  // ==================== SELLER APPLICATIONS ====================

  async getSellerApplications(query: SellerApplicationQueryDto) {
    const search = query.search?.trim();
    const status = query.status as CorporateApplicationStatus | undefined;
    const sortableFields = new Set<
      keyof Prisma.CorporateApplicationOrderByWithRelationInput
    >([
      "authorizedFullName",
      "companyEmail",
      "companyLegalName",
      "companyTitle",
      "status",
      "createdAt",
    ]);
    const sortBy = sortableFields.has(
      query.sortBy as keyof Prisma.CorporateApplicationOrderByWithRelationInput,
    )
      ? (query.sortBy as keyof Prisma.CorporateApplicationOrderByWithRelationInput)
      : "createdAt";
    const sortOrder = query.sortOrder === "asc" ? "asc" : "desc";

    const where: Prisma.CorporateApplicationWhereInput = {
      status: status ?? undefined,
    };

    if (search) {
      const normalized = search.toLowerCase();
      where.OR = [
        { authorizedFullName: { contains: search, mode: "insensitive" } },
        { companyEmail: { contains: search, mode: "insensitive" } },
        { companyLegalName: { contains: search, mode: "insensitive" } },
        { companyTitle: { contains: search, mode: "insensitive" } },
        { taxId: { contains: search, mode: "insensitive" } },
      ];
      if (
        Object.values(CorporateApplicationStatus).includes(
          normalized as CorporateApplicationStatus,
        )
      )
        where.OR.push({
          status: normalized as CorporateApplicationStatus,
        });
    }

    return paginate(
      this.prisma.corporateApplication,
      {
        where,
        orderBy: { [sortBy]: sortOrder },
        select: {
          id: true,
          authorizedFullName: true,
          companyEmail: true,
          phone: true,
          companyLegalName: true,
          companyTitle: true,
          taxId: true,
          status: true,
          userId: true,
          createdAt: true,
        },
      },
      query,
    );
  }

  async approveSellerApplication(adminId: string, applicationId: string) {
    const application = await this.prisma.corporateApplication.findUnique({
      where: { id: applicationId },
    });
    if (!application)
      throw new NotFoundException(
        i18nMessage("server.admin.sellerApplication.notFound"),
      );
    if (application.status !== "submitted")
      throw new BadRequestException(
        i18nMessage("server.admin.sellerApplication.alreadyApproved"),
      );

    const invitationToken = crypto.randomBytes(32).toString("hex");
    const invitationTokenHash = crypto
      .createHash("sha256")
      .update(invitationToken)
      .digest("hex");
    const invitationExpiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
    const frontendUrl = resolveFrontendUrl(
      process.env.APP_URL || CANONICAL_FRONTEND_URL,
    );
    const invitationUrl = `${frontendUrl}/corporate/invite?token=${invitationToken}`;

    await this.prisma.corporateApplication.update({
      where: { id: applicationId },
      data: {
        status: "invited",
        preliminaryApprovedAt: new Date(),
        invitationTokenHash,
        invitationExpiresAt,
        reviewNote: null,
        events: {
          create: {
            action: "preliminary_approved",
            actorAdminId: adminId,
          },
        },
      },
    });
    await this.audit.createAuditLog(
      adminId,
      "seller_application_approve",
      "CorporateApplication",
      applicationId,
      { status: application.status },
      { status: "invited", invitationExpiresAt },
    );

    await this.notificationService.sendTemplateEmailToAddress(
      application.companyEmail,
      "seller-application-approved",
      {
        name: application.authorizedFullName,
        companyName: application.companyTitle,
        invitationUrl,
        invitationExpiresHours: 72,
      },
    );
    return {
      success: true,
      status: "invited",
      invitationExpiresAt,
    };
  }

  async rejectSellerApplication(
    adminId: string,
    applicationId: string,
    reason: string,
  ) {
    if (!reason?.trim()) {
      throw new BadRequestException("Red nedeni zorunludur");
    }
    const application = await this.prisma.corporateApplication.findUnique({
      where: { id: applicationId },
    });
    if (!application)
      throw new NotFoundException(
        i18nMessage("server.admin.sellerApplication.notFound"),
      );
    if (application.status === "rejected")
      throw new BadRequestException(
        i18nMessage("server.admin.sellerApplication.alreadyRejected"),
      );

    await this.prisma.$transaction([
      this.prisma.corporateApplication.update({
        where: { id: applicationId },
        data: {
          status: "rejected",
          reviewNote: reason.trim(),
          rejectedAt: new Date(),
          invitationTokenHash: null,
          invitationExpiresAt: null,
          events: {
            create: {
              action: "application_rejected",
              note: reason.trim(),
              actorAdminId: adminId,
            },
          },
        },
      }),
      // Aktivasyon SONRASI red: kullanıcı satırı da "rejected" olmalı. Eskiden
      // yalnız başvuru işaretleniyordu; user.businessStatus "pending"de kalıyor,
      // web guard'ı kullanıcıyı sonsuza dek /business-pending'e ("başvurunuz
      // inceleniyor") kilitliyor ve /business-rejected ekranı hiç görünmüyordu.
      ...(application.userId
        ? [
            this.prisma.user.update({
              where: { id: application.userId },
              data: { businessStatus: "rejected" as const },
            }),
          ]
        : []),
    ]);
    await this.audit.createAuditLog(
      adminId,
      "seller_application_reject",
      "CorporateApplication",
      applicationId,
      { status: application.status },
      { status: "rejected", reason },
    );

    await this.notificationService.sendTemplateEmailToAddress(
      application.companyEmail,
      "seller-application-rejected",
      {
        name: application.authorizedFullName,
        companyName: application.companyTitle,
        reason: reason.trim(),
      },
    );
    // In-app+push yalnız hesap yaratılmış başvuruda: submitted aşamasındaki
    // reddin henüz bildirilecek kullanıcısı yok. Best-effort — post-commit,
    // bildirim hatası reddi geri almaz.
    if (application.userId) {
      try {
        await this.notificationService.createInAppNotification(
          application.userId,
          NotificationType.SELLER_APPLICATION_REJECTED,
          // Şablon "...reddedildi.{reason}" — gerekçe ayrı cümle olarak eklenir.
          { reason: ` ${reason.trim()}` },
        );
      } catch (err: any) {
        this.logger.warn(
          `SELLER_APPLICATION_REJECTED bildirimi başarısız (${applicationId}): ${err?.message}`,
        );
      }
    }
    return { success: true };
  }

  async reviewSellerDocument(
    adminId: string,
    applicationId: string,
    documentId: string,
    status: SellerDocumentStatus,
    note?: string,
  ) {
    if (!["approved", "rejected", "revision_requested"].includes(status)) {
      throw new BadRequestException(
        i18nMessage("server.admin.sellerApplication.invalidDocumentDecision"),
      );
    }
    if (status !== "approved" && !note?.trim()) {
      throw new BadRequestException(
        i18nMessage("server.admin.sellerApplication.decisionNoteRequired"),
      );
    }
    const document = await this.prisma.sellerDocument.findFirst({
      where: {
        id: documentId,
        applicationId,
        isCurrent: true,
      },
      include: { application: true },
    });
    if (!document?.application) {
      throw new NotFoundException(i18nMessage("server.user.documentNotFound"));
    }

    await this.prisma.$transaction([
      this.prisma.sellerDocument.update({
        where: { id: document.id },
        data: {
          status,
          reviewNote: note?.trim() || null,
          reviewedBy: adminId,
          reviewedAt: new Date(),
          appealNote: null,
        },
      }),
      this.prisma.corporateApplicationEvent.create({
        data: {
          applicationId,
          action: `document_${status}`,
          note: note?.trim(),
          actorAdminId: adminId,
          metadata: {
            documentId,
            documentType: document.documentType,
          },
        },
      }),
    ]);

    if (status !== "approved") {
      await this.notificationService.sendTemplateEmailToAddress(
        document.application.companyEmail,
        "seller-document-revision",
        {
          name: document.application.authorizedFullName,
          documentType: document.documentType,
          reason: note,
        },
      );
    }
    return { success: true, status };
  }

  async finalApproveSellerApplication(adminId: string, applicationId: string) {
    const application = await this.prisma.corporateApplication.findUnique({
      where: { id: applicationId },
      include: {
        documents: { where: { isCurrent: true } },
        stakeholders: {
          include: {
            documents: { where: { isCurrent: true } },
          },
        },
        user: true,
      },
    });
    if (!application?.user) {
      throw new NotFoundException(
        i18nMessage("server.admin.sellerApplication.activatedAccountNotFound"),
      );
    }
    if (application.status !== "under_review") {
      throw new BadRequestException(
        i18nMessage("server.admin.sellerApplication.notSubmittedForReview"),
      );
    }
    const unresolved = application.documents.filter(
      (document) => document.status !== "approved",
    );
    const requiredCompanyDocuments = [
      "tax_plate",
      "contract",
      "signature_circular",
      "activity_certificate",
      "residence_or_invoice",
      "trade_registry_gazette",
      "bank_account_info",
    ] as const;
    const currentCompanyTypes = new Set(
      application.documents
        .filter((document) => !document.stakeholderId)
        .map((document) => document.documentType),
    );
    const missingRequired = requiredCompanyDocuments.filter(
      (type) => !currentCompanyTypes.has(type),
    );
    const stakeholdersWithoutApprovedIdentity = application.stakeholders.filter(
      (stakeholder) => {
        const approvedTypes = new Set(
          stakeholder.documents
            .filter((document) => document.status === "approved")
            .map((document) => document.documentType),
        );
        const prefix =
          stakeholder.identityType === "tckn" ? "identity" : "passport";
        return (
          !approvedTypes.has(`${prefix}_front` as SellerDocumentType) ||
          !approvedTypes.has(`${prefix}_back` as SellerDocumentType)
        );
      },
    );
    if (
      unresolved.length ||
      missingRequired.length ||
      !application.stakeholders.length ||
      stakeholdersWithoutApprovedIdentity.length
    ) {
      throw new BadRequestException(
        i18nMessage("server.admin.sellerApplication.documentsNotApproved"),
      );
    }

    const corporateCode = promoteUserCodeToCorporate(
      application.user.adminCode,
    );

    await this.prisma.$transaction([
      this.prisma.corporateApplication.update({
        where: { id: applicationId },
        data: {
          status: "approved",
          finalApprovedAt: new Date(),
          events: {
            create: {
              action: "final_approved",
              actorAdminId: adminId,
            },
          },
        },
      }),
      this.prisma.user.update({
        where: { id: application.user.id },
        data: {
          isSeller: true,
          sellerType: "verified",
          businessStatus: "approved",
          companyName: application.companyLegalName,
          taxId: application.taxId,
          companyType: application.companyType,
          // Hesap tipi bireyselden kurumsala geçtiği için kodun öneki de
          // güncellenir; numara (kalıcı kimlik) korunur: B010023 → K010023.
          ...(corporateCode ? { adminCode: corporateCode } : {}),
        },
      }),
    ]);
    await this.audit.createAuditLog(
      adminId,
      "seller_application_final_approve",
      "CorporateApplication",
      applicationId,
      { status: application.status },
      { status: "approved", userId: application.user.id },
    );
    await this.notificationService.sendTemplateEmailToAddress(
      application.companyEmail,
      "seller-application-approved",
      {
        name: application.authorizedFullName,
        companyName: application.companyTitle,
      },
    );
    // Başvurana in-app+push: hesap satışa açıldı. Best-effort — post-commit,
    // bildirim hatası onayı geri almaz.
    try {
      await this.notificationService.createInAppNotification(
        application.user.id,
        NotificationType.SELLER_APPLICATION_APPROVED,
      );
    } catch (err: any) {
      this.logger.warn(
        `SELLER_APPLICATION_APPROVED bildirimi başarısız (${applicationId}): ${err?.message}`,
      );
    }
    return { success: true, status: "approved" };
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
    if (!rating)
      throw new NotFoundException(i18nMessage("server.admin.review.notFound"));
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
      include: {
        product: true,
        package: {
          select: {
            fullShippingAmount: true,
            shippingTariffId: true,
            billableDesi: true,
            orders: {
              select: {
                id: true,
                quantity: true,
                unitPrice: true,
                discountAmount: true,
                discountBreakdown: true,
                product: { select: { price: true } },
              },
            },
          },
        },
      },
    });

    if (!order)
      throw new NotFoundException(i18nMessage("server.order.notFound"));

    // Admin kupon değişikliği YALNIZ ödemesi beklenen siparişte yapılabilir (F4.6):
    // ödenmiş siparişte totalAmount + Payment zaten tahsil edildiğinden metadata'yı
    // değiştirmek order↔payment↔group tutarsızlığı doğurur (müşteri çekilen tutar ≠
    // gösterilen indirim). Ödenmiş siparişte iade/ayarlama akışı kullanılmalıdır.
    if (order.status !== OrderStatus.pending_payment) {
      throw new BadRequestException(
        i18nMessage("server.admin.order.couponPendingPaymentOnly"),
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
      if (!discount)
        throw new BadRequestException(
          i18nMessage("server.admin.order.couponNotFound"),
        );
      if (!discount.isActive)
        throw new BadRequestException(
          i18nMessage("server.admin.order.couponInactive"),
        );
      const now = new Date();
      if (now < discount.startDate)
        throw new BadRequestException(
          i18nMessage("server.admin.order.couponNotStarted"),
        );
      if (now > discount.endDate)
        throw new BadRequestException(
          i18nMessage("server.admin.order.couponExpired"),
        );
      if (
        discount.usageLimitTotal &&
        discount.usedCount >= discount.usageLimitTotal
      ) {
        throw new BadRequestException(
          i18nMessage("server.discount.couponLimitReached"),
        );
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

    // Kupon, satıcı paketinin indirimli ürün toplamını ücretsiz-kargo eşiğinin
    // öbür tarafına taşıyabilir. Alıcı/satıcı kargo payı ayrı snapshot olmadığı için
    // admin mutasyonu burada sessizce yeni bir kargo bedeli üretemez. Siparişin
    // snapshot tarifesiyle yeni tutarı doğrula; değişiyorsa alıcıya yeni checkout
    // sözleşmesi sunulması gerekir.
    if (!order.package?.shippingTariffId) {
      throw new BadRequestException(
        i18nMessage("server.admin.order.tariffSnapshotMissing"),
      );
    }
    const shippingTariff = await this.prisma.shippingTariff.findUnique({
      where: { id: order.package.shippingTariffId },
      include: { packageTiers: true },
    });
    if (!shippingTariff) {
      throw new BadRequestException(
        i18nMessage("server.admin.order.tariffUnverifiable"),
      );
    }
    const packageSubtotalAfterCoupon = order.package.orders.reduce(
      (sum, packageOrder) => {
        const packageBreakdown =
          (packageOrder.discountBreakdown as Record<string, unknown>) ?? {};
        const packageCouponDiscount =
          packageOrder.id === order.id
            ? newCouponDiscount
            : Number(
                packageBreakdown.couponDiscount ??
                  packageOrder.discountAmount ??
                  0,
              );
        const unitPrice = Number(
          packageOrder.unitPrice ?? packageOrder.product.price,
        );
        return (
          sum +
          Math.max(
            0,
            unitPrice * (packageOrder.quantity ?? 1) - packageCouponDiscount,
          )
        );
      },
      0,
    );
    const repricedFullShipping = outboundPackageShipping(
      shippingTariff,
      packageSubtotalAfterCoupon,
      order.package.billableDesi,
    ).toNumber();
    if (
      Math.abs(
        repricedFullShipping - Number(order.package.fullShippingAmount),
      ) > 0.001
    ) {
      throw new BadRequestException(
        i18nMessage("server.admin.order.couponChangesShipping"),
      );
    }

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
