import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import { SellerDocumentType } from "@prisma/client";
import { PrismaService } from "../../prisma";
import { StorageService } from "../storage/storage.service";

/** All corporate-seller document slots, in display order. */
export const SELLER_DOCUMENT_TYPES: SellerDocumentType[] = [
  SellerDocumentType.tax_plate,
  SellerDocumentType.contract,
  SellerDocumentType.signature_circular,
  SellerDocumentType.activity_certificate,
  SellerDocumentType.identity,
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
 * için tek kayıt; yeniden yükleme eskisini değiştirir ve durumu `pending`'e alır.
 */
@Injectable()
export class SellerDocumentService {
  private readonly logger = new Logger(SellerDocumentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  private async assertBusinessApplicant(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { companyName: true },
    });
    // Belge yükleme yalnız kurumsal başvuru yapmış (firma adı olan) kullanıcıya.
    if (!user?.companyName) {
      throw new ForbiddenException(
        "Yalnızca kurumsal satıcı başvurusu yapan kullanıcılar belge yükleyebilir",
      );
    }
  }

  async uploadDocument(
    userId: string,
    documentType: SellerDocumentType,
    file: Express.Multer.File | undefined,
  ) {
    if (!SELLER_DOCUMENT_TYPES.includes(documentType)) {
      throw new BadRequestException("Geçersiz belge tipi");
    }
    if (!file) throw new BadRequestException("Dosya gerekli");
    if (!ALLOWED_MIME.includes(file.mimetype)) {
      throw new BadRequestException("Yalnızca PDF, JPEG, PNG veya WebP");
    }
    if (file.size > MAX_SIZE) {
      throw new BadRequestException("Dosya en fazla 10MB olabilir");
    }
    await this.assertBusinessApplicant(userId);

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

    const rec = await this.prisma.sellerDocument.upsert({
      where: { userId_documentType: { userId, documentType } },
      create: {
        userId,
        documentType,
        s3Key: up.key,
        fileName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
      },
      update: {
        s3Key: up.key,
        fileName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        status: "pending",
        reviewNote: null,
        reviewedAt: null,
        uploadedAt: new Date(),
      },
    });
    this.logger.log(`Seller document uploaded: ${userId}/${documentType}`);
    return { documentType: rec.documentType, status: rec.status };
  }

  /** All slots for the current user with upload state + a short-lived preview URL. */
  async listMyDocuments(userId: string) {
    const docs = await this.prisma.sellerDocument.findMany({
      where: { userId },
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
}
