import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { MembershipTier, MembershipTierType } from "@prisma/client";
import { PrismaService } from "../../prisma";
import { AdminAuditService } from "../admin/ops/admin-audit.service";
import { i18nMessage } from "../i18n";
import { MAX_PRODUCT_IMAGES } from "../product/helpers/product-image-keys";
import { invalidateFreeTierCanTradeCache } from "./helpers/free-tier-trade.helper";

/**
 * Katman güncelleme gövdesi — alan doğrulaması DTO'da (UpdateMembershipTierDto),
 * iş kuralları burada. Facade'lar (AdminService) düz obje geçtiği için tip
 * DTO'ya değil bu arayüze bağlanır.
 */
export interface MembershipTierUpdateInput {
  name?: string;
  description?: string;
  monthlyPrice?: number;
  yearlyPrice?: number;
  maxFreeListings?: number;
  maxTotalListings?: number;
  maxImagesPerListing?: number;
  canCreateCollections?: boolean;
  canTrade?: boolean;
  isAdFree?: boolean;
  isActive?: boolean;
  sortOrder?: number;
}

/** Katmanı id (admin paneli) ya da type (membership rotası) ile adresler. */
export type MembershipTierSelector =
  { id: string } | { type: MembershipTierType };

/**
 * Üyelik katmanı güncellemesinin TEK çekirdeği. İki paralel admin rotası
 * (PATCH /admin/membership-tiers/:id ve PATCH /membership/admin/tiers/:type)
 * eskiden kopya kod taşıyordu: kurallar zamanla ayrışmıştı ve audit log ile
 * free-tier canTrade cache düşürme yalnız tek yolda vardı. Doğrulama, yazma
 * (transaction + platform ayarı senkronu), audit ve cache invalidation artık
 * yalnız buradan geçer.
 */
@Injectable()
export class MembershipTierUpdateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
  ) {}

  async updateTier(
    adminId: string,
    selector: MembershipTierSelector,
    dto: MembershipTierUpdateInput,
  ): Promise<MembershipTier> {
    const tier = await this.prisma.membershipTier.findUnique({
      where: selector,
    });

    if (!tier) {
      throw new NotFoundException(
        "type" in selector
          ? i18nMessage("server.membership.tierNotFound", {
              type: selector.type,
            })
          : "Üyelik seviyesi bulunamadı",
      );
    }

    this.assertValidTierUpdate(tier, dto);

    const oldTier = { ...tier };

    const updatedTier = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.membershipTier.update({
        // İki seçici de aynı satıra iner; yazma her zaman id üzerinden.
        where: { id: tier.id },
        data: {
          name: dto.name,
          description: dto.description,
          monthlyPrice: dto.monthlyPrice,
          yearlyPrice: dto.yearlyPrice,
          maxFreeListings: dto.maxFreeListings,
          maxTotalListings: dto.maxTotalListings,
          maxImagesPerListing: dto.maxImagesPerListing,
          canCreateCollections: dto.canCreateCollections,
          canTrade: dto.canTrade,
          isAdFree: dto.isAdFree,
          // featuredListingSlots + commissionDiscount admin tarafından
          // DÜZENLENEMEZ (ölü entitlement / motor hiç okumaz); DB kolonları
          // duruyor ama burada dokunulmaz.
          isActive: dto.isActive,
          sortOrder: dto.sortOrder,
        },
      });

      // Ücretli katmanın aylık fiyatı platform ayarıyla senkron tutulur
      // (checkout bu anahtarı okuyabilir); free için anlamsız.
      if (
        tier.type !== MembershipTierType.free &&
        dto.monthlyPrice !== undefined
      ) {
        await tx.platformSetting.upsert({
          where: { settingKey: `${tier.type}_monthly_price` },
          update: { settingValue: String(dto.monthlyPrice) },
          create: {
            settingKey: `${tier.type}_monthly_price`,
            settingValue: String(dto.monthlyPrice),
            settingType: "number",
            description: `${tier.name} monthly membership price`,
          },
        });
      }

      return updated;
    });

    // Fiyat/limit/yetki değişikliği para ve yetkilendirmeyi doğrudan etkiler:
    // audit HER İKİ rotada da zorunlu (eskiden yalnız /admin yolu yazıyordu).
    await this.audit.createRequiredAuditLog(
      adminId,
      "membership_tier_update",
      "MembershipTier",
      tier.id,
      oldTier,
      updatedTier,
    );

    // free.canTrade süreç içinde 60 sn cache'lenir (getFreeTierCanTrade);
    // değişiklik takas kapılarına ANINDA yansısın diye cache burada düşürülür.
    if (
      tier.type === MembershipTierType.free &&
      (updatedTier.canTrade !== oldTier.canTrade ||
        updatedTier.isActive !== oldTier.isActive)
    ) {
      invalidateFreeTierCanTradeCache();
    }

    return updatedTier;
  }

  /**
   * İş kuralları — iki rotanın da uyguladığı TEK küme. DTO alan doğrulaması
   * yapar ama facade'lar düz obje geçebildiği için kritik kurallar burada da
   * denetlenir (fail-closed).
   */
  private assertValidTierUpdate(
    tier: MembershipTier,
    dto: MembershipTierUpdateInput,
  ): void {
    if (!Object.values(dto).some((value) => value !== undefined)) {
      throw new BadRequestException(
        i18nMessage("server.membership.noFieldsToUpdate"),
      );
    }
    if (
      dto.maxTotalListings !== undefined &&
      dto.maxTotalListings !== -1 &&
      dto.maxTotalListings < 1
    ) {
      throw new BadRequestException(
        i18nMessage("server.membership.listingLimitRange"),
      );
    }
    // Katman limiti ürün DTO'sunun mutlak tavanını AŞAMAZ; aşarsa satıcı,
    // upload'un verdiği hakkı create'te anlaşılmaz bir mesajla kaybeder.
    if (
      dto.maxImagesPerListing !== undefined &&
      (dto.maxImagesPerListing < 1 ||
        dto.maxImagesPerListing > MAX_PRODUCT_IMAGES)
    ) {
      throw new BadRequestException(
        i18nMessage("server.membership.imageLimitRange", {
          max: MAX_PRODUCT_IMAGES,
        }),
      );
    }
    if (tier.type === MembershipTierType.free) {
      // Free katman herkesin düştüğü taban: pasifleşirse üyeliksiz kullanıcı
      // tanımsız kalır; fiyatlanırsa "ücretsiz" sözleşmesi bozulur.
      if (dto.isActive === false) {
        throw new BadRequestException(
          i18nMessage("server.membership.freeTierCannotDeactivate"),
        );
      }
      if (
        (dto.monthlyPrice !== undefined && dto.monthlyPrice !== 0) ||
        (dto.yearlyPrice !== undefined && dto.yearlyPrice !== 0)
      ) {
        throw new BadRequestException(
          i18nMessage("server.membership.freeTierPriceZero"),
        );
      }
    } else if (
      (dto.monthlyPrice !== undefined && dto.monthlyPrice <= 0) ||
      (dto.yearlyPrice !== undefined && dto.yearlyPrice <= 0)
    ) {
      throw new BadRequestException(
        i18nMessage("server.membership.paidTierPricePositive"),
      );
    }
  }
}
