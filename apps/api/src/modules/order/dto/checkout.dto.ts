import {
  IsUUID,
  IsOptional,
  ValidateNested,
  IsString,
  IsNotEmpty,
  IsEmail,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  Matches,
  IsInt,
  Min,
  Max,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type, Transform } from "class-transformer";

export class CheckoutAddressDto {
  @IsString()
  @IsNotEmpty()
  fullName: string;

  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsString()
  @IsNotEmpty()
  city: string;

  @IsString()
  @IsNotEmpty()
  district: string;

  @IsString()
  @IsNotEmpty()
  address: string;

  @IsString()
  @IsOptional()
  zipCode?: string;
}

export class CheckoutItemDto {
  @ApiProperty({ description: "Satın alınacak ürün ID" })
  @IsUUID("4", { message: "Geçerli bir ürün ID giriniz" })
  productId: string;

  @ApiPropertyOptional({
    description: "Adet (varsayılan 1)",
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @IsInt({ message: "Adet tam sayı olmalıdır" })
  @Min(1, { message: "Adet en az 1 olmalıdır" })
  @Max(20, { message: "Tek üründen en fazla 20 adet alınabilir" })
  quantity?: number;
}

/**
 * Batch checkout DTO — sepetteki tüm ürünler tek çağrıda, tek CheckoutGroup
 * altında sipariş edilir; tek ödeme tüm grubu kapsar.
 */
export class CheckoutDto {
  @ApiProperty({
    type: [CheckoutItemDto],
    description: "Sepet ürünleri (max 20)",
  })
  @IsArray()
  @ArrayMinSize(1, { message: "En az bir ürün gereklidir" })
  @ArrayMaxSize(20, { message: "Tek siparişte en fazla 20 ürün alınabilir" })
  @ValidateNested({ each: true })
  @Type(() => CheckoutItemDto)
  items: CheckoutItemDto[];

  @ApiProperty({
    description:
      "İstemci tarafında üretilen idempotency anahtarı (uuid). Aynı anahtarla tekrar çağrı aynı grubu döndürür.",
  })
  @IsUUID("4", { message: "Geçerli bir idempotency anahtarı giriniz" })
  idempotencyKey: string;

  @ApiPropertyOptional({ description: "Kayıtlı teslimat adresi ID" })
  @IsOptional()
  @Transform(({ value }) =>
    value === "" || value === null ? undefined : value,
  )
  @IsUUID("4", { message: "Geçerli bir teslimat adresi ID giriniz" })
  shippingAddressId?: string;

  @ApiPropertyOptional({ description: "Inline teslimat adresi" })
  @IsOptional()
  @ValidateNested()
  @Type(() => CheckoutAddressDto)
  shippingAddress?: CheckoutAddressDto;

  @ApiPropertyOptional({ description: "Kayıtlı fatura adresi ID" })
  @IsOptional()
  @Transform(({ value }) =>
    value === "" || value === null ? undefined : value,
  )
  @IsUUID("4", { message: "Geçerli bir fatura adresi ID giriniz" })
  billingAddressId?: string;

  @ApiPropertyOptional({ description: "Inline fatura adresi" })
  @IsOptional()
  @ValidateNested()
  @Type(() => CheckoutAddressDto)
  billingAddress?: CheckoutAddressDto;

  @ApiPropertyOptional({ description: "Kupon kodu" })
  @IsOptional()
  @IsString()
  @Transform(({ value }) =>
    value === "" || value === null ? undefined : value?.toUpperCase(),
  )
  couponCode?: string;

  @ApiPropertyOptional({
    description:
      "Checkout quote kargo tarife sürümü. Aktif tarife değiştiyse sipariş oluşturma 409 PRICING_CHANGED döner.",
  })
  @IsOptional()
  @IsInt()
  expectedShippingTariffVersion?: number;
}

export class GuestCheckoutGroupDto extends CheckoutDto {
  @ApiProperty({ example: "guest@example.com" })
  @IsEmail({}, { message: "Geçerli bir e-posta adresi girin" })
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    example: "123456",
    description: "6 haneli e-posta doğrulama kodu",
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{6}$/, { message: "Doğrulama kodu 6 haneli olmalıdır" })
  emailVerificationCode: string;

  @ApiProperty({ example: "+905551234567" })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiProperty({ description: "Misafir ad soyad" })
  @IsString()
  @IsNotEmpty()
  guestName: string;
}
