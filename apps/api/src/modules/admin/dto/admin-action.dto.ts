import {
  IsString,
  IsEnum,
  IsOptional,
  IsUUID,
  MaxLength,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ProductStatus, ProductCondition } from "@prisma/client";
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
