import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Optional,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { StorageService } from "../storage/storage.service";
import { notifyWebRevalidate } from "../../common/revalidate";
import { AdminAuditService } from "./admin-audit.service";
import { fulltextProductSearch } from "../product/helpers/fulltext-search";
import { getProductStatusFromQuantity } from "../product/helpers/product-status.helper";
import { billableDesiForTier } from "../shipping/shipping-package-tier";
import {
  AdminProductQueryDto,
  UpdateProductDto,
  ApproveProductDto,
  RejectProductDto,
} from "./dto";
import { ProductStatus, OrderStatus, Prisma } from "@prisma/client";
import { DiscountService } from "../discount/discount.service";
import { SearchService } from "../search/search.service";
import { CacheService } from "../cache/cache.service";
import { NotificationService } from "../notification/notification.service";
import { NotificationType } from "../notification/dto/notification.dto";
import { dateRangeWhere, paginate, resolveOrderBy } from "../../common/list";

/**
 * Ürün yönetimi + admin ürün silme/geri yükleme — AdminService'in
 * PRODUCT MANAGEMENT ve PRODUCT DELETION (ADMIN) bölümlerinden birebir taşındı.
 * AdminService aynı imzalarla buraya delege eder.
 */
@Injectable()
export class AdminProductService {
  private readonly logger = new Logger(AdminProductService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
    private readonly discountService: DiscountService,
    private readonly searchService: SearchService,
    private readonly cache: CacheService,
    private readonly notificationService: NotificationService,
    @Optional()
    private readonly storageService: StorageService,
  ) {}

  // AdminService'teki leaf yardımcı ile birebir aynı (bilinçli kopya; facade'da
  // başka bölümler de kullandığı için oradan kaldırılamadı).
  private resolveProductImageUrl(
    imageKeyOrUrl: string | null | undefined,
  ): string | null {
    if (!imageKeyOrUrl) return null;
    // Strip expired presigned S3 query params to get the clean public URL
    if (
      (imageKeyOrUrl.startsWith("http://") ||
        imageKeyOrUrl.startsWith("https://")) &&
      imageKeyOrUrl.includes("X-Amz-Signature")
    ) {
      try {
        const parsed = new URL(imageKeyOrUrl);
        parsed.search = "";
        return parsed.toString();
      } catch {
        // fall through
      }
    }
    if (
      imageKeyOrUrl.startsWith("http://") ||
      imageKeyOrUrl.startsWith("https://") ||
      imageKeyOrUrl.startsWith("/")
    )
      return imageKeyOrUrl;
    // Try to resolve any non-URL string as an S3 key (covers dev/, prod/, and other prefixes)
    if (this.storageService) {
      return this.storageService.getPublicAssetUrl(imageKeyOrUrl) ?? null;
    }
    return null;
  }

  // ==================== PRODUCT MANAGEMENT ====================

  /**
   * Get products with filters
   */
  async getProducts(query: AdminProductQueryDto) {
    const { search, status, categoryId, sellerId, brandId, carModelId } = query;

    const where: Prisma.ProductWhereInput = {};

    if (search) {
      // Tek arama kutusu: ürün metni (fulltext) VEYA satıcı adı/e-postası eşleşsin.
      // Bu OR, diğer filtrelerle (status, categoryId, sellerId) AND'lenir.
      const productIds = await fulltextProductSearch(this.prisma, search);
      where.OR = [
        { id: { in: productIds } },
        // İlan numarası (U010001) — destek/şikayet akışlarında doğrudan aranır.
        { productCode: { contains: search.trim(), mode: "insensitive" } },
        { seller: { displayName: { contains: search, mode: "insensitive" } } },
        { seller: { email: { contains: search, mode: "insensitive" } } },
        { category: { name: { contains: search, mode: "insensitive" } } },
      ];
    }

    if (status) {
      where.status = status;
    }

    if (brandId) {
      where.brandId = brandId;
    }

    if (carModelId) {
      where.carModelId = carModelId;
    }

    if (categoryId) {
      where.categoryId = categoryId;
    }

    if (sellerId) {
      where.sellerId = sellerId;
    }

    Object.assign(where, dateRangeWhere(query));

    const orderBy = resolveOrderBy<Prisma.ProductOrderByWithRelationInput>(
      "Product",
      query,
      { defaultSort: { createdAt: "desc" } },
    );
    const result = await paginate(
      this.prisma.product,
      {
        where,
        include: {
          seller: {
            select: {
              id: true,
              displayName: true,
              email: true,
              avatarUrl: true,
            },
          },
          category: { select: { id: true, name: true } },
          brand: { select: { name: true } },
          images: { take: 1, orderBy: { sortOrder: "asc" } },
          _count: { select: { images: true } },
        },
        orderBy,
      },
      query,
    );

    // Calculate campaign prices for each product
    const productsWithCampaignPrices = await Promise.all(
      result.data.map(async (p) => {
        const basePrice = Number(p.price);

        // Get campaign discount price from DiscountService
        const campaignPrice =
          await this.discountService.getEffectiveDisplayPrice(
            p.id,
            p.sellerId,
            p.categoryId ?? undefined,
            basePrice,
          );

        const effectivePrice = campaignPrice ?? basePrice;
        const hasDiscount = effectivePrice < basePrice;

        // Convert S3 key to presigned URL for image
        const imageUrl = this.resolveProductImageUrl(p.images[0]?.cardKey);

        return {
          ...p,
          price: effectivePrice,
          originalPrice: hasDiscount
            ? basePrice
            : p.originalPrice != null
              ? Number(p.originalPrice)
              : null,
          salePrice: p.salePrice != null ? Number(p.salePrice) : null,
          isOnSale:
            hasDiscount ||
            (p.salePrice != null && Number(p.salePrice) < basePrice),
          imageUrl,
        };
      }),
    );

    return {
      ...result,
      data: productsWithCampaignPrices,
    };
  }

  /**
   * Export products to CSV format
   */
  async exportProducts(query: {
    status?: string;
    categoryId?: string;
    sellerId?: string;
  }) {
    const where: Prisma.ProductWhereInput = {};

    if (query.status) {
      where.status = query.status as ProductStatus;
    }
    if (query.categoryId) {
      where.categoryId = query.categoryId;
    }
    if (query.sellerId) {
      where.sellerId = query.sellerId;
    }

    const products = await this.prisma.product.findMany({
      where,
      include: {
        seller: { select: { displayName: true, email: true } },
        category: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    // Create CSV header
    const headers = [
      "ID",
      "İlan No",
      "Başlık",
      "Fiyat",
      "Durum",
      "Kondisyon",
      "Kategori",
      "Satıcı",
      "Satıcı Email",
      "Oluşturulma Tarihi",
    ];

    // Create CSV rows
    const rows = products.map((p) => [
      p.id,
      p.productCode,
      `"${(p.title || "").replace(/"/g, '""')}"`,
      Number(p.price).toFixed(2),
      p.status,
      p.condition,
      p.category?.name || "",
      p.seller?.displayName || "",
      p.seller?.email || "",
      new Date(p.createdAt).toISOString(),
    ]);

    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

    return {
      filename: `products_${new Date().toISOString().split("T")[0]}.csv`,
      content: csv,
      mimeType: "text/csv",
    };
  }

  /**
   * Get single product by ID (admin)
   */
  async getProduct(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        seller: { select: { id: true, displayName: true, email: true } },
        category: { select: { id: true, name: true, slug: true } },
        brand: { select: { id: true, name: true, slug: true } },
        carModel: { select: { id: true, name: true, slug: true } },
        manufacturer: { select: { id: true, name: true, slug: true } },
        productAttributes: {
          include: { attribute: { include: { group: true } } },
        },
        images: { orderBy: { sortOrder: "asc" } },
      },
    });
    if (!product) {
      throw new NotFoundException("Ürün bulunamadı");
    }

    // Convert S3 keys to presigned URLs for all images
    const imagesWithPresignedUrls = await Promise.all(
      product.images.map(async (img) => ({
        ...img,
        url: this.resolveProductImageUrl(img.cardKey),
      })),
    );
    const attributeValue = (groupSlug: string) => {
      const attribute = product.productAttributes.find(
        (row) => row.attribute.group.slug === groupSlug,
      )?.attribute;
      return attribute?.displayValue ?? attribute?.value ?? null;
    };

    return {
      ...product,
      scale: attributeValue("scale"),
      material: attributeValue("material"),
      images: imagesWithPresignedUrls,
      price: Number(product.price),
      originalPrice:
        product.originalPrice != null ? Number(product.originalPrice) : null,
      salePrice: product.salePrice != null ? Number(product.salePrice) : null,
    };
  }

  /**
   * Update product details
   */
  async updateProduct(
    adminId: string,
    productId: string,
    dto: UpdateProductDto,
  ) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException("Ürün bulunamadı");
    }

    const data: Prisma.ProductUpdateInput = {};

    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.price !== undefined) data.price = dto.price;
    if (dto.oldPrice !== undefined) data.oldPrice = dto.oldPrice;
    if (dto.quantity !== undefined) {
      data.quantity = dto.quantity;
    }
    // Paket boyutu düzeltmesi (moderasyon): satıcı yanlış boyut seçtiğinde farkı
    // platform üstleniyor, bu yüzden admin düzeltebilir. Desi kademeden TÜRETİLİR —
    // ikisi ayrışırsa paket desisi toplamı yanlış kademeye düşer.
    if (dto.shippingPackageTier !== undefined) {
      data.shippingPackageTier = dto.shippingPackageTier;
      data.shippingDesi = billableDesiForTier(dto.shippingPackageTier);
    }
    // Açıkça seçilen status admin'in override'ı olarak öncelikli — aksi halde
    // düzenleme formu quantity'yi de gönderdiğinden status her zaman miktardan
    // türetilir ve stoklu ürün "Pasif"e alınamazdı. Status verilmediyse ve
    // quantity değiştiyse, status'ü miktardan türet (0 → inactive).
    if (dto.status !== undefined) {
      data.status = dto.status;
    } else if (dto.quantity !== undefined) {
      data.status = getProductStatusFromQuantity(dto.quantity);
    }
    if (dto.condition !== undefined) data.condition = dto.condition;
    if (dto.categoryId !== undefined) {
      data.category = { connect: { id: dto.categoryId } };
    }

    const updated = await this.prisma.product.update({
      where: { id: productId },
      data,
      include: {
        category: { select: { id: true, name: true, slug: true } },
        seller: { select: { id: true, displayName: true, email: true } },
        images: { orderBy: { sortOrder: "asc" } },
      },
    });

    await this.audit.createAuditLog(
      adminId,
      "product_update",
      "Product",
      productId,
      product,
      updated,
    );

    // Invalidate caches
    if (this.cache) {
      await this.cache.del(`products:detail:${productId}`);
      await this.cache.delPattern("products:list:*");
    }

    // Arama index'ini güncelle: status/quantity değişmiş olabilir →
    // listelenebilir ise indexle, değilse (pasif-stoklu/kaldırıldı vb.) kaldır
    this.searchService
      .syncProduct(productId)
      .catch((err) =>
        this.logger.warn(`ES sync failed for ${productId}: ${err?.message}`),
      );

    // Web ISR'yi anında tazele (fiyat/indirim değişimi web'e hemen yansısın).
    void notifyWebRevalidate(["products:list", `product:${productId}`]);

    return updated;
  }

  /**
   * Approve product
   * Requirement: Listing approval (project.md)
   */
  async approveProduct(
    adminId: string,
    productId: string,
    dto: ApproveProductDto,
  ) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException("Ürün bulunamadı");
    }

    if (product.status !== ProductStatus.pending) {
      throw new BadRequestException("Sadece bekleyen ürünler onaylanabilir");
    }

    const updated = await this.prisma.product.update({
      where: { id: productId },
      data: { status: ProductStatus.active },
    });

    await this.audit.createAuditLog(
      adminId,
      "product_approve",
      "Product",
      productId,
      product,
      updated,
    );

    // Invalidate product cache so the product appears in listings
    await this.cache.del(`products:detail:${productId}`);
    await this.cache.delPattern("products:list:*");

    // Arama index'ini güncelle: onaylanan ürün artık aktif → ES'e indexlensin
    this.searchService
      .syncProduct(productId)
      .catch((err) =>
        this.logger.warn(`ES sync failed for ${productId}: ${err?.message}`),
      );

    // Web ISR'yi anında tazele (fiyat/indirim değişimi web'e hemen yansısın).
    void notifyWebRevalidate(["products:list", `product:${productId}`]);

    // Yeniden satışa açılan (eski sold/inactive) ilan onaylanıp yayına girince
    // wishlist + son 7 gün stockout-cancelled alıcılara back-in-stock bildirimi
    // gönder. Yeni ilanlarda wishlist boş olacağından zararsızdır. Bildirim
    // hatası onayı bloke etmesin.
    this.notificationService
      .broadcastBackInStock(productId, product.title)
      .catch((err) =>
        this.logger.warn(
          `broadcastBackInStock failed for ${productId}: ${err?.message}`,
        ),
      );

    return { success: true, productId, status: "active" };
  }

  /**
   * Reject product
   */
  async rejectProduct(
    adminId: string,
    productId: string,
    dto: RejectProductDto,
  ) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException("Ürün bulunamadı");
    }

    const updated = await this.prisma.product.update({
      where: { id: productId },
      data: { status: ProductStatus.rejected },
    });

    await this.audit.createAuditLog(
      adminId,
      "product_reject",
      "Product",
      productId,
      product,
      { ...updated, reason: dto.reason },
    );

    // Satıcıya in-app bildirim: ilan reddedildi (neden ile). Bildirim hatası reddi bloke etmesin.
    try {
      await this.notificationService.createInAppNotification(
        product.sellerId,
        NotificationType.PRODUCT_REJECTED,
        { productTitle: product.title, reason: dto.reason },
      );
    } catch (err: any) {
      this.logger.warn(
        `PRODUCT_REJECTED notification failed for ${productId}: ${err?.message}`,
      );
    }

    // Invalidate product cache
    await this.cache.del(`products:detail:${productId}`);
    await this.cache.delPattern("products:list:*");

    // Arama index'ini güncelle: reddedilen ürün listelenemez → ES'ten kaldır
    this.searchService
      .syncProduct(productId)
      .catch((err) =>
        this.logger.warn(`ES sync failed for ${productId}: ${err?.message}`),
      );

    // Web ISR'yi anında tazele (fiyat/indirim değişimi web'e hemen yansısın).
    void notifyWebRevalidate(["products:list", `product:${productId}`]);

    return { success: true, productId, status: "rejected", reason: dto.reason };
  }

  /**
   * Bulk approve multiple products
   */
  async bulkApproveProducts(adminId: string, ids: string[], note?: string) {
    if (!ids || ids.length === 0) {
      throw new BadRequestException("En az bir ürün seçilmelidir");
    }

    const results: { id: string; success: boolean; error?: string }[] = [];

    for (const productId of ids) {
      try {
        const product = await this.prisma.product.findUnique({
          where: { id: productId },
        });

        if (!product) {
          results.push({
            id: productId,
            success: false,
            error: "Ürün bulunamadı",
          });
          continue;
        }

        if (product.status !== ProductStatus.pending) {
          results.push({
            id: productId,
            success: false,
            error: "Sadece bekleyen ürünler onaylanabilir",
          });
          continue;
        }

        const updated = await this.prisma.product.update({
          where: { id: productId },
          data: { status: ProductStatus.active },
        });

        await this.audit.createAuditLog(
          adminId,
          "product_bulk_approve",
          "Product",
          productId,
          product,
          { ...updated, note },
        );

        // Invalidate product cache
        await this.cache.del(`products:detail:${productId}`);

        // Arama index'ini güncelle: onaylanan ürün aktif → ES'e indexlensin
        this.searchService
          .syncProduct(productId)
          .catch((err) =>
            this.logger.warn(
              `ES sync failed for ${productId}: ${err?.message}`,
            ),
          );

        results.push({ id: productId, success: true });
      } catch (error) {
        results.push({ id: productId, success: false, error: error.message });
      }
    }

    // Invalidate product list cache
    await this.cache.delPattern("products:list:*");

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    return {
      success: true,
      message: `${successCount} ürün onaylandı${failCount > 0 ? `, ${failCount} ürün başarısız oldu` : ""}`,
      results,
    };
  }

  /**
   * Bulk reject multiple products
   */
  async bulkRejectProducts(adminId: string, ids: string[], reason: string) {
    if (!ids || ids.length === 0) {
      throw new BadRequestException("En az bir ürün seçilmelidir");
    }

    if (!reason || reason.trim() === "") {
      throw new BadRequestException("Red sebebi zorunludur");
    }

    const results: { id: string; success: boolean; error?: string }[] = [];

    for (const productId of ids) {
      try {
        const product = await this.prisma.product.findUnique({
          where: { id: productId },
        });

        if (!product) {
          results.push({
            id: productId,
            success: false,
            error: "Ürün bulunamadı",
          });
          continue;
        }

        const updated = await this.prisma.product.update({
          where: { id: productId },
          data: { status: ProductStatus.rejected },
        });

        await this.audit.createAuditLog(
          adminId,
          "product_bulk_reject",
          "Product",
          productId,
          product,
          { ...updated, reason },
        );

        // Invalidate product cache
        await this.cache.del(`products:detail:${productId}`);

        // Arama index'ini güncelle: reddedilen ürün listelenemez → ES'ten kaldır
        this.searchService
          .syncProduct(productId)
          .catch((err) =>
            this.logger.warn(
              `ES sync failed for ${productId}: ${err?.message}`,
            ),
          );

        results.push({ id: productId, success: true });
      } catch (error) {
        results.push({ id: productId, success: false, error: error.message });
      }
    }

    // Invalidate product list cache
    await this.cache.delPattern("products:list:*");

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    return {
      success: true,
      message: `${successCount} ürün reddedildi${failCount > 0 ? `, ${failCount} ürün başarısız oldu` : ""}`,
      results,
      reason,
    };
  }

  // ==================== PRODUCT DELETION (ADMIN) ====================

  /**
   * Delete product (admin only)
   * - Cannot delete sold products
   * - Cannot delete reserved products
   * - Cannot delete products with active orders
   * - Soft delete (inactive) or hard delete based on conditions
   */
  async deleteProduct(
    adminId: string,
    productId: string,
    hardDelete: boolean = false,
  ) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        orders: {
          where: {
            status: {
              in: [
                OrderStatus.pending_payment,
                OrderStatus.paid,
                OrderStatus.preparing,
                OrderStatus.shipped,
              ],
            },
          },
        },
        _count: {
          select: { offers: true, orders: true },
        },
      },
    });

    if (!product) {
      throw new NotFoundException("Ürün bulunamadı");
    }

    // Check if product is sold
    if (product.status === ProductStatus.sold) {
      throw new BadRequestException("Satılmış ürünler silinemez");
    }

    // Check if product is reserved
    if (product.status === ProductStatus.reserved) {
      throw new BadRequestException("Rezerve edilmiş ürünler silinemez");
    }

    // Check if product has active orders
    if (product.orders.length > 0) {
      throw new BadRequestException("Aktif siparişi olan ürünler silinemez");
    }

    const oldProduct = { ...product };

    if (
      hardDelete &&
      product._count.offers === 0 &&
      product._count.orders === 0
    ) {
      // Hard delete - only if no offers and no orders
      await this.prisma.product.delete({
        where: { id: productId },
      });

      // Create audit log
      await this.audit.createAuditLog(
        adminId,
        "product_delete_hard",
        "Product",
        productId,
        oldProduct,
        null,
      );

      // Arama index'inden kaldır (ürün artık DB'de yok)
      this.searchService
        .syncProduct(productId)
        .catch((err) =>
          this.logger.warn(`ES sync failed for ${productId}: ${err?.message}`),
        );

      return { success: true, productId, deleted: true };
    } else {
      // Soft delete - set to deleted (pasif/inactive'den AYRI state: yönetici
      // kaldırması. Satıcı bunu yeniden aktive edemez; kendi pasifiyle karışmaz.)
      await this.prisma.product.update({
        where: { id: productId },
        data: { status: ProductStatus.deleted },
      });

      // Create audit log
      await this.audit.createAuditLog(
        adminId,
        "product_delete_soft",
        "Product",
        productId,
        oldProduct,
        {
          ...oldProduct,
          status: ProductStatus.deleted,
        },
      );

      // Arama index'inden kaldır: "Kaldırıldı" durumu listelenemez. Aksi halde
      // ES dokümanı eski (active) haliyle kalıp aramada görünür ama detay 404 olur.
      this.searchService
        .syncProduct(productId)
        .catch((err) =>
          this.logger.warn(`ES sync failed for ${productId}: ${err?.message}`),
        );

      return { success: true, productId, deleted: false, status: "deleted" };
    }
  }

  /**
   * Restore a soft-deleted product (admin only)
   * - Only products in the `deleted` ("Kaldırıldı") state can be restored
   * - Restored products go back to `pending` so they re-enter moderation
   */
  async restoreProduct(adminId: string, productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException("Ürün bulunamadı");
    }

    if (product.status !== ProductStatus.deleted) {
      throw new BadRequestException(
        "Yalnızca kaldırılmış ürünler geri yüklenebilir",
      );
    }

    const updated = await this.prisma.product.update({
      where: { id: productId },
      data: { status: ProductStatus.pending },
    });

    // Create audit log
    await this.audit.createAuditLog(
      adminId,
      "product_restore",
      "Product",
      productId,
      product,
      updated,
    );

    // Invalidate caches
    if (this.cache) {
      await this.cache.del(`products:detail:${productId}`);
      await this.cache.delPattern("products:list:*");
    }

    // Arama index'ini güncelle: geri yüklenen ürün "pending" → henüz listelenemez,
    // ES'ten kaldırılır; onaylanınca approveProduct yeniden indexler.
    this.searchService
      .syncProduct(productId)
      .catch((err) =>
        this.logger.warn(`ES sync failed for ${productId}: ${err?.message}`),
      );

    // Web ISR'yi anında tazele (fiyat/indirim değişimi web'e hemen yansısın).
    void notifyWebRevalidate(["products:list", `product:${productId}`]);

    return { success: true, productId, status: ProductStatus.pending };
  }
}
