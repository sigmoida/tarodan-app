import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";
import { RefundRequestStatus } from "@prisma/client";
import { AdminListQueryDto } from "../../../common/list";

export class RefundRequestQueryDto extends AdminListQueryDto {
  @ApiPropertyOptional({
    isArray: true,
    enum: RefundRequestStatus,
    example: ["approved", "return_in_transit"],
  })
  @IsOptional()
  @IsArray()
  @IsEnum(RefundRequestStatus, { each: true })
  status?: RefundRequestStatus[];

  @ApiPropertyOptional({ example: "ahmet@example.com" })
  @IsOptional()
  @IsString()
  userSearch?: string;

  @ApiPropertyOptional({ example: "2026-01-01" })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ example: "2026-12-31" })
  @IsOptional()
  @IsString()
  to?: string;
}

export class ApproveRefundRequestDto {
  @ApiPropertyOptional({
    example: "Kanıtlar incelendi, satıcı kaynaklı kusur doğrulandı.",
    maxLength: 1000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class RejectRefundRequestDto {
  @ApiProperty({
    example: "Gönderilen kanıtlar ürün kusurunu doğrulamıyor.",
    minLength: 10,
    maxLength: 1000,
  })
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  reason!: string;
}
