import { IsOptional, IsString, IsEnum, IsBoolean } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { DiscountScope } from "@prisma/client";
import { AdminListQueryDto } from "../../../common/list";

export class DiscountQueryDto extends AdminListQueryDto {
  @ApiPropertyOptional({ description: "Arama (isim veya kod)" })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: DiscountScope, description: "Kapsam filtresi" })
  @IsOptional()
  @IsEnum(DiscountScope)
  scope?: DiscountScope;

  @ApiPropertyOptional({ description: "Aktif durumu filtresi" })
  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: "Satıcı ID filtresi (admin için)" })
  @IsOptional()
  @IsString()
  sellerId?: string;

  @ApiPropertyOptional({ description: "Sadece kupon kodları", default: false })
  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  @IsBoolean()
  couponsOnly?: boolean;

  @ApiPropertyOptional({
    description: "Sadece otomatik kampanyalar",
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  @IsBoolean()
  autoOnly?: boolean;
}
