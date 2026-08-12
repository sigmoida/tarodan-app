import {
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  IsNumber,
  Min,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import type { DiscountTarget } from "@prisma/client";

export class CartItemDto {
  @ApiProperty({ description: "Ürün ID" })
  @IsString()
  productId: string;

  @ApiProperty({ description: "Miktar", example: 1 })
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  quantity: number;
}

export class ValidateCouponDto {
  @ApiProperty({ description: "Kupon kodu" })
  @IsString()
  code: string;

  @ApiPropertyOptional({
    description: "Sepet ürünleri (opsiyonel - yoksa backend cart kullanılır)",
    type: [CartItemDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CartItemDto)
  cartItems?: CartItemDto[];
}

export class ValidationResultDto {
  @ApiProperty({ description: "Kupon geçerli mi?" })
  isValid: boolean;

  @ApiPropertyOptional({ description: "Hata mesajı (geçersiz ise)" })
  error?: string;

  @ApiPropertyOptional({ description: "İndirim bilgileri (geçerli ise)" })
  discount?: {
    id: string;
    name: string;
    code: string;
    type: string;
    value: number;
    scope: string;
    estimatedDiscount: number;
    /**
     * Kupon için UYGUN (scope: seller/category/product) ürünlerin id'leri. Checkout
     * indirimi YALNIZ bu satırlara dağıtır → kapsamlı bir kupon uygun olmayan
     * satıcıların/kategorilerin payout tabanını düşürmez.
     */
    eligibleProductIds: string[];
    /**
     * Kupon indiriminin PLATFORM tarafından finanse edilen payı [0,1] (F2.4).
     * seller→0, platform→1, shared→platformFundedRatio. Checkout bu payı couponDiscount
     * ile çarpıp order.platformFundedDiscount olarak saklar (escrow'da satıcıya geri eklenir).
     */
    platformFundedShare: number;
    /**
     * Tek-kullanımlık voucher kodu ise ilgili DiscountCode id'si. recordUsage'a
     * geçilir → sipariş kesinleşince kod atomik olarak "kullanıldı" işaretlenir.
     */
    voucherCodeId?: string;
    /**
     * Kuponun İNDİRDİĞİ kalem. `product_price` klasik davranıştır (ürün tabanı
     * düşer). Bedel hedefli kuponlarda ürün fiyatına DOKUNULMAZ; kupon, komisyon /
     * hizmet bedeli / kargo payına uygulanır ve tutarı ancak bedeller hesaplandıktan
     * sonra bilinebilir (bu yüzden `estimatedDiscount` 0 döner).
     */
    target: DiscountTarget;
    /** Bedel hedefli kuponun uygulanacağı miktarı sınırlayan kalan bütçe. */
    budgetRemaining?: number | null;
    /** Kampanya tavanı — bedel kuponunda motor bunu da uygular. */
    maxDiscountAmount?: number | null;
  };
}
