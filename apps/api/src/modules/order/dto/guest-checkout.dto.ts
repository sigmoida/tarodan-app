import {
  IsEmail,
  IsNotEmpty,
  IsString,
  IsOptional,
  ValidateNested,
  IsUUID,
  IsInt,
  Matches,
} from "class-validator";
import { Type } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class GuestAddressDto {
  @ApiProperty({ example: "Ali Veli" })
  @IsNotEmpty()
  @IsString()
  fullName: string;

  @ApiProperty({ example: "+905551234567" })
  @IsNotEmpty()
  @IsString()
  phone: string;

  @ApiProperty({ example: "İstanbul" })
  @IsNotEmpty()
  @IsString()
  city: string;

  @ApiProperty({ example: "Kadıköy" })
  @IsNotEmpty()
  @IsString()
  district: string;

  @ApiProperty({ example: "Caferağa Mah. Moda Cad. No:123" })
  @IsNotEmpty()
  @IsString()
  address: string;

  @ApiPropertyOptional({ example: "34710" })
  @IsOptional()
  @IsString()
  zipCode?: string;
}

export class GuestCheckoutDto {
  @ApiProperty({ description: "Product ID to purchase" })
  @IsUUID()
  @IsNotEmpty()
  productId: string;

  @ApiProperty({
    example: "guest@example.com",
    description: "Guest email for order tracking",
  })
  @IsEmail({}, { message: "Geçerli bir e-posta adresi girin" })
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    example: "123456",
    description: "6-digit code from email (misafir checkout doğrulama)",
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{6}$/, { message: "Doğrulama kodu 6 haneli olmalıdır" })
  emailVerificationCode: string;

  @ApiProperty({ example: "+905551234567", description: "Guest phone number" })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiProperty({ description: "Full name of the guest" })
  @IsString()
  @IsNotEmpty()
  guestName: string;

  @ApiProperty({ type: GuestAddressDto })
  @ValidateNested()
  @Type(() => GuestAddressDto)
  shippingAddress: GuestAddressDto;

  @ApiPropertyOptional({
    type: GuestAddressDto,
    description: "Billing address (uses shipping if not provided)",
  })
  @ValidateNested()
  @Type(() => GuestAddressDto)
  @IsOptional()
  billingAddress?: GuestAddressDto;

  @ApiPropertyOptional({
    description: "Offer ID if purchasing with an accepted offer",
  })
  @IsUUID()
  @IsOptional()
  offerId?: string;

  // NOTE: no client-supplied `price` field — the server always derives the
  // amount from the product (or accepted offer). A client "override price" here
  // was a price-tampering hole (pay ~1 TL for anything). Do not re-add it.

  @ApiPropertyOptional({
    description:
      "Idempotency key for carrier shipment when Sürat integration is enabled",
  })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @ApiPropertyOptional({
    description:
      "Shipping tariff version the quote was built on; 409 PRICING_CHANGED if it changed.",
  })
  @IsOptional()
  @IsInt()
  expectedShippingTariffVersion?: number;

  @ApiPropertyOptional({
    description:
      "Checkout quote birim-fiyat hash'i. Ürün fiyatı/kampanya değiştiyse 409 PRICING_CHANGED.",
  })
  @IsOptional()
  @IsString()
  expectedPricingHash?: string;
}

export class GuestOrderTrackDto {
  @ApiProperty({ description: "Order number to track" })
  @IsString()
  @IsNotEmpty()
  orderNumber: string;

  @ApiProperty({ description: "Email used for the order" })
  @IsEmail({}, { message: "Geçerli bir e-posta adresi girin" })
  @IsNotEmpty()
  email: string;
}
