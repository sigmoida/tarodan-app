import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import { SellerDocumentType } from "@prisma/client";
import { PrismaService } from "../../../prisma";
import { StorageService } from "../../storage/storage.service";
import {
  CreateCorporateStakeholderDto,
  UpdateCorporateApplicationDto,
} from "../dto";
import { i18nMessage } from "../../i18n";

/** All corporate-seller document slots, in display order. */
export const SELLER_DOCUMENT_TYPES: SellerDocumentType[] = [
  SellerDocumentType.tax_plate,
  SellerDocumentType.contract,
  SellerDocumentType.signature_circular,
  SellerDocumentType.activity_certificate,
  SellerDocumentType.identity_front,
  SellerDocumentType.identity_back,
  SellerDocumentType.passport_front,
  SellerDocumentType.passport_back,
  SellerDocumentType.residence_or_invoice,
  SellerDocumentType.trade_registry_gazette,
  SellerDocumentType.bank_account_info,
];

const ALLOWED_MIME = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB (documents bucket cap)

/**
 * Kurumsal satıcı başvuru belgeleri: private `documents` bucket'a yükleme +
 * kullanıcının kendi belgelerini presigned URL ile listelemesi. Her belge tipi
 * için tek güncel kayıt; yeniden yükleme eski sürümü denetim geçmişinde tutar.
 */
@Injectable()
export class SellerDocumentService {
  private readonly logger = new Logger(SellerDocumentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  private async assertBusinessApplicant(userId: string) {
    const application = await this.prisma.corporateApplication.findUnique({
      where: { userId },
    });
    if (!application) {
      throw new ForbiddenException(
        i18nMessage("server.user.corporateApplicantsOnly"),
      );
    }
    if (!["completing", "under_review"].includes(application.status)) {
      throw new ForbiddenException(
        i18nMessage("server.user.applicationLocked"),
      );
    }
    return application;
  }

  async uploadDocument(
    userId: string,
    documentType: SellerDocumentType,
    stakeholderId: string | undefined,
    file: Express.Multer.File | undefined,
  ) {
    if (!SELLER_DOCUMENT_TYPES.includes(documentType)) {
      throw new BadRequestException(
        i18nMessage("server.user.invalidDocumentType"),
      );
    }
    if (!file) throw new BadRequestException("Dosya gerekli");
    if (!ALLOWED_MIME.includes(file.mimetype)) {
      throw new BadRequestException(i18nMessage("server.user.documentFormats"));
    }
    if (file.size > MAX_SIZE) {
      throw new BadRequestException("Dosya en fazla 10MB olabilir");
    }
    const application = await this.assertBusinessApplicant(userId);
    const identityTypes: SellerDocumentType[] = [
      SellerDocumentType.identity_front,
      SellerDocumentType.identity_back,
      SellerDocumentType.passport_front,
      SellerDocumentType.passport_back,
    ];
    const isIdentityDocument = identityTypes.includes(documentType);
    let stakeholder: { id: string; identityType: "tckn" | "passport" } | null =
      null;

    if (isIdentityDocument) {
      if (!stakeholderId) {
        throw new BadRequestException(
          i18nMessage("server.user.stakeholderRequired"),
        );
      }
      stakeholder = await this.prisma.corporateStakeholder.findFirst({
        where: { id: stakeholderId, applicationId: application.id },
        select: { id: true, identityType: true },
      });
      if (!stakeholder) {
        throw new BadRequestException(
          i18nMessage("server.user.stakeholderNotFound"),
        );
      }
      const expectedPrefix =
        stakeholder.identityType === "tckn" ? "identity_" : "passport_";
      if (!documentType.startsWith(expectedPrefix)) {
        throw new BadRequestException(
          i18nMessage("server.user.documentTypeMismatch"),
        );
      }
    }

    const ext = file.mimetype === "application/pdf" ? "pdf" : "img";
    const up = await this.storage.uploadFile(
      file.buffer,
      {
        bucket: "documents",
        folder: "seller-documents",
        filename: `${userId}-${documentType}-${Date.now()}.${ext}`,
        mimeType: file.mimetype,
        isPublic: false,
        entityType: "seller_document",
        entityId: userId,
      } as any,
      userId,
    );

    const previous = await this.prisma.sellerDocument.findFirst({
      where: {
        userId,
        documentType,
        stakeholderId: stakeholder?.id ?? null,
        isCurrent: true,
      },
      orderBy: { version: "desc" },
    });

    const rec = await this.prisma.$transaction(async (tx) => {
      if (previous) {
        await tx.sellerDocument.update({
          where: { id: previous.id },
          data: { isCurrent: false },
        });
      }
      return tx.sellerDocument.create({
        data: {
          userId,
          applicationId: application.id,
          stakeholderId: stakeholder?.id,
          documentType,
          s3Key: up.key,
          fileName: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
          version: (previous?.version ?? 0) + 1,
          supersedesId: previous?.id,
        },
      });
    });
    this.logger.log(`Seller document uploaded: ${userId}/${documentType}`);
    return { documentType: rec.documentType, status: rec.status };
  }

  /** All slots for the current user with upload state + a short-lived preview URL. */
  async listMyDocuments(userId: string) {
    const docs = await this.prisma.sellerDocument.findMany({
      where: { userId, isCurrent: true },
    });
    const byType = new Map(docs.map((d) => [d.documentType, d]));
    const slots = await Promise.all(
      SELLER_DOCUMENT_TYPES.map(async (documentType) => {
        const d = byType.get(documentType);
        if (!d) return { documentType, uploaded: false as const };
        return {
          documentType,
          uploaded: true as const,
          fileName: d.fileName,
          mimeType: d.mimeType,
          status: d.status,
          reviewNote: d.reviewNote,
          appealNote: d.appealNote,
          version: d.version,
          uploadedAt: d.uploadedAt,
          url: await this.storage.getPresignedDownloadUrl(
            "documents",
            d.s3Key,
            3600,
          ),
        };
      }),
    );
    return { documents: slots };
  }

  async getMyApplication(userId: string) {
    const application = await this.prisma.corporateApplication.findUnique({
      where: { userId },
      include: {
        stakeholders: {
          include: {
            documents: {
              where: { isCurrent: true },
            },
          },
        },
        documents: {
          where: { isCurrent: true },
          orderBy: { uploadedAt: "desc" },
        },
        events: {
          orderBy: { createdAt: "desc" },
          take: 20,
        },
      },
    });
    if (!application) {
      throw new BadRequestException(
        i18nMessage("server.user.corporateApplicationNotFound"),
      );
    }
    return application;
  }

  async updateMyApplication(
    userId: string,
    dto: UpdateCorporateApplicationDto,
  ) {
    const application = await this.assertBusinessApplicant(userId);
    return this.prisma.corporateApplication.update({
      where: { id: application.id },
      data: {
        ...dto,
        iban: dto.iban?.replace(/\s/g, "").toUpperCase(),
        events: {
          create: {
            action: "company_details_updated",
            actorUserId: userId,
          },
        },
      },
    });
  }

  async addStakeholder(userId: string, dto: CreateCorporateStakeholderDto) {
    const application = await this.assertBusinessApplicant(userId);
    return this.prisma.corporateStakeholder.create({
      data: {
        applicationId: application.id,
        fullName: dto.fullName.trim(),
        identityType: dto.identityType,
        identityNumber: dto.identityNumber?.trim(),
      },
    });
  }

  async appealDocument(userId: string, documentId: string, note: string) {
    const document = await this.prisma.sellerDocument.findFirst({
      where: { id: documentId, userId, isCurrent: true },
    });
    if (!document)
      throw new BadRequestException(
        i18nMessage("server.user.documentNotFound"),
      );
    if (!["rejected", "revision_requested"].includes(document.status)) {
      throw new BadRequestException(
        i18nMessage("server.user.appealRejectedOnly"),
      );
    }
    await this.prisma.$transaction([
      this.prisma.sellerDocument.update({
        where: { id: document.id },
        data: { status: "appealed", appealNote: note.trim() },
      }),
      this.prisma.corporateApplicationEvent.create({
        data: {
          applicationId: document.applicationId!,
          action: "document_appealed",
          note: note.trim(),
          actorUserId: userId,
          metadata: {
            documentId,
            documentType: document.documentType,
          },
        },
      }),
    ]);
    return { success: true };
  }

  async submitForFinalReview(userId: string) {
    const application = await this.getMyApplication(userId);
    const missingFields = [
      "taxId",
      "companyType",
      "taxOffice",
      "companyCity",
      "companyDistrict",
      "bankAccountHolder",
      "iban",
    ].filter((field) => !application[field as keyof typeof application]);
    if (missingFields.length) {
      throw new BadRequestException(
        i18nMessage("server.user.companyFieldsMissing", {
          fields: missingFields.join(", "),
        }),
      );
    }

    const currentCompanyTypes = new Set(
      application.documents
        .filter((document) => !document.stakeholderId)
        .map((document) => document.documentType),
    );
    const required = [
      SellerDocumentType.tax_plate,
      SellerDocumentType.contract,
      SellerDocumentType.signature_circular,
      SellerDocumentType.activity_certificate,
      SellerDocumentType.residence_or_invoice,
      SellerDocumentType.trade_registry_gazette,
      SellerDocumentType.bank_account_info,
    ];
    const missingDocuments = required.filter(
      (type) => !currentCompanyTypes.has(type),
    );
    const stakeholdersWithoutIdentity = application.stakeholders.filter(
      (stakeholder) => {
        const currentTypes = new Set(
          stakeholder.documents.map((document) => document.documentType),
        );
        const prefix =
          stakeholder.identityType === "tckn" ? "identity" : "passport";
        return (
          !currentTypes.has(`${prefix}_front` as SellerDocumentType) ||
          !currentTypes.has(`${prefix}_back` as SellerDocumentType)
        );
      },
    );
    if (
      missingDocuments.length ||
      !application.stakeholders.length ||
      stakeholdersWithoutIdentity.length
    ) {
      throw new BadRequestException(
        i18nMessage("server.user.documentsIncomplete"),
      );
    }

    await this.prisma.corporateApplication.update({
      where: { id: application.id },
      data: {
        status: "under_review",
        submittedForReviewAt: new Date(),
        events: {
          create: {
            action: "submitted_for_final_review",
            actorUserId: userId,
          },
        },
      },
    });
    return { success: true, status: "under_review" };
  }
}
