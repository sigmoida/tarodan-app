import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { i18nMessage } from "../../i18n";
import { PrismaService } from "../../../prisma";
import { assertValidProductImages } from "../helpers/product-image-keys";
import { CacheService } from "../../cache/cache.service";
import { SearchService } from "../../search/search.service";
import { notifyWebRevalidate } from "../../../common/helpers/revalidate";
import { NotificationService } from "../../notification/notification.service";
import { NotificationType } from "../../notification/dto";
import { SmtpProvider } from "../../mail/smtp.provider";
import { UpdateProductDto } from "../dto";
import { OfferStatus, ProductStatus, Prisma } from "@prisma/client";
import { renderManagedEmailTemplate } from "../../../common/helpers/email-template-renderer";
import { ProductCommonService } from "../product-common.service";
import { PUBLIC_IDENTITY_SELECT } from "../../../common/helpers/public-identity";
import {
  COLOR_GROUP_SLUG,
  MATERIAL_GROUP_SLUG,
  SCALE_GROUP_SLUG,
  colorColumnValue,
} from "../../../common/helpers/attribute-groups";
import { ProductRankingService } from "../ranking/product-ranking.service";
import { MembershipService } from "../../membership/membership.service";
import { productShippingTierData } from "../helpers/product-shipping-tier.helper";
import { isCorporateSellingSuspended } from "../../membership/helpers/membership.util";
import { CommissionRuleGuardService } from "../../commission/commission-rule-guard.service";
import { ModerationAiClient } from "../../moderation/moderation-ai.client";
import { OFFER_CANCEL_REASON } from "../../trade/helpers/trade-cancel-reasons";
import {
  loadProductPriceLimits,
  productPriceLimitViolation,
} from "../helpers/product-price-limits";
import { frontendUrl as resolveFrontendUrl } from "../../../config/app-urls";

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
    private readonly commissionGuard: CommissionRuleGuardService,
    // Düzenleme, oluşturma ile aynı içerik kapılarından geçer (L2).
    private readonly moderationAi: ModerationAiClient,
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
      // Mevcut görsel anahtarları: düzenlemede kullanıcının kendi eski
      // görsellerini geri gönderebilmesi için gerekli (sahiplik kontrolü).
      include: { images: { select: { cardKey: true, detailKey: true } } },
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
      select: {
        isBanned: true,
        businessStatus: true,
        companyName: true,
        taxId: true,
        membership: {
          select: {
            status: true,
            currentPeriodEnd: true,
            tier: { select: { type: true, isActive: true } },
          },
        },
      },
    });

    if (seller?.isBanned) {
      throw new ForbiddenException(
        i18nMessage("server.product.bannedCannotEdit"),
      );
    }

    // Askıdaki kurumsal satıcı ilanını pasife alabilir; satışta tutan veya
    // yeniden satışa çıkaran tüm diğer değişiklikler BUSINESS yenilenene dek kapalıdır.
    if (
      seller &&
      isCorporateSellingSuspended(seller.membership, seller) &&
      dto.status !== ProductStatus.inactive
    ) {
      throw new ForbiddenException(
        i18nMessage("server.product.corporateSalesSuspended"),
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
        // İlan limiti yeniden satışa açarken de geçerli: limit pending+active+
        // reserved sayar, sold/inactive SAYILMAZ — kontrolsüz reaktivasyon,
        // limiti aşmanın arka kapısıydı (create ile AYNI kaynak: canCreateListing).
        // Zaten sayılan (aktif) ilanın normal düzenlemesi bu daldan geçmez.
        const canReopen =
          await this.membershipService.canCreateListing(sellerId);
        if (!canReopen.allowed) {
          const limits = await this.membershipService.getUserLimits(sellerId);
          throw new ForbiddenException(
            i18nMessage("server.product.listingLimitReached", {
              tierName: limits.tierName,
              maxListings: limits.maxTotalListings,
            }),
          );
        }
        await this.commissionGuard.assertListingRuleExists({
          sellerId,
          categoryId: product.categoryId,
          amount: Number(product.price),
        });
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
      const nextCarModelId =
        dto.carModelId !== undefined ? dto.carModelId : product.carModelId;
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
        (nextCarModelId &&
          (!carModel || !carModel.isActive || carModel.brandId !== brand.id)) ||
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

    // Düzenleme, oluşturma ile AYNI içerik kapılarından geçer — onaylı ilanın
    // metni sonradan serbestçe değiştirilebiliyordu (moderasyonsuz düzenleme).
    // İlan pending'e DÜŞÜRÜLMEZ; yalnız uygunsuz içerik anında engellenir.
    if (dto.title !== undefined && dto.title !== product.title) {
      await this.moderationAi.assertTextClean(dto.title, {
        entityType: "product",
        userId: sellerId,
        field: "title",
        label: "ürün başlığı",
      });
    }
    if (
      dto.description !== undefined &&
      dto.description !== product.description
    ) {
      await this.moderationAi.assertTextClean(dto.description ?? "", {
        entityType: "product",
        userId: sellerId,
        field: "description",
        label: "ürün açıklaması",
      });
    }

    // Platform min/max fiyat limiti düzenlemede de geçerli — onaylı ilan
    // sonradan limit dışı fiyata çekilemesin (create ile aynı kaynak).
    if (dto.price !== undefined || dto.salePrice != null) {
      const priceLimits = await loadProductPriceLimits(this.prisma);
      for (const candidate of [
        dto.price !== undefined ? Number(dto.price) : null,
        dto.salePrice != null && Number(dto.salePrice) > 0
          ? Number(dto.salePrice)
          : null,
      ]) {
        if (candidate == null) continue;
        const violation = productPriceLimitViolation(candidate, priceLimits);
        if (violation?.type === "minimum") {
          throw new BadRequestException(
            i18nMessage("server.product.priceBelowMinimum", {
              minPrice: violation.limit,
            }),
          );
        }
        if (violation?.type === "maximum") {
          throw new BadRequestException(
            i18nMessage("server.product.priceAboveMaximum", {
              maxPrice: violation.limit,
            }),
          );
        }
      }
    }

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

    const resolvedStatus = this.resolveUpdatedStatus(product, dto);
    const remainsListable =
      dto.status !== ProductStatus.inactive &&
      resolvedStatus !== ProductStatus.inactive;
    if (remainsListable) {
      const nextCategoryId = dto.categoryId ?? product.categoryId;
      const nextPrice = effectivePrice ?? currentPrice;
      const nextOldPrice =
        oldPriceUpdate !== undefined ? oldPriceUpdate : currentOldPrice;
      const commissionAmounts = [nextPrice, nextOldPrice].filter(
        (value, index, values): value is number =>
          value != null && values.indexOf(value) === index,
      );
      for (const amount of commissionAmounts) {
        await this.commissionGuard.assertListingRuleExists({
          sellerId,
          categoryId: nextCategoryId,
          amount,
        });
      }
    }

    // Katalog seçimleri güncelleme yazılmadan çözülür: geçersiz bir renk yarım
    // güncelleme bırakmadan 400 döner ve denormalize `color` kolonu ürünün
    // kendi yazmasında tazelenir (ayrı bir UPDATE gerekmez).
    const attributesChanged =
      dto.scale !== undefined ||
      dto.attributeIds !== undefined ||
      dto.material !== undefined ||
      dto.colors !== undefined ||
      dto.attributes !== undefined;
    const resolvedAttributes = attributesChanged
      ? await this.common.resolveProductAttributes({
          scale: dto.scale,
          material: dto.material,
          colors: dto.colors,
          attributeIds: dto.attributeIds,
          attributeSlugs: dto.attributes,
        })
      : null;

    const updateData: Prisma.ProductUpdateInput = {
      title: dto.title,
      description: dto.description,
      modelCode:
        dto.modelCode !== undefined ? dto.modelCode?.trim() || null : undefined,
      color:
        // `dto.colors` geldiyse `resolvedAttributes` doludur — `attributesChanged`
        // aynı koşulu kapsıyor. İkinci kontrol derleyici içindir.
        dto.colors !== undefined && resolvedAttributes
          ? colorColumnValue(resolvedAttributes.colorLabels, dto.color)
          : dto.color?.trim(),
      isBoxed: dto.isBoxed,
      ...(effectivePrice !== undefined ? { price: effectivePrice } : {}),
      condition: dto.condition,
      // Reddedilen ürün düzenlenince otomatik yeniden incelemeye girsin (re-submit → pending).
      status: resolvedStatus,
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

    // Görsel doğrulaması create ile AYNI kuraldan: üyelik adet sınırı, tekrar,
    // biçim ve SAHİPLİK. Düzenleme yolunda hiçbiri uygulanmıyordu; sınırın
    // üstüne çıkmak ve başkasının yüklemesini iliştirmek mümkündü.
    if (dto.images !== undefined) {
      const imageLimits = await this.membershipService.getUserLimits(sellerId);
      assertValidProductImages(dto.images, {
        userId: sellerId,
        maxImages: imageLimits.maxImages,
        tierName: imageLimits.tierName,
        // Kullanıcının bu üründe HÂLEN duran görselleri, eski anahtar şemasında
        // olsalar bile geçerlidir.
        existingKeys: new Set(
          (product.images ?? []).flatMap(
            (img: { cardKey: string; detailKey: string }) => [
              img.cardKey,
              img.detailKey,
            ],
          ),
        ),
      });
    }

    // Check if price changed (for wishlist notifications) – compare previous selling price with new one
    const prevSellingPrice = Number(product.price);
    const newSellingPrice =
      effectivePrice !== undefined ? effectivePrice : prevSellingPrice;
    const priceChanged = prevSellingPrice !== newSellingPrice;

    // Update with optimistic locking
    try {
      // Görseller ürün güncellemesiyle AYNI transaction'da yazılır.
      // Eskiden görseller ÖNCE silinip yeniden oluşturuluyor, iyimser kilit
      // kontrolü SONRA yapılıyordu: sürüm çakışması olduğunda ürün
      // değişmemiş ama görselleri gitmiş oluyordu.
      const updated = await this.prisma.$transaction(async (tx) => {
        if (dto.images !== undefined) {
          await tx.productImage.deleteMany({ where: { productId: id } });
          if (dto.images.length > 0) {
            await tx.productImage.createMany({
              // Sıra AUTHORITATIVE: gönderilen dizinin indeksi sortOrder olur.
              data: dto.images.map((img, index) => ({
                productId: id,
                cardKey: img.cardKey,
                detailKey: img.detailKey,
                sortOrder: index,
              })),
            });
          }
        }
        return tx.product.update({
          where: {
            id,
            version: product.version, // Optimistic lock check
          },
          data: updateData,
          include: {
            images: { orderBy: { sortOrder: "asc" } },
            seller: {
              select: PUBLIC_IDENTITY_SELECT,
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
      });

      // `attributesChanged` yerine çözülmüş sonucun kendisiyle daraltılır:
      // ikisi aynı koşul, ama bu hâli `resolvedAttributes.ids` erişimini de
      // güvenli kılıyor.
      if (resolvedAttributes) {
        // Sıfırlama ALAN BAZLIDIR: yalnız payload'da gelen alanın grubu
        // temizlenir. Eskiden ölçek/malzeme birlikte siliniyordu; renk de o
        // listeye eklenseydi tek bir ölçek güncellemesi ilanın rengini
        // düşürürdü.
        const groupsToReset = [
          ...(dto.scale !== undefined ? [SCALE_GROUP_SLUG] : []),
          ...(dto.material !== undefined ? [MATERIAL_GROUP_SLUG] : []),
          ...(dto.colors !== undefined ? [COLOR_GROUP_SLUG] : []),
        ];
        if (groupsToReset.length > 0) {
          const groupAttrIds = await this.prisma.attribute
            .findMany({
              where: { group: { slug: { in: groupsToReset } } },
              select: { id: true },
            })
            .then((a) => a.map((x) => x.id));
          if (groupAttrIds.length > 0) {
            await this.prisma.productAttribute.deleteMany({
              where: { productId: id, attributeId: { in: groupAttrIds } },
            });
          }
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
        await this.common.attachProductAttributes(id, resolvedAttributes.ids);
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
                  select: PUBLIC_IDENTITY_SELECT,
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
      // P2025 = "record to update not found": another writer removed or moved
      // the row between the read and this write.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025"
      ) {
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

        // 2. Send email (only for users who accept marketing emails).
        // Yalnız fiyat DÜŞÜŞÜNDE: in-app bacağıyla aynı guard. Eskiden e-posta
        // her yönlü değişimde gidiyordu — istek listesindeki kullanıcı fiyat
        // ARTIŞINDA da "fiyat değişti" e-postası alıyordu.
        try {
          const acceptsMarketingEmails = user.acceptsMarketingEmails === true;
          if (isPriceDrop && acceptsMarketingEmails) {
            const frontendUrl = resolveFrontendUrl();
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

    // Bekleyen teklifler ANINDA gerekçeyle kapatılır — eskiden açık kalıp
    // cron'la sessizce expire oluyordu; alıcı ilan kalktığını öğrenmiyordu.
    // (Kabul zaten guard'lı; buradaki iş açık pazarlıkların temiz kapanışı.)
    try {
      const openOffers = await this.prisma.offer.findMany({
        where: { productId: id, status: OfferStatus.pending },
        select: { id: true, buyerId: true },
      });
      if (openOffers.length) {
        await this.prisma.offer.updateMany({
          where: { id: { in: openOffers.map((o) => o.id) } },
          data: {
            status: OfferStatus.cancelled,
            cancelReason: OFFER_CANCEL_REASON.listingDeleted,
          },
        });
        for (const offer of openOffers) {
          // Doğru gerekçeyle bildir: ilan SİLİNDİ (stok bitmedi). Eskiden
          // OUT_OF_STOCK şablonu gidiyor, alıcı "ürün satıldığı için iptal
          // edildi" okuyordu.
          await this.notificationService
            .notifyOfferCancelledListingRemoved(offer.buyerId, id)
            .catch((err: any) =>
              this.logger.warn(
                `offer-cancelled bildirimi başarısız (${offer.id}): ${err?.message}`,
              ),
            );
        }
      }
    } catch (err: any) {
      this.logger.warn(
        `silinen ilanın teklifleri kapatılamadı (${id}): ${err?.message}`,
      );
    }

    // Invalidate cache
    await this.cache.del(`products:detail:${id}`);
    await this.cache.delPattern("products:list:*");
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
