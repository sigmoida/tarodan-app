import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * Standard pricing breakdown used across order, payment, and quote responses.
 * Frontend should use this instead of computing totals locally.
 */
export class PricingBreakdownDto {
  @ApiProperty({
    example: 250.0,
    description: "Product/subtotal before shipping and buyer fee",
  })
  subtotal: number;

  @ApiProperty({ example: 29.99, description: "Shipping cost" })
  shippingAmount: number;

  @ApiProperty({ example: 12.5, description: "Platform fee paid by buyer" })
  buyerFeeAmount: number;

  @ApiProperty({
    example: 10.0,
    description: "Platform fee deducted from seller",
  })
  sellerFeeAmount: number;

  @ApiProperty({
    example: 22.5,
    description: "Total commission (buyer + seller)",
  })
  commissionAmount: number;

  @ApiProperty({
    example: 45.0,
    description:
      "KDV/VAT amount included in totalAmount. Only > 0 for corporate sellers (businessStatus=approved + taxId). Collected from buyer and passed through to the seller payout.",
  })
  taxAmount: number;

  @ApiProperty({ example: 292.49, description: "Total amount paid by buyer" })
  totalAmount: number;

  @ApiProperty({
    example: 240.0,
    description: "Net amount to seller (subtotal - sellerFeeAmount)",
  })
  sellerNetAmount: number;
}

export class OrderProductDto {
  @ApiProperty({ example: "uuid" })
  id: string;

  @ApiProperty({ example: "Vintage Star Wars Figure" })
  title: string;

  @ApiPropertyOptional({ example: "https://storage.example.com/image.jpg" })
  imageUrl?: string;

  @ApiProperty({ example: "active" })
  status: string;
}

export class OrderUserDto {
  @ApiProperty({ example: "uuid" })
  id: string;

  @ApiProperty({
    example: "kaan.merakli",
    description: "Herkese açık ad: firma adı → kullanıcı adı → isim",
  })
  publicName: string;

  @ApiProperty({
    example: "kaan.merakli",
    description: "Uyumluluk takma adı — publicName ile aynı değer",
  })
  displayName: string;

  @ApiProperty({ example: "kaan.merakli", nullable: true })
  username: string | null;

  @ApiProperty({ example: true })
  isVerified: boolean;
}

export class OrderAddressDto {
  @ApiProperty({ example: "uuid" })
  id: string;

  @ApiProperty({ example: "Ev Adresi" })
  title: string;

  @ApiProperty({ example: "Atatürk Cad. No: 123" })
  addressLine1: string;

  @ApiPropertyOptional({ example: "Daire 5" })
  addressLine2?: string;

  @ApiProperty({ example: "Kadıköy" })
  district: string;

  @ApiProperty({ example: "İstanbul" })
  city: string;

  @ApiProperty({ example: "34700" })
  postalCode: string;
}

export class OrderShipmentDto {
  @ApiProperty({ example: "uuid" })
  id: string;

  @ApiProperty({ example: "surat" })
  provider: string;

  @ApiPropertyOptional({ example: "123456789" })
  trackingNumber?: string;

  @ApiProperty({ example: "pending" })
  status: string;

  @ApiPropertyOptional({ example: 25.5 })
  cost?: number | null;
}

export class OrderItemDto {
  @ApiProperty({ example: "uuid" })
  id: string;

  @ApiProperty({ type: OrderProductDto })
  product: OrderProductDto;

  @ApiProperty({ example: 1 })
  quantity: number;

  @ApiProperty({ example: 250.0 })
  price: number;
}

export class OrderResponseDto {
  @ApiProperty({ example: "uuid" })
  id: string;

  @ApiProperty({ example: "ORD-2024-000001" })
  orderNumber: string;

  @ApiProperty({ example: 250.0 })
  amount: number;

  @ApiProperty({
    example: 262.5,
    description: "Total amount including commission",
  })
  totalAmount: number;

  @ApiProperty({ example: 12.5 })
  commissionAmount: number;

  @ApiPropertyOptional({
    type: PricingBreakdownDto,
    description: "Standard pricing breakdown",
  })
  pricing?: PricingBreakdownDto;

  @ApiPropertyOptional({
    example: 12.5,
    description: "Platform fee paid by buyer",
  })
  buyerFeeAmount?: number;

  @ApiPropertyOptional({
    example: 10.0,
    description: "Platform fee deducted from seller",
  })
  sellerFeeAmount?: number;

  @ApiPropertyOptional({ example: 29.99, description: "Shipping cost" })
  shippingCost?: number;

  @ApiProperty({ example: "pending_payment" })
  status: string;

  @ApiPropertyOptional({ type: OrderProductDto, nullable: true })
  product: OrderProductDto | null;

  @ApiPropertyOptional({
    type: [OrderItemDto],
    description: "Order items list",
  })
  items?: OrderItemDto[];

  @ApiProperty({ type: OrderUserDto })
  buyer: OrderUserDto;

  @ApiProperty({ type: OrderUserDto })
  seller: OrderUserDto;

  @ApiPropertyOptional({ type: OrderAddressDto })
  shippingAddress?: OrderAddressDto | null;

  @ApiPropertyOptional({ type: OrderAddressDto })
  billingAddress?: OrderAddressDto | null;

  @ApiPropertyOptional({ type: OrderShipmentDto })
  shipment?: OrderShipmentDto | null;

  @ApiPropertyOptional({
    example: "guest@example.com",
    description: "Guest email for guest checkout",
  })
  guestEmail?: string;

  @ApiPropertyOptional({ example: "uuid", description: "Payment ID" })
  paymentId?: string | null;

  @ApiPropertyOptional({
    example: "Please handle with care",
    description: "Order notes",
  })
  notes?: string | null;

  @ApiProperty({ example: "2024-01-15T10:30:00.000Z" })
  createdAt: Date;

  @ApiProperty({ example: "2024-01-15T10:30:00.000Z" })
  updatedAt: Date;

  @ApiPropertyOptional({
    example: true,
    description: "Whether this user is the buyer",
  })
  isBuyer?: boolean;

  @ApiPropertyOptional({
    example: false,
    description: "Whether this user is the seller",
  })
  isSeller?: boolean;
}

export class PaginatedOrdersDto {
  @ApiProperty({ type: [OrderResponseDto] })
  data: OrderResponseDto[];

  @ApiProperty({
    example: {
      total: 10,
      page: 1,
      limit: 20,
      totalPages: 1,
    },
  })
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
