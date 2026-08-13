import {
  IsString,
  IsEnum,
  IsOptional,
  IsNumber,
  IsInt,
  IsBoolean,
  Min,
  Max,
  MaxLength,
  IsNotEmpty,
  IsIn,
} from "class-validator";
import { Type } from "class-transformer";
import { MembershipTierType, SubscriptionStatus } from "@prisma/client";
import { MAX_PRODUCT_IMAGES } from "../../product/helpers/product-image-keys";

export class SubscribeDto {
  @IsEnum(MembershipTierType)
  tierType: MembershipTierType;

  @IsString()
  @IsIn(["monthly", "yearly"])
  billingPeriod: "monthly" | "yearly";
}

export class ToggleAutoRenewDto {
  @IsBoolean()
  autoRenew: boolean;
}

/**
 * Katman güncelleme gövdesi — HER İKİ admin rotasının TEK DTO'su
 * (PATCH /membership/admin/tiers/:type ve PATCH /admin/membership-tiers/:id;
 * admin modülü bu sınıfı re-export eder). Eskiden iki ayrı kopya farklı
 * kurallar uyguluyordu (görsel tavanı 20'ye karşı sınırsız, fiyat tavanı
 * bir yolda yok vb.). Alan doğrulaması burada, iş kuralları
 * MembershipTierUpdateService'te — ikisi de tek kaynak.
 */
export class UpdateMembershipTierDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1000000)
  monthlyPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(12000000)
  yearlyPrice?: number;

  // 0 geçerli bir yapılandırmadır: "ücretsiz slotu olmayan katman". Eski
  // @Min(1) bunu DTO seviyesinde yasaklıyordu (diğer rota 0'a izin veriyordu).
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxFreeListings?: number;

  // -1 = SINIRSIZ (admin UI, web üyelik sayfası ve servis doğrulaması bu
  // sözleşmeyi paylaşır). Aralığın geri kalanını (-1 ya da >= 1) servis denetler.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(-1)
  maxTotalListings?: number;

  // Tavan = ürün DTO'sunun mutlak sınırı: admin, create-product'ın kafa
  // karıştıran bir mesajla reddedeceği bir katman limiti YAPILANDIRAMAZ.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PRODUCT_IMAGES)
  maxImagesPerListing?: number;

  @IsOptional()
  @IsBoolean()
  canCreateCollections?: boolean;

  @IsOptional()
  @IsBoolean()
  canTrade?: boolean;

  @IsOptional()
  @IsBoolean()
  isAdFree?: boolean;

  // featuredListingSlots + commissionDiscount BİLEREK düzenlenemez: ilki ücretli
  // öne çıkarma paketlerine devredildi, ikincisi komisyon motoru tarafından hiç
  // okunmadı. DB kolonları (deprecated) duruyor ama admin yanıltıcı değer yazamaz.

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  sortOrder?: number;
}

export class CreateMembershipTierDto {
  @IsEnum(MembershipTierType)
  type: MembershipTierType;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  monthlyPrice: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  yearlyPrice: number;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  maxFreeListings: number;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  maxTotalListings: number;

  // Tavan güncelleme DTO'suyla AYNI kaynaktan (bkz. UpdateMembershipTierDto).
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(MAX_PRODUCT_IMAGES)
  maxImagesPerListing: number;

  @IsBoolean()
  canCreateCollections: boolean;

  @IsBoolean()
  canTrade: boolean;

  /**
   * Yükseltme/düşürme yönü katmanların sortOrder karşılaştırmasından çıkar —
   * alan yük taşır. Ayarlanamadığında yeni katman 0'a (free ile aynı sıraya)
   * düşüyor ve yön hesabı bozuluyordu.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  sortOrder?: number;

  /**
   * DEVRE DIŞI: banner'lar herkese gösterilir. Kolon geriye uyum için duruyor;
   * yeni yanıtlarda doldurulmaz ve hiçbir yerde okunmaz.
   */
  isAdFree?: boolean;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  /** DEVRE DIŞI: öne çıkarmayı ücretli paketler devraldı; değer yazılsa da okunmaz. */
  featuredListingSlots?: number;
}

export class MembershipTierResponseDto {
  id: string;
  type: MembershipTierType;
  name: string;
  description?: string;
  monthlyPrice: number;
  yearlyPrice: number;
  maxFreeListings: number;
  maxTotalListings: number;
  maxImagesPerListing: number;
  canCreateCollections: boolean;
  canTrade: boolean;
  /**
   * DEVRE DIŞI: banner'lar herkese gösterilir. Kolon geriye uyum için duruyor;
   * yeni yanıtlarda doldurulmaz ve hiçbir yerde okunmaz.
   */
  isAdFree?: boolean;
  /** DEVRE DIŞI (isAdFree gibi): yeni yanıtlarda doldurulmaz, hiçbir yerde okunmaz. */
  featuredListingSlots?: number;
  isActive: boolean;
}

export class UserMembershipResponseDto {
  id: string;
  userId: string;
  tier: MembershipTierResponseDto;
  status: SubscriptionStatus;
  autoRenew: boolean;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelledAt?: Date;
  createdAt: Date;
  /** Ödeme beklerken (past_due) yükseltilmek istenen plan adı */
  pendingTierName?: string;
  /** Ödeme niyetinin hedef plan tipi */
  pendingTierType?: MembershipTierType;
  /** Ödeme bekleniyor – üyelik sayfasında "satın alınmış" gibi gösterme */
  pendingPayment?: boolean;
  /** Ertelemeli downgrade: dönem sonunda geçilecek tier (null/yoksa bekleyen yok) */
  scheduledTierType?: MembershipTierType;
  /** Ertelemeli period değişimi: dönem sonunda geçilecek periyot ('monthly'|'yearly') */
  scheduledBillingPeriod?: string;
  paymentId?: string;
  orderId?: string;
  provider?: string;
  useBypass?: boolean;
  // Computed usage stats
  usedFreeListings: number;
  usedTotalListings: number;
  /** DEVRE DIŞI: hep 0'dı; yeni yanıtlarda doldurulmaz. */
  usedFeaturedSlots?: number;
  remainingFreeListings: number;
  remainingTotalListings: number;
  /** DEVRE DIŞI: yeni yanıtlarda doldurulmaz. */
  remainingFeaturedSlots?: number;
}

export class MembershipLimitsDto {
  canCreateListing: boolean;
  canUseFreeSlot: boolean;
  canTrade: boolean;
  canCreateCollection: boolean;
  /**
   * DEVRE DIŞI: banner'lar herkese gösterilir. Alan geriye uyum için duruyor;
   * yeni yanıtlarda doldurulmaz ve hiçbir yerde okunmaz.
   */
  isAdFree?: boolean;
  maxImages: number;
  maxFreeListings: number; // Total max free listings for tier
  maxTotalListings: number; // Total max listings for tier
  remainingFreeListings: number;
  remainingTotalListings: number;
  /** DEVRE DIŞI: yeni yanıtlarda doldurulmaz. */
  remainingFeaturedSlots?: number;
  tierName: string;
  tierType: MembershipTierType;
}

// Re-export payment DTOs
export * from "./membership-payment.dto";
