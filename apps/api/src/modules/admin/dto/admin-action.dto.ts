import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsString,
  IsEnum,
  IsOptional,
  IsUUID,
  IsInt,
  Max,
  MaxLength,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  ProductStatus,
  ProductCondition,
  ShippingPackageTierCode,
} from "@prisma/client";
import { Type } from "class-transformer";
import { IsNumber, Min } from "class-validator";

export class ApproveProductDto {
  @ApiPropertyOptional({
    example: "Ürün onaylandı",
    description: "Approval note",
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class RejectProductDto {
  @ApiProperty({
    example: "Ürün açıklaması yetersiz",
    description: "Rejection reason",
  })
  @IsString()
  @MaxLength(500)
  reason: string;
}

export class UpdateProductStatusDto {
  @ApiProperty({
    enum: ProductStatus,
    example: "active",
    description: "New product status",
  })
  @IsEnum(ProductStatus)
  status: ProductStatus;

  @ApiPropertyOptional({
    example: "Durum güncellendi",
    description: "Status change note",
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class BanUserDto {
  @ApiProperty({
    example: "Platformkurallarının ihlali",
    description: "Ban reason",
  })
  @IsString()
  @MaxLength(500)
  reason: string;
}

/** Toplu kullanıcı işlemi üst sınırı — tablo sayfa boyutuyla uyumlu; SMTP/transaction sıralı koştuğu için düşük tutuldu. */
export const BULK_USER_ACTION_MAX = 50;

/** Toplu kullanıcı işlemleri: seçili satır id'leri. */
export class BulkUserIdsDto {
  @ApiProperty({ type: [String], description: "User IDs" })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(BULK_USER_ACTION_MAX)
  @IsUUID("4", { each: true })
  ids: string[];
}

/**
 * Kuyruğa alınan toplu işlemin üst sınırı — iş SMTP'yi beklemediği için
 * `BULK_USER_ACTION_MAX`'tan yüksek olabilir. Değer admin tablosunun en büyük
 * sayfa boyutuyla aynı: bir sayfada seçilebilen her satır tek istekte geçsin.
 */
export const BULK_QUEUED_USER_ACTION_MAX = 500;

export class BulkQueuedUserIdsDto {
  @ApiProperty({ type: [String], description: "User IDs" })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(BULK_QUEUED_USER_ACTION_MAX)
  @IsUUID("4", { each: true })
  ids: string[];
}

export class BulkBanUsersDto extends BulkUserIdsDto {
  @ApiProperty({ example: "Platform kurallarının ihlali" })
  @IsString()
  @MaxLength(500)
  reason: string;
}

/** Toplu ürün işlemi üst sınırı — her id tekil onay/red çekirdeğinden sırayla geçer. */
export const BULK_PRODUCT_ACTION_MAX = 200;

/**
 * Toplu ÜRÜN işlemleri (onay/red).
 *
 * `ids` bilerek `@IsOptional()`: boş/eksik seçimin yerelleştirilmiş mesajını
 * (`server.admin.product.selectionRequired`) servis üretiyor. `@ArrayMinSize`
 * konsaydı reddi pipe yapar ve kullanıcı yerelleştirilmemiş class-validator
 * metnini görürdü. DTO'nun kattığı koruma UUID biçimi ve üst sınır;
 * `whitelist: true` de yanlış alan adını (`productIds`) zaten kırpıyor.
 */
export class BulkProductIdsDto {
  @ApiPropertyOptional({ type: [String], description: "Product IDs" })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(BULK_PRODUCT_ACTION_MAX)
  @IsUUID("4", { each: true })
  ids?: string[];
}

export class BulkApproveProductsDto extends BulkProductIdsDto {
  @ApiPropertyOptional({ example: "Toplu onay" })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class BulkRejectProductsDto extends BulkProductIdsDto {
  @ApiProperty({ example: "Görseller yetersiz" })
  @IsString()
  @MaxLength(500)
  reason: string;
}

/** Toplu tek kullanımlık kupon kodu üretimi (aralık serviste de doğrulanır). */
export class GenerateVoucherCodesDto {
  @ApiProperty({ example: 100, minimum: 1, maximum: 10000 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  count: number;

  @ApiPropertyOptional({ example: "YAZ" })
  @IsOptional()
  @IsString()
  @MaxLength(12)
  prefix?: string;
}

export class ResolveDisputeDto {
  @ApiProperty({
    example: "buyer_refund",
    description: "Resolution type",
    enum: ["buyer_refund", "seller_favor", "partial_refund", "dismissed"],
  })
  @IsString()
  resolution: "buyer_refund" | "seller_favor" | "partial_refund" | "dismissed";

  @ApiProperty({
    example: "Alıcıya iade yapılacak",
    description: "Resolution note",
  })
  @IsString()
  @MaxLength(1000)
  note: string;

  @ApiPropertyOptional({
    example: 150.0,
    description: "Kısmi iade tutarı (yalnızca partial_refund için)",
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  refundAmount?: number;
}

export class UpdateProductDto {
  @ApiPropertyOptional({ example: "iPhone 15 Pro" })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ example: "Yeni nesil iPhone..." })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 49999.99 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @ApiPropertyOptional({ example: 54999.99, nullable: true })
  @IsOptional()
  @IsNumber()
  oldPrice?: number | null;

  @ApiPropertyOptional({ example: 10, nullable: true })
  @IsOptional()
  @IsNumber()
  quantity?: number | null;

  @ApiPropertyOptional({
    enum: ShippingPackageTierCode,
    description:
      "Paket boyutu düzeltmesi (moderasyon). Desi bu seçimden türetilir; " +
      "satıcının yanlış boyut seçmesi kargo farkını platforma yıkar.",
  })
  @IsOptional()
  @IsEnum(ShippingPackageTierCode)
  shippingPackageTier?: ShippingPackageTierCode;

  @ApiPropertyOptional({ enum: ProductCondition, example: "new" })
  @IsOptional()
  @IsEnum(ProductCondition)
  condition?: ProductCondition;

  @ApiPropertyOptional({ enum: ProductStatus, example: "active" })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @ApiPropertyOptional({ example: "uuid-category-id" })
  @IsOptional()
  @IsUUID()
  categoryId?: string;
}
