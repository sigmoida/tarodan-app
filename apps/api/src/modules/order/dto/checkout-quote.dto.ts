import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsString,
  IsArray,
  IsNumber,
  IsOptional,
  Min,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

export class CheckoutQuoteItemDto {
  @ApiProperty({ example: "product-uuid" })
  @IsString()
  productId: string;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  quantity?: number;
}

export class CheckoutQuoteDto {
  @ApiProperty({
    type: [CheckoutQuoteItemDto],
    description:
      "Product IDs and quantities (single item for direct buy, multiple for cart)",
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CheckoutQuoteItemDto)
  items: CheckoutQuoteItemDto[];

  @ApiPropertyOptional({
    description:
      "Applied coupon code — the quote applies it server-side (fee/tax/shipping recomputed on the discounted base) so the preview total matches the charged total.",
  })
  @IsOptional()
  @IsString()
  couponCode?: string;
}

export class CheckoutQuoteItemResponseDto {
  @ApiProperty()
  productId: string;

  @ApiProperty()
  quantity: number;

  @ApiProperty({ description: "Unit price (after sale if any)" })
  unitPrice: number;

  @ApiProperty({ description: "Line total (unitPrice * quantity)" })
  subtotal: number;

  @ApiProperty({ description: "Buyer fee for this line" })
  buyerFeeAmount: number;

  @ApiProperty({ description: "Seller fee for this line" })
  sellerFeeAmount: number;

  @ApiProperty({ description: "Net to seller for this line" })
  sellerNetAmount: number;

  @ApiPropertyOptional({ description: "Product title" })
  title?: string;
}

export class CheckoutQuoteResponseDto {
  @ApiProperty({ description: "Sum of item subtotals" })
  itemsSubtotal: number;

  @ApiProperty({ description: "Shipping cost (one per order)" })
  shippingAmount: number;

  @ApiProperty({ description: "Total buyer fee" })
  buyerFeeAmount: number;

  @ApiProperty({ description: "Total seller fee" })
  sellerFeeAmount: number;

  @ApiProperty({ description: "Total commission" })
  commissionAmount: number;

  @ApiProperty({ description: "Coupon discount applied to the eligible items" })
  couponDiscount: number;

  @ApiProperty({ description: "Total amount paid by buyer (after coupon)" })
  totalAmount: number;

  @ApiProperty({ description: "Total net to seller(s)" })
  sellerNetAmount: number;

  @ApiProperty({
    description:
      "Stable hash of the charged unit prices; echo into order-create to get 409 PRICING_CHANGED if a price/campaign moved.",
  })
  pricingHash: string;

  @ApiProperty({
    description:
      "Active shipping tariff version used by this quote; echo it into checkout submission.",
  })
  shippingTariffVersion: number;

  @ApiProperty({ type: [CheckoutQuoteItemResponseDto] })
  items: CheckoutQuoteItemResponseDto[];

  @ApiProperty({
    description: "Standard pricing breakdown (same shape as order/payment)",
    example: {
      subtotal: 250,
      shippingAmount: 29.99,
      buyerFeeAmount: 12.5,
      sellerFeeAmount: 10,
      commissionAmount: 22.5,
      totalAmount: 292.49,
      sellerNetAmount: 240,
    },
  })
  pricing: {
    subtotal: number;
    shippingAmount: number;
    buyerFeeAmount: number;
    sellerFeeAmount: number;
    commissionAmount: number;
    totalAmount: number;
    sellerNetAmount: number;
  };
}
