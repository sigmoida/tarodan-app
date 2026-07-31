import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { i18nMessage } from "../i18n";
import { PrismaService } from "../../prisma";
import { CacheService } from "../cache/cache.service";
import { SearchService } from "../search/search.service";
import { notifyWebRevalidate } from "../../common/revalidate";
import { NotificationService } from "../notification/notification.service";
import { NotificationType } from "../notification/dto";
import { SmtpProvider } from "../mail/smtp.provider";
import { UpdateProductDto } from "./dto";
import { ProductStatus, Prisma } from "@prisma/client";
import { renderManagedEmailTemplate } from "../../common/helpers/email-template-renderer";
import { ProductCommonService } from "./product-common.service";
import { ProductRankingService } from "./product-ranking.service";
import { MembershipService } from "../membership/membership.service";
import { productShippingTierData } from "./helpers/product-shipping-tier.helper";

/**
 * ProductUpdateService — ilan güncelleme + silme (soft delete). Optimistic lock,
 * indirim/fiyat mantığı, statü politikası (resolveUpdatedStatus), wishlist fiyat-değişim
 * bildirimi + e-posta, back-in-stock yayını, Elasticsearch sync (this.searchService.
 * syncProduct) ve cache invalidation birebir korunur. linkProductAttributes/
 * formatProductResponse->common, recomputeProductRanking->ranking (sanctioned rewrites).
 */
@Injectable()
export class ProductUpdateService {
  private readonly logger = new Logger(ProductUpdateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly searchService: SearchService,
    private readonly notificationService: NotificationService,
    private readonly smtpProvider: SmtpProvider,
    private readonly common: ProductCommonService,
    private readonly ranking: ProductRankingService,
    private readonly membershipService: MembershipService,
  ) {}

  /**
   * İlanı takasa açma hakkı — takas TEKLİF/KABUL kapılarıyla AYNI kaynak
   * (canCreateTrade → efektif tier'ın canTrade bayrağı). Eski kapı burada
   * `tier.canTrade && isPremiumEntitled` istiyordu; free tier'da entitled hep
   * false olduğundan admin free tier'a takası açsa bile ilan takasa
   * işaretlenemiyordu — teklif verme ve downgrade cron'u ise bayrağı tanıyordu.
   */
  private async assertTradeEnableAllowed(sellerId: string): Promise<void> {
    const canTrade = await this.membershipService.canCreateTrade(sellerId);
    if (!canTrade.allowed) {
      throw new BadRequestException(
        i18nMessage("server.product.tradeRequiresPremium"),
      );
    }
  }

  /**
   * Update product
   * PATCH /products/:id
   */
  async update(id: string, sellerId: string, dto: UpdateProductDto) {
    // Find product with optimistic locking
    const product = await this.prisma.product.findUnique({
      where: { id },
    });

    if (!product) {
      throw new NotFoundException(i18nMessage("server.product.notFound"));
    }

    // Verify ownership
    if (product.sellerId !== sellerId) {
      throw new ForbiddenException(i18nMessage("server.product.editForbidden"));
    }

    // Check if user is banned
    const seller = await this.prisma.user.findUnique({
      where: { id: sellerId },
      select: { isBanned: true },
    });

    if (seller?.isBanned) {
      throw new ForbiddenException(
        i18nMessage("server.product.bannedCannotEdit"),
      );
    }

    // Reserved products cannot be updated at all
    if (product.status === ProductStatus.reserved) {
      throw new BadRequestException(
        i18nMessage("server.product.reservedCannotUpdate"),
      );
    }

    // Silinen (yönetici tarafından kaldırılan) ürün düzenlenemez/yeniden açılamaz.
    // "Pasife alma"dan AYRI bir durumdur; satıcı bunu geri getiremez.
    if (product.status === ProductStatus.deleted) {
      throw new BadRequestException(
        i18nMessage("server.product.removedCannotReopen"),
      );
    }

    // Sold or inactive (stok biten / pasife alınmış): satıcı yeniden satışa
    // açmak isteyebilir ama DOĞRUDAN aktifleştiremez — istek admin onayına
    // (pending) gider. Onaylanınca yayına girer. Stok girilmesi/var olması şart.
    if (
      product.status === ProductStatus.sold ||
      product.status === ProductStatus.inactive
    ) {
      if (dto.status === ProductStatus.active) {
        const newQuantity =
          dto.quantity != null ? Number(dto.quantity) : product.quantity;
        if (newQuantity != null && newQuantity <= 0) {
          throw new BadRequestException(
            i18nMessage("server.product.setQuantityToReopen"),
          );
        }
        await this.prisma.product.update({
          where: { id },
          data: {
            status: ProductStatus.pending,
            ...(dto.quantity != null ? { quantity: Number(dto.quantity) } : {}),
          },
        });
        await this.cache.del(`products:detail:${id}`);
        await this.cache.delPattern("products:list:*");
        // NOT: back-in-stock bildirimi burada GÖNDERİLMEZ — ilan henüz yayında
        // değil (pending). Bildirim, admin onayıyla active'e geçtiğinde gider.
        const updated = await this.prisma.product.findUnique({
          where: { id },
          include: {
            images: true,
            category: true,
            brand: true,
            carModel: true,
          },
        });
        return updated;
      }
      // status=active dışı bir istek (ör. sadece düzenleme) sold/inactive ilanda
      // anlamsız; mevcut akışı korumak için yeniden satışa açma yönlendirmesi ver.
      throw new BadRequestException(
        i18nMessage("server.product.setQuantityToReopen"),
      );
    }

    // Verify category if being updated
    if (dto.categoryId) {
      const category = await this.prisma.category.findUnique({
        where: { id: dto.categoryId },
      });

      if (!category || !category.isActive) {
        throw new BadRequestException(
          i18nMessage("server.product.invalidCategory"),
        );
      }
    }

    if (
      dto.brandId !== undefined ||
      dto.carModelId !== undefined ||
      dto.manufacturerId !== undefined
    ) {
      const nextBrandId = dto.brandId ?? product.brandId;
      const nextCarModelId = dto.carModelId ?? product.carModelId;
      const nextManufacturerId = dto.manufacturerId ?? product.manufacturerId;
      const [brand, carModel, manufacturer] = await Promise.all([
        nextBrandId
          ? this.prisma.brand.findUnique({ where: { id: nextBrandId } })
          : null,
        nextCarModelId
          ? this.prisma.carModel.findUnique({ where: { id: nextCarModelId } })
          : null,
        nextManufacturerId
          ? this.prisma.manufacturer.findUnique({
              where: { id: nextManufacturerId },
            })
          : null,
      ]);
      if (
        !brand ||
        !brand.isActive ||
        !carModel ||
        !carModel.isActive ||
        carModel.brandId !== brand.id ||
        !manufacturer ||
        !manufacturer.isActive
      ) {
        throw new BadRequestException(
          i18nMessage("server.product.invalidBrandModelManufacturer"),
        );
      }
    }

    // NOT: Statü politikası resolveUpdatedStatus()'te merkezi olarak uygulanır.
    // Satıcı kendi ilanını DOĞRUDAN aktifleştiremez (aktivasyon isteği pending'e
    // gider); yalnızca pasife alabilir. Geçersiz/izinsiz statü istekleri sessizce
    // yok sayılır (mevcut statü korunur) — böylece düzenleme akışı kırılmaz.

    // Check membership for trade feature
    let canEnableTrade = false;
    if (dto.isTradeEnabled === true) {
      await this.assertTradeEnableAllowed(sellerId);
      canEnableTrade = true;
    }

    // A + oldPrice: price (A) = her zaman güncel satış fiyatı; indirim uygulanınca price = indirimli, oldPrice = önceki; indirim bitince price = oldPrice
    const currentPrice = Number(product.price);
    const currentOldPrice =
      product.oldPrice != null ? Number(product.oldPrice) : null;
    // class-transformer @Type(() => Number) converts null → 0, so treat 0 as "no sale" too
    const rawSalePrice = dto.salePrice;
    const isSettingSale = rawSalePrice != null && Number(rawSalePrice) > 0;
    const isClearingSale =
      rawSalePrice === null ||
      rawSalePrice === undefined ||
      Number(rawSalePrice) === 0;

    let priceUpdate: number | undefined;
    let oldPriceUpdate: number | null | undefined;
    let saleStartDateUpdate: Date | null | undefined;
    let saleEndDateUpdate: Date | null | undefined;
    let legacyOriginalPrice: number | null | undefined;
    let legacySalePrice: number | null | undefined;

    if (isSettingSale) {
      const salePriceNum = Number(dto.salePrice);
      const originalNum =
        dto.originalPrice != null ? Number(dto.originalPrice) : currentPrice;
      priceUpdate = salePriceNum;
      oldPriceUpdate = originalNum;
      saleStartDateUpdate =
        dto.saleStartDate != null && dto.saleStartDate !== ""
          ? new Date(dto.saleStartDate as string)
          : undefined;
      saleEndDateUpdate =
        dto.saleEndDate != null && dto.saleEndDate !== ""
          ? new Date(dto.saleEndDate as string)
          : undefined;
      legacyOriginalPrice = originalNum;
      legacySalePrice = salePriceNum;
    } else if (isClearingSale) {
      priceUpdate =
        dto.price !== undefined
          ? Number(dto.price)
          : (currentOldPrice ?? currentPrice);
      oldPriceUpdate = null;
      saleStartDateUpdate = null;
      saleEndDateUpdate = null;
      legacyOriginalPrice = null;
      legacySalePrice = null;
    } else {
      // Not setting a sale: update normal price and clear any previous sale so old price does not stick as "indirimli"
      if (dto.price !== undefined) priceUpdate = Number(dto.price);
      oldPriceUpdate = null;
      legacyOriginalPrice = null;
      legacySalePrice = null;
      saleStartDateUpdate = null;
      saleEndDateUpdate = null;
      if (dto.saleStartDate !== undefined)
        saleStartDateUpdate =
          dto.saleStartDate == null ? null : new Date(dto.saleStartDate);
      if (dto.saleEndDate !== undefined)
        saleEndDateUpdate =
          dto.saleEndDate == null ? null : new Date(dto.saleEndDate);
    }

    const releaseDateUpdate =
      dto.year !== undefined && dto.year !== null
        ? dto.year >= 1900 && dto.year <= 2100
          ? new Date(dto.year, 0, 1)
          : null
        : undefined;

    // When client sends dto.price and we're not setting a sale, always apply it so price updates are never dropped
    const effectivePrice =
      dto.price !== undefined && !isSettingSale
        ? Number(dto.price)
        : priceUpdate !== undefined
          ? priceUpdate
          : dto.price;

    const updateData: Prisma.ProductUpdateInput = {
      title: dto.title,
      description: dto.description,
      modelCode: dto.modelCode?.trim(),
      color: dto.color?.trim(),
      isBoxed: dto.isBoxed,
      ...(effectivePrice !== undefined ? { price: effectivePrice } : {}),
      condition: dto.condition,
      // Reddedilen ürün düzenlenince otomatik yeniden incelemeye girsin (re-submit → pending).
      status: this.resolveUpdatedStatus(product, dto),
      isTradeEnabled:
        dto.isTradeEnabled !== undefined ? dto.isTradeEnabled : undefined,
      isPreorder: dto.isPreorder !== undefined ? dto.isPreorder : undefined,
      isSet: dto.isSet !== undefined ? dto.isSet : undefined,
      bundleSize:
        dto.isSet === false
          ? null
          : dto.bundleSize !== undefined
            ? dto.bundleSize
            : undefined,
      quantity:
        dto.quantity !== undefined
          ? dto.quantity === null
            ? null
            : Number(dto.quantity)
          : undefined,
      // Boyut gönderilmediyse kargo alanlarına DOKUNULMAZ (kısmi güncelleme).
      ...productShippingTierData(dto.shippingPackageTier, { partial: true }),
      category: dto.categoryId
        ? { connect: { id: dto.categoryId } }
        : undefined,
      brand: dto.brandId
        ? { connect: { id: dto.brandId } }
        : dto.brandId === null
          ? { disconnect: true }
          : undefined,
      carModel: dto.carModelId
        ? { connect: { id: dto.carModelId } }
        : dto.carModelId === null
          ? { disconnect: true }
          : undefined,
      manufacturer:
        dto.manufacturerId !== undefined
          ? dto.manufacturerId
            ? { connect: { id: dto.manufacturerId } }
            : { disconnect: true }
          : undefined,
      version: { increment: 1 },
      ...(releaseDateUpdate !== undefined
        ? { releaseDate: releaseDateUpdate }
        : {}),
      ...(oldPriceUpdate !== undefined ? { oldPrice: oldPriceUpdate } : {}),
      ...(saleStartDateUpdate !== undefined
        ? { saleStartDate: saleStartDateUpdate }
        : dto.saleStartDate !== undefined
          ? {
              saleStartDate:
                dto.saleStartDate == null ? null : new Date(dto.saleStartDate),
            }
          : {}),
      ...(saleEndDateUpdate !== undefined
        ? { saleEndDate: saleEndDateUpdate }
        : dto.saleEndDate !== undefined
          ? {
              saleEndDate:
                dto.saleEndDate == null ? null : new Date(dto.saleEndDate),
            }
          : {}),
      ...(legacyOriginalPrice !== undefined
        ? { originalPrice: legacyOriginalPrice }
        : {}),
      ...(legacySalePrice !== undefined ? { salePrice: legacySalePrice } : {}),
    };

    // Handle image updates if provided
    if (dto.images !== undefined) {
      await this.prisma.productImage.deleteMany({
        where: { productId: id },
      });

      if (dto.images.length > 0) {
        await this.prisma.productImage.createMany({
          data: dto.images.map((img, index) => ({
            productId: id,
            cardKey: img.cardKey,
            detailKey: img.detailKey,
            sortOrder: index,
          })),
        });
      }
    }

    // Check if price changed (for wishlist notifications) – compare previous selling price with new one
    const prevSellingPrice = Number(product.price);
    const newSellingPrice =
      effectivePrice !== undefined ? effectivePrice : prevSellingPrice;
    const priceChanged = prevSellingPrice !== newSellingPrice;

    // Update with optimistic locking
    try {
      const updated = await this.prisma.product.update({
        where: {
          id,
          version: product.version, // Optimistic lock check
        },
        data: updateData,
        include: {
          images: { orderBy: { sortOrder: "asc" } },
          seller: {
            select: {
              id: true,
              displayName: true,
              isVerified: true,
              sellerType: true,
            },
          },
          category: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
          brand: {
            select: {
              id: true,
              name: true,
              slug: true,
              logo: true,
            },
          },
          carModel: {
            select: {
              id: true,
              name: true,
              slug: true,
              brand: {
                select: { slug: true },
              },
            },
          },
          productAttributes: {
            include: { attribute: { include: { group: true } } },
          },
        },
      });

      if (
        dto.scale !== undefined ||
        dto.attributeIds !== undefined ||
        dto.material !== undefined ||
        dto.attributes !== undefined
      ) {
        const scaleMaterialAttrIds = await this.prisma.attribute
          .findMany({
            where: { group: { slug: { in: ["scale", "material"] } } },
            select: { id: true },
          })
          .then((a) => a.map((x) => x.id));
        if (scaleMaterialAttrIds.length > 0) {
          await this.prisma.productAttribute.deleteMany({
            where: { productId: id, attributeId: { in: scaleMaterialAttrIds } },
          });
        }
        // Also clear any prior manufacturer-scoped attribute selections so the user can
        // replace them via the update payload (matches POST create semantics).
        if (dto.attributes !== undefined) {
          const scopedAttrIds = await this.prisma.attribute
            .findMany({
              where: { group: { manufacturerSlug: { not: null } } },
              select: { id: true },
            })
            .then((a) => a.map((x) => x.id));
          if (scopedAttrIds.length > 0) {
            await this.prisma.productAttribute.deleteMany({
              where: { productId: id, attributeId: { in: scopedAttrIds } },
            });
          }
        }
        await this.common.linkProductAttributes(
          id,
          dto.scale,
          dto.attributeIds,
          dto.material,
          dto.attributes,
        );
      }

      // İlan Kalite Skoru + rankTier yeniden hesapla (foto/açıklama değişmiş olabilir)
      await this.ranking.recomputeProductRanking(id).catch(() => {});

      // Invalidate cache for this product and product lists
      await this.cache.del(`products:detail:${id}`);
      await this.cache.delPattern("products:list:*");

      // Arama index'ini güncel durum/stok/skora göre senkronla: listelenebilir
      // ise indexle (scale/material/ranking güncel), değilse (pasife alındı vb.)
      // ES'ten kaldır. Recompute + cache invalidation sonrası çağrılır.
      this.searchService
        .syncProduct(id)
        .catch((err) =>
          this.logger.warn(`ES sync failed for ${id}: ${err?.message}`),
        );

      // Web ISR'yi anında tazele: fiyat/indirim değişimi ana sayfa rail'lerine +
      // ürün sayfasına hemen yansısın (WEB_REVALIDATE_URL yoksa no-op).
      void notifyWebRevalidate(["products:list", `product:${id}`]);

      // If price changed, notify users who have this product in their wishlist
      if (priceChanged && updated.status === ProductStatus.active) {
        try {
          await this.notifyWishlistUsersOfPriceChange(
            id,
            prevSellingPrice,
            newSellingPrice,
            updated.title,
          );
        } catch (error) {
          // Don't fail the update if notification fails
          this.logger.error(
            `Failed to notify wishlist users of price change for product ${id}:`,
            error,
          );
        }
      }

      // Stok geri geldi mi? available = quantity − reserved, 0→>0 transition'ı
      // wishlist + stockout-cancelled alıcılara haber verir.
      const beforeAvailable =
        (product.quantity ?? 0) - (product.reservedQuantity ?? 0);
      const afterAvailable =
        (updated.quantity ?? 0) - (updated.reservedQuantity ?? 0);
      if (
        beforeAvailable <= 0 &&
        afterAvailable > 0 &&
        updated.status === ProductStatus.active
      ) {
        this.notificationService
          .broadcastBackInStock(id, updated.title)
          .catch((err) =>
            this.logger.warn(
              `broadcastBackInStock failed for ${id}: ${err?.message}`,
            ),
          );
      }

      // Refetch product after attribute linking so response includes updated scale/material
      const toReturn =
        dto.scale !== undefined ||
        dto.attributeIds !== undefined ||
        dto.material !== undefined
          ? await this.prisma.product.findUnique({
              where: { id },
              include: {
                images: { orderBy: { sortOrder: "asc" } },
                seller: {
                  select: {
                    id: true,
                    displayName: true,
                    isVerified: true,
                    sellerType: true,
                    avatarUrl: true,
                  },
                },
                category: { select: { id: true, name: true, slug: true } },
                brand: {
                  select: { id: true, name: true, slug: true, logo: true },
                },
                manufacturer: { select: { id: true, name: true, slug: true } },
                carModel: { include: { brand: { select: { slug: true } } } },
                productAttributes: {
                  include: { attribute: { include: { group: true } } },
                },
              },
            })
          : updated;

      return await this.common.formatProductResponse(toReturn ?? updated);
    } catch (error) {
      if (error.code === "P2025") {
        throw new ConflictException(
          i18nMessage("server.product.updateConflict"),
        );
      }
      throw error;
    }
  }

  /**
   * Update sonrası statüyü belirler.
   * - Reddedilen ürün düzenlenince otomatik yeniden incelemeye girsin (re-submit → pending).
   * - Stok 0'a çekilen ürün aktif kalamaz → tükendi (inactive). Aksi halde
   *   "aktif ama stoksuz" ürün listelerde stoktakilerin arasında kalır
   *   (sıralama status/inStock üzerinden yapılır) ve yeniden satışa açma
   *   akışıyla (sold/inactive → active, quantity>0 şartı) çelişir.
   */
  private resolveUpdatedStatus(
    product: { status: ProductStatus; quantity: number | null },
    dto: UpdateProductDto,
  ): ProductStatus | undefined {
    const requested = dto.status;
    const newQuantity =
      dto.quantity !== undefined
        ? dto.quantity === null
          ? null
          : Number(dto.quantity)
        : product.quantity;

    // Satıcı kendi ilanını pasife alabilir.
    if (requested === ProductStatus.inactive) {
      return ProductStatus.inactive;
    }

    // Reddedilen ürün düzenlenince otomatik yeniden incelemeye girer.
    if (product.status === ProductStatus.rejected) {
      return ProductStatus.pending;
    }

    // Satıcı DOĞRUDAN aktifleştiremez: aktif olmayan bir ilanı aktif etme isteği
    // admin onayına (pending) yönlendirilir. Zaten aktif ilanda statü değişmez.
    if (
      requested === ProductStatus.active &&
      product.status !== ProductStatus.active
    ) {
      return ProductStatus.pending;
    }

    // Aktif ilanın stoğu 0'a düşerse otomatik pasif.
    if (newQuantity === 0 && product.status === ProductStatus.active) {
      return ProductStatus.inactive;
    }

    // Diğer tüm izinsiz/anlamsız statü istekleri yok sayılır (statü değişmez).
    return undefined;
  }

  /**
   * Notify users who have this product in their wishlist about price change
   * Sends both in-app notifications and emails
   */
  private async notifyWishlistUsersOfPriceChange(
    productId: string,
    oldPrice: number,
    newPrice: number,
    productTitle: string,
  ): Promise<void> {
    // Get all wishlist items for this product with user info
    const wishlistItems = await this.prisma.wishlistItem.findMany({
      where: { productId },
      include: {
        wishlist: {
          include: {
            user: true, // Get full user object to check acceptsMarketingEmails
          },
        },
      },
    });

    // Filter users who accept marketing emails for email notifications
    const usersToNotify = wishlistItems
      .map((item) => (item as any).wishlist?.user)
      .filter((user: any) => user !== null && user !== undefined);

    if (usersToNotify.length === 0) {
      return;
    }

    // Determine if price increased or decreased
    const priceChange = newPrice - oldPrice;
    const isPriceDrop = priceChange < 0;
    const priceChangePercent = ((priceChange / oldPrice) * 100).toFixed(1);

    // Send both in-app notifications and emails to each user
    for (const user of usersToNotify) {
      try {
        // 1. Send in-app notification (only for price drops)
        if (isPriceDrop) {
          await this.notificationService.createInAppNotification(
            user.id,
            NotificationType.PRICE_DROP,
            {
              productId,
              productTitle,
              // PRICE_DROP şablonu "{{oldPrice}} TL'den {{newPrice}} TL'ye" kullanıyor;
              // oldPrice eksikti → kullanıcı ham "{{oldPrice}}" görüyordu.
              oldPrice,
              newPrice,
            },
          );
        }

        // 2. Send email (only for users who accept marketing emails)
        try {
          const acceptsMarketingEmails = user.acceptsMarketingEmails === true;
          if (acceptsMarketingEmails) {
            const frontendUrl =
              process.env.FRONTEND_URL || "https://tarodan.com.tr";
            const templateData = {
              userName: user.displayName,
              productTitle,
              oldPrice,
              newPrice,
              priceChange: Math.abs(priceChange),
              priceChangePercent: Math.abs(Number(priceChangePercent)),
              isPriceDrop,
              productUrl: `${frontendUrl}/products/${productId}`,
            };
            const priceDbTemplate = await this.prisma.emailTemplate.findUnique({
              where: { key: "wishlist-price-change" },
            });
            const email = renderManagedEmailTemplate(
              "wishlist-price-change",
              { ...templateData, to: user.email },
              priceDbTemplate,
              frontendUrl,
            );

            await this.smtpProvider.sendEmail({
              to: user.email,
              subject: email.subject,
              html: email.html,
            });
          }
        } catch (emailError: any) {
          // Email failure shouldn't stop in-app notification
          this.logger.warn(
            `Failed to send price change email for user ${user.id}:`,
            emailError,
          );
        }
      } catch (error: any) {
        this.logger.error(
          `Failed to send price change notification for user ${user.id}:`,
          error,
        );
      }
    }

    this.logger.log(
      `Sent price change notifications to ${usersToNotify.length} users for product ${productId}`,
    );
  }

  /**
   * Delete product (soft delete by setting inactive)
   * DELETE /products/:id
   */
  async remove(id: string, sellerId: string): Promise<void> {
    const product = await this.prisma.product.findUnique({
      where: { id },
    });

    if (!product) {
      throw new NotFoundException(i18nMessage("server.product.notFound"));
    }

    // Verify ownership
    if (product.sellerId !== sellerId) {
      throw new ForbiddenException(
        i18nMessage("server.product.deleteForbidden"),
      );
    }

    // Cannot delete sold or reserved products
    if (
      product.status === ProductStatus.sold ||
      product.status === ProductStatus.reserved
    ) {
      throw new BadRequestException(
        i18nMessage("server.product.soldOrReservedCannotDelete"),
      );
    }

    // Soft delete: set status to deleted (pasiften AYRI state — silinen ürün
    // yeniden aktive edilemez; "pasife alma"dan farklı). Tekrar satmak için
    // satıcı yeni ilan açar.
    await this.prisma.product.update({
      where: { id },
      data: { status: ProductStatus.deleted },
    });

    // Invalidate cache
    await this.cache.del(`products:detail:${id}`);
    await this.cache.delPattern("products:list:*");
    // Invalidate user's membership limits cache to refresh listing counts
    await this.cache.del(`membership:limits:${sellerId}`);
    await this.cache.del(`membership:${sellerId}`);

    // Arama index'inden kaldır: "Kaldırıldı" durumu listelenemez. Aksi halde
    // ES dokümanı eski (active) haliyle kalıp aramada görünür ama detay 404 olur.
    this.searchService
      .syncProduct(id)
      .catch((err) =>
        this.logger.warn(`ES sync failed for ${id}: ${err?.message}`),
      );
  }
}
