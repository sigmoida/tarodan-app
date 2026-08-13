import {
  IsUUID,
  IsOptional,
  ValidateNested,
  IsString,
  IsNotEmpty,
  IsInt,
  Min,
  Matches,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type, Transform } from "class-transformer";
import { IsTrPhone } from "../../../common/validators/tr-phone";

class ShippingAddressDto {
  @IsString()
  @IsNotEmpty()
  fullName: string;

  @IsString()
  @IsTrPhone()
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

/**
 * Direct Buy DTO - Purchase product directly without going through offer
 * Used for "Buy Now" button flow
 */
export class DirectBuyDto {
  @ApiProperty({
    example: "uuid-product-id",
    description: "Product ID to purchase directly",
  })
  @IsUUID("4", { message: "Geçerli bir ürün ID giriniz" })
  productId: string;

  @ApiPropertyOptional({
    example: "uuid-shipping-address-id",
    description: "Shipping address ID (use either this or shippingAddress)",
  })
  @IsOptional()
  @Transform(({ value }) =>
    value === "" || value === null ? undefined : value,
  )
  @IsUUID("4", { message: "Geçerli bir teslimat adresi ID giriniz" })
  shippingAddressId?: string;

  @ApiPropertyOptional({
    description:
      "Shipping address object (use either this or shippingAddressId)",
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ShippingAddressDto)
  shippingAddress?: ShippingAddressDto;

  @ApiPropertyOptional({
    example: "uuid-billing-address-id",
    description:
      "Billing address ID (use either this or billingAddress object)",
  })
  @IsOptional()
  @Transform(({ value }) =>
    value === "" || value === null ? undefined : value,
  )
  @IsUUID("4", { message: "Geçerli bir fatura adresi ID giriniz" })
  billingAddressId?: string;

  @ApiPropertyOptional({
    example: "INDIRIM10",
    description: "Coupon code to apply (optional)",
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }) =>
    value === "" || value === null ? undefined : value?.toUpperCase(),
  )
  couponCode?: string;

  @ApiPropertyOptional({
    description:
      "Billing address object (use when different from shipping, no need to save in profile)",
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ShippingAddressDto)
  billingAddress?: ShippingAddressDto;

  @ApiPropertyOptional({
    description:
      "Idempotency key for carrier shipment (Sürat). Same key retries duplicate Buy Now without duplicate gönderi.",
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }) =>
    value === "" || value === null ? undefined : value,
  )
  idempotencyKey?: string;

  @ApiProperty({
    description:
      "Shipping tariff version the checkout quote was built on. If it no longer matches the active tariff, order creation returns 409 PRICING_CHANGED.",
  })
  @IsInt()
  @Min(1)
  expectedShippingTariffVersion: number;

  @ApiProperty({ description: "Commission rule-set id used by the quote" })
  @IsUUID("4")
  expectedCommissionRuleSetId: string;

  @ApiProperty({ description: "Commission rule-set version used by the quote" })
  @IsInt()
  @Min(1)
  expectedCommissionRuleSetVersion: number;

  @ApiProperty({
    description:
      "Checkout quote birim-fiyat hash'i. Ürün fiyatı/kampanya değiştiyse 409 PRICING_CHANGED.",
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-f0-9]{16}$/i, {
    message: "Geçerli checkout fiyat hash'i gönderilmelidir",
  })
  expectedPricingHash: string;
}

/**
 * Response for direct buy - includes payment URL for redirect
 */
export class DirectBuyResponseDto {
  @ApiProperty({ description: "Created order ID" })
  orderId: string;

  @ApiProperty({ description: "Order number for tracking" })
  orderNumber: string;

  @ApiProperty({ description: "Total amount to pay" })
  totalAmount: number;

  @ApiPropertyOptional({ description: "Subtotal before discounts" })
  subtotal?: number;

  @ApiPropertyOptional({ description: "Total discount applied" })
  discountAmount?: number;

  @ApiPropertyOptional({ description: "Applied coupon code" })
  appliedCouponCode?: string;

  @ApiProperty({ description: "Payment URL to redirect user" })
  paymentUrl: string;

  @ApiProperty({ description: "Payment provider being used" })
  provider: string;
}
