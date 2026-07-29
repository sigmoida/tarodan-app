import {
  IsString,
  IsNumber,
  IsOptional,
  IsEnum,
  IsArray,
  IsUUID,
  IsBoolean,
  IsInt,
  Min,
  Max,
  MinLength,
  MaxLength,
  ArrayMaxSize,
  ArrayMinSize,
  ValidateNested,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import { ProductCondition } from "@prisma/client";

export class ImageVariantDto {
  @IsString()
  cardKey: string;

  @IsString()
  detailKey: string;
}

export class CreateProductDto {
  @ApiProperty({
    example: "Vintage Star Wars Action Figure",
    description: "Product title",
  })
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(5, { message: "Başlık en az 5 karakter olmalıdır" })
  @MaxLength(200, { message: "Başlık en fazla 200 karakter olabilir" })
  title: string;

  @ApiProperty({
    example: "Original 1977 Luke Skywalker figure in excellent condition...",
    description: "Product description (30-330 characters)",
  })
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(30, { message: "Açıklama en az 30 karakter olmalıdır" })
  @MaxLength(330, { message: "Açıklama en fazla 330 karakter olabilir" })
  description: string;

  @ApiProperty({
    example: 299.99,
    description: "Product price in TRY",
  })
  @IsNumber({}, { message: "Fiyat sayı olmalıdır" })
  @Type(() => Number)
  @Min(1, { message: "Fiyat en az 1 TL olmalıdır" })
  // Max validation is handled by platform settings (min_product_price, max_product_price)
  price: number;

  @ApiProperty({
    example: "uuid-category-id",
    description: "Category ID",
  })
  @IsUUID("4", { message: "Geçerli bir kategori ID giriniz" })
  categoryId: string;

  @ApiProperty({
    enum: ProductCondition,
    example: "very_good",
    description: "Product condition",
  })
  @IsEnum(ProductCondition, { message: "Geçerli bir durum seçiniz" })
  condition: ProductCondition;

  @ApiProperty({
    example: [
      {
        cardKey: "dev/products/product-images/abc/uuid-card.webp",
        detailKey: "dev/products/product-images/abc/uuid-detail.webp",
      },
    ],
    description: "Array of image variants (cardKey, detailKey from upload)",
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImageVariantDto)
  @ArrayMinSize(3, { message: "En az 3 resim yüklenmelidir" })
  @ArrayMaxSize(10, { message: "En fazla 10 resim yüklenebilir" })
  images: Array<{ cardKey: string; detailKey: string }>;

  @ApiPropertyOptional({
    example: false,
    description:
      "Whether the product is available for trade (requires premium membership)",
  })
  @IsOptional()
  @IsBoolean({ message: "Takas durumu boolean olmalıdır" })
  isTradeEnabled?: boolean;

  @ApiPropertyOptional({
    example: false,
    description:
      "Whether this is a pre-order listing (product not yet in stock, will ship later)",
  })
  @IsOptional()
  @IsBoolean({ message: "Ön sipariş boolean olmalıdır" })
  isPreorder?: boolean;

  @ApiPropertyOptional({
    example: false,
    description:
      "Whether this is a set/bundle (multi-pack, multiple models in one listing)",
  })
  @IsOptional()
  @IsBoolean({ message: "Set/paket boolean olmalıdır" })
  isSet?: boolean;

  @ApiPropertyOptional({
    example: 5,
    description:
      "Number of pieces in the set/bundle (only relevant when isSet is true)",
  })
  @IsOptional()
  @IsInt({ message: "Set parça sayısı tam sayı olmalıdır" })
  @Min(2, { message: "Set parça sayısı en az 2 olmalıdır" })
  bundleSize?: number;

  @ApiProperty({
    example: "uuid-brand-id",
    description: "Brand ID",
  })
  @IsUUID("4", { message: "Geçerli bir marka ID giriniz" })
  brandId: string;

  @ApiProperty({
    example: "uuid-car-model-id",
    description: "Car Model ID",
  })
  @IsUUID("4", { message: "Geçerli bir model ID giriniz" })
  carModelId: string;

  @ApiProperty({
    example: "uuid-manufacturer-id",
    description: "Manufacturer ID (e.g. Hot Wheels, Matchbox)",
  })
  @IsUUID("4", { message: "Geçerli bir üretici ID giriniz" })
  manufacturerId: string;

  @ApiProperty({ example: "HKG72", description: "Manufacturer model code" })
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(1, { message: "Model kodu zorunludur" })
  @MaxLength(100, { message: "Model kodu en fazla 100 karakter olabilir" })
  modelCode: string;

  @ApiProperty({ example: "Kırmızı", description: "Product color" })
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(1, { message: "Renk zorunludur" })
  @MaxLength(80, { message: "Renk en fazla 80 karakter olabilir" })
  color: string;

  @ApiProperty({
    example: true,
    description: "Whether the product is sold with its box",
  })
  @IsBoolean({ message: "Kutulu durumu boolean olmalıdır" })
  isBoxed: boolean;

  @ApiProperty({
    example: 5,
    description:
      "Stock quantity (defaults to 1 when omitted; null for unlimited stock)",
  })
  @IsOptional()
  @IsNumber({}, { message: "Stok miktarı sayı olmalıdır" })
  @Type(() => Number)
  @Min(1, { message: "Stok miktarı en az 1 olmalıdır" })
  quantity?: number | null;

  @ApiPropertyOptional({
    example: 2,
    description:
      "Packaged shipping desi selected by the seller; admin may override it.",
    default: 1,
  })
  @IsOptional()
  @IsInt({ message: "Kargo desisi tam sayı olmalıdır" })
  @Type(() => Number)
  @Min(1, { message: "Kargo desisi en az 1 olmalıdır" })
  @Max(1000, { message: "Kargo desisi en fazla 1000 olabilir" })
  shippingDesi?: number;

  @ApiProperty({
    example: "1:64",
    description:
      'Scale (e.g. 1:64, 1/43). Stored as ProductAttribute in group "scale".',
  })
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(1, { message: "Ölçek zorunludur" })
  @MaxLength(50, { message: "Ölçek en fazla 50 karakter olabilir" })
  scale: string;

  @ApiProperty({
    example: "diecast",
    description:
      'Material slug (diecast, resin, composite, plastic). Stored as ProductAttribute in group "material".',
  })
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(1, { message: "Malzeme zorunludur" })
  @MaxLength(80, { message: "Malzeme en fazla 80 karakter olabilir" })
  material: string;

  @ApiPropertyOptional({
    example: 2023,
    description:
      "Release year of the model (e.g. 2023). Stored as releaseDate (Jan 1 of that year).",
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1900, { message: "Yıl 1900 veya sonrası olmalıdır" })
  @Max(2100, { message: "Yıl 2100 veya öncesi olmalıdır" })
  year?: number;

  @ApiPropertyOptional({
    example: ["uuid-attr-id"],
    description:
      "Additional attribute IDs. Use material slug for material instead.",
  })
  @IsOptional()
  @IsArray()
  @IsUUID("4", { each: true })
  attributeIds?: string[];

  @ApiPropertyOptional({
    example: ["treasure-hunt", "mainline", "red"],
    description:
      "Additional attribute slugs (e.g. Hot Wheels Segment/Assortment/Rarity selections). " +
      "Resolved server-side to ProductAttribute rows via Attribute.slug lookup.",
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attributes?: string[];
}
