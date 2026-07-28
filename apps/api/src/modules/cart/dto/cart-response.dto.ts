import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CartItemResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  productId: string;

  @ApiProperty()
  productTitle: string;

  @ApiProperty()
  productImage: string | null;

  @ApiProperty()
  sellerId: string;

  @ApiProperty()
  sellerName: string;

  @ApiProperty()
  quantity: number;

  @ApiProperty({ description: "Kargoya hazır ürün paketinin desisi" })
  shippingDesi: number;

  @ApiProperty({ description: "Orijinal birim fiyat" })
  originalPrice: number;

  @ApiPropertyOptional({ description: "İndirimli birim fiyat" })
  salePrice?: number;

  @ApiProperty({ description: "Efektif birim fiyat (salePrice veya price)" })
  effectivePrice: number;

  @ApiProperty({ description: "Satır toplamı (quantity * effectivePrice)" })
  lineTotal: number;

  @ApiPropertyOptional({ description: "Ürün bazlı indirim tutarı" })
  productDiscount?: number;

  @ApiProperty({ description: "Ürün stokta mı?" })
  isAvailable: boolean;

  @ApiPropertyOptional({
    description: "Stok uyarısı (düşük stok, stokta yok vb.)",
  })
  stockWarning?: string;

  @ApiPropertyOptional({
    description:
      "Bu satırda sipariş edilebilecek maksimum adet (fiziksel stok ve sipariş-başına-maks birleşimi). Tanımsız = sınırsız stok.",
  })
  maxQuantity?: number;
}

export class AppliedDiscountDto {
  @ApiProperty()
  discountId: string;

  @ApiProperty()
  discountName: string;

  @ApiPropertyOptional()
  discountCode?: string;

  @ApiProperty()
  type: string;

  @ApiProperty()
  value: number;

  @ApiProperty()
  scope: string;

  @ApiProperty({ description: "Uygulanan indirim tutarı" })
  appliedAmount: number;

  @ApiPropertyOptional({ description: "Bu indirimden etkilenen ürün ID'leri" })
  affectedProductIds?: string[];
}

export class CartCalculationResponseDto {
  @ApiProperty({ type: [CartItemResponseDto] })
  items: CartItemResponseDto[];

  @ApiProperty({ description: "Sepetteki toplam ürün sayısı" })
  itemCount: number;

  @ApiProperty({ description: "İndirimlerden önce toplam" })
  subtotal: number;

  @ApiProperty({
    description: "Ürün bazlı indirimler toplamı (strike-through)",
  })
  productDiscountTotal: number;

  @ApiProperty({ description: "Kupon indirimi" })
  couponDiscountTotal: number;

  @ApiProperty({ description: "Otomatik kampanya indirimleri" })
  campaignDiscountTotal: number;

  @ApiProperty({ description: "Toplam indirim" })
  totalDiscount: number;

  @ApiProperty({ description: "Kargo ücreti" })
  shippingCost: number;

  @ApiProperty({ description: "Ücretsiz kargo için kalan tutar" })
  amountToFreeShipping: number;

  @ApiProperty({
    description: "Grand total (subtotal - totalDiscount + shipping)",
  })
  grandTotal: number;

  @ApiPropertyOptional({ description: "Uygulanan kupon kodu" })
  appliedCouponCode?: string;

  @ApiProperty({
    type: [AppliedDiscountDto],
    description: "Uygulanan indirimler",
  })
  appliedDiscounts: AppliedDiscountDto[];

  @ApiProperty({ type: [String], description: "Uyarılar ve bilgilendirmeler" })
  warnings: string[];
}

export class CartResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  userId: string;

  @ApiPropertyOptional()
  couponCode?: string;

  @ApiProperty()
  expiresAt: Date;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty({ type: CartCalculationResponseDto })
  calculation: CartCalculationResponseDto;
}
