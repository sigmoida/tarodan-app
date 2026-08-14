import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectQueue } from "@nestjs/bull";
import type { Queue } from "bull";
import {
  MembershipTierType,
  Prisma,
  ProductImportBatchStatus,
  ProductCondition,
  ProductKind,
  ProductStatus,
  ShippingPackageTierCode,
} from "@prisma/client";
import { createHash, randomUUID } from "crypto";
import * as ExcelJS from "exceljs";
import * as path from "path";
import { isUUID, validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import { PrismaService } from "../../prisma";
import { notifyWebRevalidate } from "../../common/revalidate";
import {
  assertNoFormulas,
  cellText,
  collectDataRowNumbers,
  csvList,
  loadImportSheet,
  normalizeFilename,
  normalizeHeader,
  optionalDate,
  optionalNumber,
  parseBoolean,
  readHeaderMap,
  requiredNumber,
  resolveRef,
  type CatalogRef,
} from "../../common/helpers/excel-import";
import { CacheService } from "../cache/cache.service";
import { CommissionRuleGuardService } from "../commission/commission-rule-guard.service";
import { MembershipService } from "../membership/membership.service";
import {
  canSellFromMembership,
  saleCapableSellerWhere,
} from "../membership/membership.util";
import { MediaService } from "../media/media.service";
import { ModerationAiClient } from "../moderation/moderation-ai.client";
import { CreateProductDto } from "../product/dto";
import { initialProductRanking } from "../product/helpers/product-initial-ranking";
import {
  loadProductPriceLimits,
  productPriceLimitViolation,
} from "../product/helpers/product-price-limits";
import { productShippingTierData } from "../product/helpers/product-shipping-tier.helper";
import { resolveCreateSalePricing } from "../product/helpers/product-sale-pricing";
import { ProductCommonService } from "../product/product-common.service";
import { ProductRankingService } from "../product/product-ranking.service";
import { SearchService } from "../search/search.service";
import { StorageService } from "../storage/storage.service";
import { QUEUE_NAMES } from "../../workers/constants";
import { AdminAuditService } from "./admin-audit.service";
import {
  PRODUCT_BULK_IMPORT_LIMITS,
  PRODUCT_BULK_IMPORT_PUBLIC_LIMITS,
  PRODUCT_BULK_IMPORT_STALE_MINUTES,
} from "./admin-product-bulk-import.constants";

const STALE_BATCH_MESSAGE =
  "Yükleme yarıda kaldı (sunucu yeniden başlatılmış olabilir). Hiçbir ürün oluşturulmadı; dosyayı yeniden yükleyin.";

const PRODUCT_SHEET = "Urunler";
const IMAGE_COLUMNS = Array.from(
  { length: PRODUCT_BULK_IMPORT_LIMITS.maxImagesPerProduct },
  (_, index) => `gorsel_${index + 1}`,
);

const REQUIRED_HEADERS = [
  "urun_ref",
  "baslik",
  "aciklama",
  "kategori",
  "marka",
  "uretici",
  "durum",
  "renk",
  "olcek",
  "malzeme",
  "kutulu",
  "fiyat",
  "stok",
  "kargo_paketi",
  ...IMAGE_COLUMNS.slice(0, 3),
] as const;

interface ParsedImportRow {
  rowNumber: number;
  reference: string;
  productId: string;
  dto: CreateProductDto;
  attributeIds: string[];
  imageNames: string[];
}

export interface ProductBulkImportResult {
  success: true;
  status: "completed";
  batchId: string;
  seller: { id: string; displayName: string; companyName: string | null };
  createdCount: number;
  products: Array<{
    id: string;
    productCode: string;
    reference: string;
    title: string;
    status: ProductStatus;
  }>;
}

export interface ProductBulkImportPendingResult {
  success: false;
  status: "processing" | "failed";
  batchId: string;
  errors: string[];
}

export type ProductBulkImportResponse =
  ProductBulkImportResult | ProductBulkImportPendingResult;

const IMPORT_WORK_CONCURRENCY = 4;

async function forEachWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  let firstError: unknown;
  const runners = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (cursor < items.length && firstError === undefined) {
        const index = cursor;
        cursor += 1;
        try {
          await worker(items[index], index);
        } catch (error) {
          firstError ??= error;
        }
      }
    },
  );
  await Promise.all(runners);
  if (firstError !== undefined) throw firstError;
}

@Injectable()
export class AdminProductBulkImportService {
  private readonly logger = new Logger(AdminProductBulkImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    private readonly storage: StorageService,
    private readonly membership: MembershipService,
    private readonly commissionGuard: CommissionRuleGuardService,
    private readonly search: SearchService,
    private readonly cache: CacheService,
    private readonly audit: AdminAuditService,
    private readonly moderationAi: ModerationAiClient,
    @InjectQueue(QUEUE_NAMES.MODERATION)
    private readonly moderationQueue: Queue,
    private readonly common: ProductCommonService,
    private readonly ranking: ProductRankingService,
  ) {}

  async listEligibleSellers(search?: string) {
    const now = new Date();
    const sellers = await this.prisma.user.findMany({
      where: {
        isSeller: true,
        isBanned: false,
        businessStatus: "approved",
        AND: [saleCapableSellerWhere(now)],
        ...(search?.trim()
          ? {
              OR: [
                {
                  displayName: {
                    contains: search.trim(),
                    mode: Prisma.QueryMode.insensitive,
                  },
                },
                {
                  companyName: {
                    contains: search.trim(),
                    mode: Prisma.QueryMode.insensitive,
                  },
                },
                {
                  email: {
                    contains: search.trim(),
                    mode: Prisma.QueryMode.insensitive,
                  },
                },
                { taxId: { contains: search.trim() } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        displayName: true,
        companyName: true,
        email: true,
        taxId: true,
      },
      orderBy: [{ companyName: "asc" }, { displayName: "asc" }],
      take: 100,
    });

    return { data: sellers, limits: PRODUCT_BULK_IMPORT_PUBLIC_LIMITS };
  }

  async import(
    adminId: string,
    sellerId: string,
    batchId: string,
    workbookFile: Express.Multer.File | undefined,
    imageFiles: Express.Multer.File[],
  ): Promise<ProductBulkImportResponse> {
    if (!isUUID(batchId, "4")) {
      throw new BadRequestException(
        "Toplu yükleme için geçerli bir Idempotency-Key gönderilmelidir.",
      );
    }
    if (!sellerId?.trim()) {
      throw new BadRequestException("Kurumsal satıcı seçilmelidir.");
    }
    if (!workbookFile) {
      throw new BadRequestException("Excel dosyası yüklenmelidir.");
    }
    if (!imageFiles?.length) {
      throw new BadRequestException("Ürün görselleri yüklenmelidir.");
    }
    if (
      workbookFile.mimetype !==
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" &&
      !workbookFile.originalname.toLocaleLowerCase("tr-TR").endsWith(".xlsx")
    ) {
      throw new BadRequestException(
        "Yalnızca .xlsx Excel dosyası yüklenebilir.",
      );
    }

    const seller = await this.prisma.user.findUnique({
      where: { id: sellerId },
      select: {
        id: true,
        displayName: true,
        companyName: true,
        taxId: true,
        businessStatus: true,
        isSeller: true,
        isBanned: true,
        membership: {
          select: {
            status: true,
            currentPeriodEnd: true,
            tier: { select: { type: true, isActive: true } },
          },
        },
      },
    });

    if (!seller) throw new NotFoundException("Satıcı bulunamadı.");
    if (
      !seller.isSeller ||
      seller.isBanned ||
      seller.businessStatus !== "approved" ||
      seller.membership?.tier.type !== MembershipTierType.business ||
      !canSellFromMembership(seller.membership, seller)
    ) {
      throw new ConflictException(
        "Toplu ürün yükleme yalnızca satış yetkisi açık BUSINESS kurumsal satıcılar için kullanılabilir.",
      );
    }

    const sourceFilename = workbookFile.originalname;
    const requestFingerprint = this.importFingerprint(
      sellerId,
      workbookFile,
      imageFiles,
    );
    const rows = await this.parseAndValidateWorkbook(
      workbookFile,
      sellerId,
      imageFiles,
    );
    workbookFile.buffer = Buffer.alloc(0);
    const limits = await this.membership.getUserLimits(sellerId);
    if (
      limits.remainingTotalListings !== -1 &&
      rows.length > limits.remainingTotalListings
    ) {
      throw new ConflictException(
        `Satıcının yalnızca ${limits.remainingTotalListings} ilan hakkı kaldı; dosyada ${rows.length} ürün var.`,
      );
    }
    const tooManyImages = rows.find(
      (row) => row.imageNames.length > limits.maxImages,
    );
    if (tooManyImages) {
      throw new ConflictException(
        `${tooManyImages.reference} için ${tooManyImages.imageNames.length} görsel var; satıcının ürün başına limiti ${limits.maxImages}.`,
      );
    }

    const imageByName = this.indexUploadedImages(imageFiles);
    const existingBatch = await this.acquireBatch({
      id: batchId,
      adminId,
      sellerId,
      sourceFilename,
      requestFingerprint,
    });
    if (existingBatch) return this.serializeBatch(existingBatch);

    const uploadedKeys: string[] = [];
    const uploadedByProduct = new Map<
      string,
      Array<{ cardKey: string; detailKey: string }>
    >();
    let productsCommitted = false;

    try {
      await forEachWithConcurrency(
        rows,
        IMPORT_WORK_CONCURRENCY,
        async (row) => {
          await this.moderationAi.assertTextClean(row.dto.title, {
            entityType: "product",
            entityId: row.productId,
            userId: sellerId,
            field: "title",
            label: `${row.reference} ürün başlığı`,
          });
          await this.moderationAi.assertTextClean(row.dto.description, {
            entityType: "product",
            entityId: row.productId,
            userId: sellerId,
            field: "description",
            label: `${row.reference} ürün açıklaması`,
          });
        },
      );

      await forEachWithConcurrency(
        rows,
        IMPORT_WORK_CONCURRENCY,
        async (row) => {
          const variants: Array<{ cardKey: string; detailKey: string }> = [];
          for (const imageName of row.imageNames) {
            const file = imageByName.get(normalizeFilename(imageName));
            if (!file) {
              throw new BadRequestException(
                `${row.reference}: '${imageName}' adlı görsel yüklenmedi.`,
              );
            }
            await this.moderationAi.assertImageClean(file, {
              entityType: "product",
              entityId: row.productId,
              userId: sellerId,
              field: imageName,
            });
            const uploaded = await this.media.uploadProductImageVariants(
              file,
              row.productId,
            );
            file.buffer = Buffer.alloc(0);
            variants.push(uploaded);
            uploadedKeys.push(uploaded.cardKey, uploaded.detailKey);
          }
          uploadedByProduct.set(row.productId, variants);
        },
      );

      const initialRanking = initialProductRanking(seller.membership, seller);
      const created = await this.prisma.$transaction(
        async (tx) => {
          const products: Array<{
            id: string;
            productCode: string;
            title: string;
            status: ProductStatus;
          }> = [];
          for (const row of rows) {
            const sale = resolveCreateSalePricing({
              price: row.dto.price,
              originalPrice: row.dto.originalPrice,
              salePrice: row.dto.salePrice,
              saleStartDate: row.dto.saleStartDate,
              saleEndDate: row.dto.saleEndDate,
            });
            const images = uploadedByProduct.get(row.productId) ?? [];
            const product = await tx.product.create({
              data: {
                id: row.productId,
                sellerId,
                categoryId: row.dto.categoryId,
                title: row.dto.title,
                description: row.dto.description,
                price: sale.price,
                oldPrice: sale.oldPrice,
                saleStartDate: sale.saleStartDate,
                saleEndDate: sale.saleEndDate,
                condition: row.dto.condition,
                status: ProductStatus.active,
                kind: ProductKind.listing,
                quantity: row.dto.quantity ?? 1,
                ...productShippingTierData(row.dto.shippingPackageTier),
                // Kurumsal üyeler ve ürünleri takas konusu olamaz.
                isTradeEnabled: false,
                isPreorder: row.dto.isPreorder ?? false,
                isSet: row.dto.isSet ?? false,
                bundleSize: row.dto.isSet ? (row.dto.bundleSize ?? null) : null,
                brandId: row.dto.brandId,
                carModelId: row.dto.carModelId,
                manufacturerId: row.dto.manufacturerId,
                modelCode: row.dto.modelCode,
                color: row.dto.color,
                isBoxed: row.dto.isBoxed,
                releaseDate: row.dto.year
                  ? new Date(row.dto.year, 0, 1)
                  : undefined,
                ...initialRanking,
                images: {
                  create: images.map((image, index) => ({
                    ...image,
                    sortOrder: index,
                  })),
                },
                productAttributes: row.attributeIds.length
                  ? {
                      create: row.attributeIds.map((attributeId) => ({
                        attributeId,
                      })),
                    }
                  : undefined,
              },
              select: {
                id: true,
                productCode: true,
                title: true,
                status: true,
              },
            });
            products.push(product);
          }
          const result: ProductBulkImportResult = {
            success: true,
            status: ProductImportBatchStatus.completed,
            batchId,
            seller: {
              id: seller.id,
              displayName: seller.displayName,
              companyName: seller.companyName,
            },
            createdCount: products.length,
            products: products.map((product, index) => ({
              ...product,
              reference: rows[index].reference,
            })),
          };
          await tx.productImportBatch.update({
            where: { id: batchId },
            data: {
              status: ProductImportBatchStatus.completed,
              result: result as unknown as Prisma.InputJsonValue,
              errorMessages: [],
              completedAt: new Date(),
            },
          });
          return { products, result };
        },
        { timeout: 30_000 },
      );
      productsCommitted = true;
      await this.audit.createAuditLog(
        adminId,
        "product_bulk_import",
        "ProductImportBatch",
        batchId,
        null,
        {
          sellerId,
          createdCount: created.products.length,
          productIds: created.products.map((product) => product.id),
          sourceFilename,
          directApproval: true,
        },
      );

      await this.cache
        .delPattern("products:list:*")
        .catch((error) =>
          this.logger.warn(
            `Bulk import cache invalidation failed: ${error?.message ?? error}`,
          ),
        );
      await Promise.all(
        created.products.map(async (product, index) => {
          await this.ranking
            .recomputeProductRanking(product.id)
            .catch((error) =>
              this.logger.warn(
                `Bulk import ranking failed for ${product.id}: ${error?.message ?? error}`,
              ),
            );
          await this.search.syncProduct(product.id);
          const imageKeys = (uploadedByProduct.get(product.id) ?? []).map(
            (image) => image.detailKey || image.cardKey,
          );
          if (imageKeys.length) {
            await this.moderationQueue
              .add("product-image", {
                productId: product.id,
                imageKeys,
                directApproval: true,
                sourceReference: rows[index].reference,
              })
              .catch((error) =>
                this.logger.warn(
                  `Bulk import moderation job failed for ${product.id}: ${error?.message ?? error}`,
                ),
              );
          }
        }),
      );
      void notifyWebRevalidate([
        "products:list",
        ...created.products.map((product) => `product:${product.id}`),
      ]);
      return created.result;
    } catch (error) {
      // A successful DB transaction owns these images. Deleting them because a
      // later cache/audit step failed would publish products with broken media.
      if (!productsCommitted) {
        await Promise.allSettled(
          uploadedKeys.map((key) => this.storage.deleteFileByKey(key)),
        );
        await this.prisma.productImportBatch
          .updateMany({
            where: {
              id: batchId,
              status: ProductImportBatchStatus.processing,
            },
            data: {
              status: ProductImportBatchStatus.failed,
              errorMessages: this.batchErrorMessages(error),
              completedAt: new Date(),
            },
          })
          .catch((batchError) =>
            this.logger.warn(
              `Bulk import batch failure could not be persisted (${batchId}): ${this.errorMessage(batchError)}`,
            ),
          );
      }
      throw error;
    }
  }

  async getBatch(
    adminId: string,
    batchId: string,
  ): Promise<ProductBulkImportResponse> {
    const batch = await this.prisma.productImportBatch.findFirst({
      where: { id: batchId, adminId },
    });
    if (!batch) throw new NotFoundException("Toplu yükleme işlemi bulunamadı.");
    // İşi yürüten süreç ölmüşse satır sonsuza dek `processing` kalır ve istemci
    // sonsuza dek sorgular. Okuma anında da yaşlandır: cron'u beklemeden kapanır.
    if (
      batch.status === ProductImportBatchStatus.processing &&
      this.isStaleBatch(batch.createdAt)
    ) {
      const failed = await this.failStaleBatch(batch.id);
      if (failed) return this.serializeBatch(failed);
    }
    return this.serializeBatch(batch);
  }

  /**
   * Yarıda kalan (süreç çökmesi/deploy) import kayıtlarını `failed`'a çevirir.
   * Ürünler yalnız transaction içinde oluşup batch'i aynı anda `completed`
   * yaptığı için `processing` kalan bir satırın oluşturduğu ürün YOKTUR —
   * bu yüzden kapatmak güvenlidir, telafi işlemi gerekmez.
   */
  async failStaleBatches(): Promise<{ failed: number }> {
    const result = await this.prisma.productImportBatch.updateMany({
      where: {
        status: ProductImportBatchStatus.processing,
        createdAt: { lt: this.staleBatchCutoff() },
      },
      data: {
        status: ProductImportBatchStatus.failed,
        errorMessages: [STALE_BATCH_MESSAGE],
        completedAt: new Date(),
      },
    });
    if (result.count > 0) {
      this.logger.warn(
        `${result.count} yarıda kalmış toplu ürün yükleme kaydı kapatıldı.`,
      );
    }
    return { failed: result.count };
  }

  private staleBatchCutoff(now = new Date()): Date {
    return new Date(
      now.getTime() - PRODUCT_BULK_IMPORT_STALE_MINUTES * 60 * 1000,
    );
  }

  private isStaleBatch(createdAt: Date): boolean {
    return createdAt.getTime() < this.staleBatchCutoff().getTime();
  }

  /** Tek batch için CAS: hâlâ `processing` ise kapat, kapanan satırı döndür. */
  private async failStaleBatch(batchId: string) {
    const updated = await this.prisma.productImportBatch.updateMany({
      where: { id: batchId, status: ProductImportBatchStatus.processing },
      data: {
        status: ProductImportBatchStatus.failed,
        errorMessages: [STALE_BATCH_MESSAGE],
        completedAt: new Date(),
      },
    });
    if (updated.count === 0) return null;
    return this.prisma.productImportBatch.findUnique({
      where: { id: batchId },
    });
  }

  private async acquireBatch(data: {
    id: string;
    adminId: string;
    sellerId: string;
    sourceFilename: string;
    requestFingerprint: string;
  }) {
    try {
      await this.prisma.productImportBatch.create({ data });
      return null;
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== "P2002"
      ) {
        throw error;
      }
      const existing = await this.prisma.productImportBatch.findFirst({
        where: { id: data.id, adminId: data.adminId },
      });
      if (!existing) {
        throw new ConflictException(
          "Toplu yükleme işlem kimliği başka bir işlem tarafından kullanılıyor.",
        );
      }
      if (
        existing.sellerId !== data.sellerId ||
        existing.sourceFilename !== data.sourceFilename ||
        existing.requestFingerprint !== data.requestFingerprint
      ) {
        throw new ConflictException(
          "Aynı işlem kimliği farklı dosya veya satıcı için kullanılamaz.",
        );
      }
      return existing;
    }
  }

  private serializeBatch(batch: {
    id: string;
    status: ProductImportBatchStatus;
    result: Prisma.JsonValue | null;
    errorMessages: string[];
  }): ProductBulkImportResponse {
    if (batch.status === ProductImportBatchStatus.completed) {
      if (
        batch.result &&
        typeof batch.result === "object" &&
        !Array.isArray(batch.result)
      ) {
        return batch.result as unknown as ProductBulkImportResult;
      }
      throw new ConflictException(
        "Tamamlanan toplu yükleme işleminin sonucu okunamadı.",
      );
    }
    return {
      success: false,
      status: batch.status,
      batchId: batch.id,
      errors: batch.errorMessages,
    };
  }

  private batchErrorMessages(error: unknown): string[] {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      if (response && typeof response === "object") {
        const body = response as Record<string, unknown>;
        if (Array.isArray(body.errors)) return body.errors.map(String);
        if (Array.isArray(body.message)) return body.message.map(String);
        if (typeof body.message === "string") return [body.message];
      }
    }
    return [this.errorMessage(error)];
  }

  private importFingerprint(
    sellerId: string,
    workbook: Express.Multer.File,
    images: Express.Multer.File[],
  ): string {
    const hash = createHash("sha256");
    hash.update(sellerId);
    hash.update("\0workbook\0");
    hash.update(normalizeFilename(workbook.originalname));
    hash.update("\0");
    hash.update(workbook.buffer);
    for (const image of [...images].sort((a, b) =>
      normalizeFilename(a.originalname).localeCompare(
        normalizeFilename(b.originalname),
        "tr",
      ),
    )) {
      hash.update("\0image\0");
      hash.update(normalizeFilename(image.originalname));
      hash.update("\0");
      hash.update(image.buffer);
    }
    return hash.digest("hex");
  }

  private async parseAndValidateWorkbook(
    file: Express.Multer.File,
    sellerId: string,
    imageFiles: Express.Multer.File[],
  ): Promise<ParsedImportRow[]> {
    const sheet = await loadImportSheet(file.buffer, PRODUCT_SHEET);

    if (sheet.rowCount > PRODUCT_BULK_IMPORT_LIMITS.maxRows + 1) {
      throw new BadRequestException(
        `Urunler sayfası başlık dahil en fazla ${PRODUCT_BULK_IMPORT_LIMITS.maxRows + 1} satır içerebilir. Şablonun altına eklenen boş veya biçimlendirilmiş satırları da silin.`,
      );
    }

    assertNoFormulas(sheet, PRODUCT_SHEET);

    const headers = readHeaderMap(sheet);
    const missingHeaders = REQUIRED_HEADERS.filter(
      (header) => !headers.has(header),
    );
    if (missingHeaders.length) {
      throw new BadRequestException(
        `Excel sütunları eksik: ${missingHeaders.join(", ")}. Örnek dosyayı yeniden indirin.`,
      );
    }

    const dataRowNumbers = collectDataRowNumbers(sheet);
    if (!dataRowNumbers.length) {
      throw new BadRequestException("Excel dosyasında ürün satırı bulunamadı.");
    }
    if (dataRowNumbers.length > PRODUCT_BULK_IMPORT_LIMITS.maxRows) {
      throw new BadRequestException(
        `Tek yüklemede en fazla ${PRODUCT_BULK_IMPORT_LIMITS.maxRows} ürün eklenebilir.`,
      );
    }

    const [categories, brands, models, manufacturers, priceLimits] =
      await Promise.all([
        this.prisma.category.findMany({
          where: { isActive: true },
          select: { id: true, name: true, slug: true },
        }),
        this.prisma.brand.findMany({
          where: { isActive: true },
          select: { id: true, name: true, slug: true },
        }),
        this.prisma.carModel.findMany({
          where: { isActive: true },
          select: { id: true, name: true, slug: true, brandId: true },
        }),
        this.prisma.manufacturer.findMany({
          where: { isActive: true },
          select: { id: true, name: true, slug: true },
        }),
        loadProductPriceLimits(this.prisma),
      ]);

    const uploadedNames = new Set(
      imageFiles.map((image) => normalizeFilename(image.originalname)),
    );
    const usedRefs = new Set<string>();
    const usedImages = new Set<string>();
    const parsed: ParsedImportRow[] = [];
    const errors: string[] = [];

    for (const rowNumber of dataRowNumbers) {
      try {
        const get = (header: string) => {
          const column = headers.get(header);
          return column ? sheet.getRow(rowNumber).getCell(column).value : null;
        };
        const reference = cellText(get("urun_ref"));
        if (!reference) throw new Error("urun_ref zorunludur");
        const normalizedRef = reference.toLocaleLowerCase("tr-TR");
        if (usedRefs.has(normalizedRef)) {
          throw new Error(`urun_ref tekrar ediyor: ${reference}`);
        }
        usedRefs.add(normalizedRef);

        const category = resolveRef(
          categories,
          cellText(get("kategori")),
          "kategori",
        );
        const brand = resolveRef(brands, cellText(get("marka")), "marka");
        const modelValue = cellText(get("arac_modeli"));
        const carModel = modelValue
          ? resolveRef(
              models.filter((model) => model.brandId === brand.id),
              modelValue,
              "araç modeli",
            )
          : null;
        const manufacturer = resolveRef(
          manufacturers,
          cellText(get("uretici")),
          "üretici",
        );
        const imageNames = IMAGE_COLUMNS.map((header) =>
          cellText(get(header)),
        ).filter(Boolean);
        if (
          imageNames.length < PRODUCT_BULK_IMPORT_LIMITS.minImagesPerProduct
        ) {
          throw new Error("en az 3 görsel dosya adı girilmelidir");
        }
        for (const imageName of imageNames) {
          const normalized = normalizeFilename(imageName);
          if (!uploadedNames.has(normalized)) {
            throw new Error(`görsel yüklenmedi: ${imageName}`);
          }
          if (usedImages.has(normalized)) {
            throw new Error(
              `aynı görsel birden fazla üründe kullanılamaz: ${imageName}`,
            );
          }
          usedImages.add(normalized);
        }

        const price = requiredNumber(get("fiyat"), "fiyat");
        const priceViolation = productPriceLimitViolation(price, priceLimits);
        if (priceViolation?.type === "minimum") {
          throw new Error(
            `fiyat platform alt sınırı olan ${priceViolation.limit} TL'den düşük`,
          );
        }
        if (priceViolation?.type === "maximum") {
          throw new Error(
            `fiyat platform üst sınırı olan ${priceViolation.limit} TL'den yüksek`,
          );
        }
        const salePrice = optionalNumber(get("indirimli_fiyat"));
        if (salePrice != null && (salePrice <= 0 || salePrice >= price)) {
          throw new Error(
            "indirimli_fiyat sıfırdan büyük ve fiyat alanından küçük olmalıdır",
          );
        }
        const originalPrice = salePrice != null ? price : null;
        const saleStartDate = optionalDate(get("indirim_baslangic"));
        const saleEndDate = optionalDate(get("indirim_bitis"));
        if (saleStartDate && saleEndDate && saleEndDate <= saleStartDate) {
          throw new Error("indirim bitiş tarihi başlangıçtan sonra olmalıdır");
        }

        const scale = cellText(get("olcek"));
        const material = cellText(get("malzeme"));
        const attributeIds = await this.common.resolveProductAttributeIds(
          scale,
          undefined,
          material,
          csvList(cellText(get("ek_ozellikler"))),
          { rejectUnknown: true },
        );
        const isSet = parseBoolean(get("set_urun"), false);
        const dto = plainToInstance(CreateProductDto, {
          title: cellText(get("baslik")),
          description: cellText(get("aciklama")),
          price,
          categoryId: category.id,
          condition: this.condition(get("durum")),
          images: imageNames.map((name) => ({
            cardKey: name,
            detailKey: name,
          })),
          isTradeEnabled: false,
          isPreorder: parseBoolean(get("on_siparis"), false),
          isSet,
          bundleSize: isSet
            ? requiredNumber(get("set_parca_sayisi"), "set_parca_sayisi")
            : undefined,
          brandId: brand.id,
          carModelId: carModel?.id,
          manufacturerId: manufacturer.id,
          modelCode: cellText(get("model_kodu")) || undefined,
          color: cellText(get("renk")),
          isBoxed: parseBoolean(get("kutulu")),
          quantity: requiredNumber(get("stok"), "stok"),
          shippingPackageTier: this.shippingTier(get("kargo_paketi")),
          scale,
          material,
          year: optionalNumber(get("yil")),
          attributes: csvList(cellText(get("ek_ozellikler"))),
          originalPrice,
          salePrice,
          saleStartDate: saleStartDate?.toISOString(),
          saleEndDate: saleEndDate?.toISOString(),
        });
        const validationErrors = await validate(dto, {
          whitelist: true,
          forbidNonWhitelisted: true,
        });
        if (validationErrors.length) {
          throw new Error(
            validationErrors
              .flatMap((error) => Object.values(error.constraints ?? {}))
              .join("; "),
          );
        }

        const sale = resolveCreateSalePricing(dto);
        for (const amount of [
          ...new Set(
            [sale.price, sale.oldPrice].filter((v): v is number => v != null),
          ),
        ]) {
          await this.commissionGuard.assertListingRuleExists({
            sellerId,
            categoryId: category.id,
            amount,
          });
        }

        parsed.push({
          rowNumber,
          reference,
          productId: randomUUID(),
          dto,
          attributeIds,
          imageNames,
        });
      } catch (error: unknown) {
        if (this.isCommissionConfigurationError(error)) throw error;
        errors.push(`Satır ${rowNumber}: ${this.errorMessage(error)}`);
      }
    }

    if (errors.length) {
      throw new BadRequestException({
        code: "PRODUCT_BULK_IMPORT_VALIDATION_FAILED",
        message: "Excel dosyasında düzeltilmesi gereken alanlar var.",
        errors,
      });
    }
    return parsed;
  }

  private indexUploadedImages(files: Express.Multer.File[]) {
    const map = new Map<string, Express.Multer.File>();
    for (const file of files) {
      const key = normalizeFilename(file.originalname);
      if (!key) throw new BadRequestException("Geçersiz görsel dosya adı.");
      if (map.has(key)) {
        throw new BadRequestException(
          `Aynı isimde birden fazla görsel yüklendi: ${file.originalname}`,
        );
      }
      map.set(key, file);
    }
    return map;
  }

  private condition(value: ExcelJS.CellValue | undefined | null) {
    const normalized = cellText(value).toLocaleLowerCase("tr-TR");
    const map: Record<string, ProductCondition> = {
      new: ProductCondition.new,
      yeni: ProductCondition.new,
      like_new: ProductCondition.like_new,
      "yeni gibi": ProductCondition.like_new,
      very_good: ProductCondition.very_good,
      "çok iyi": ProductCondition.very_good,
      good: ProductCondition.good,
      iyi: ProductCondition.good,
      fair: ProductCondition.fair,
      "orta / kullanılmış": ProductCondition.fair,
      orta: ProductCondition.fair,
    };
    const condition = map[normalized];
    if (!condition) throw new Error(`geçersiz durum: ${cellText(value)}`);
    return condition;
  }

  private shippingTier(value: ExcelJS.CellValue | undefined | null) {
    const normalized = cellText(value).toLocaleLowerCase("tr-TR");
    const map: Record<string, ShippingPackageTierCode> = {
      small: ShippingPackageTierCode.small,
      küçük: ShippingPackageTierCode.small,
      kucuk: ShippingPackageTierCode.small,
      medium: ShippingPackageTierCode.medium,
      orta: ShippingPackageTierCode.medium,
      large: ShippingPackageTierCode.large,
      büyük: ShippingPackageTierCode.large,
      buyuk: ShippingPackageTierCode.large,
    };
    const tier = map[normalized];
    if (!tier) throw new Error(`geçersiz kargo paketi: ${cellText(value)}`);
    return tier;
  }

  private errorMessage(error: unknown): string {
    if (
      error instanceof BadRequestException ||
      error instanceof ConflictException
    ) {
      const response = error.getResponse();
      if (typeof response === "string") return response;
      if (response && typeof response === "object") {
        const body = response as {
          message?: string | string[] | { message?: string };
        };
        if (Array.isArray(body.message)) return body.message.join("; ");
        if (typeof body.message === "string") return body.message;
        if (
          body.message &&
          typeof body.message === "object" &&
          typeof body.message.message === "string"
        ) {
          return body.message.message;
        }
      }
    }
    return error instanceof Error ? error.message : "geçersiz veri";
  }

  private isCommissionConfigurationError(error: unknown): boolean {
    if (!(error instanceof HttpException)) return false;
    const response = error.getResponse();
    return (
      typeof response === "object" &&
      response != null &&
      (response as { code?: string }).code ===
        "LISTING_COMMISSION_RULE_UNAVAILABLE"
    );
  }
}
