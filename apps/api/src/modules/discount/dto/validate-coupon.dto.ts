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
     * Tek-kullanımlık voucher kodu ise ilgili DiscountCode id'si. recordUsage'a
     * geçilir → sipariş kesinleşince kod atomik olarak "kullanıldı" işaretlenir.
     */
    voucherCodeId?: string;
  };
}
