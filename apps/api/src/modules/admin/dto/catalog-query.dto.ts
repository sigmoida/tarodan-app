import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsIn, IsOptional, IsString } from "class-validator";

import { AdminListQueryDto } from "../../../common/list";
import { QueryBoolean } from "../../../common/transforms";

export class AdminCategoryQueryDto extends AdminListQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;
}

/** Marka ve üretici listelerinin ortak filtreleri (durum + ilan var/yok). */
export class AdminBrandManufacturerQueryDto extends AdminCategoryQueryDto {
  @ApiPropertyOptional({ enum: ["active", "inactive"] })
  @IsOptional()
  @IsIn(["active", "inactive"])
  status?: "active" | "inactive";

  @ApiPropertyOptional({
    description:
      "true: yalnız müşterinin görebildiği (public sayımla aynı kural) ilanı olanlar; false: ilanı olmayanlar",
  })
  @IsOptional()
  @QueryBoolean()
  @IsBoolean()
  hasListings?: boolean;
}

export class AdminBrandQueryDto extends AdminBrandManufacturerQueryDto {}

export class AdminManufacturerQueryDto extends AdminBrandManufacturerQueryDto {}

export class AdminCarModelQueryDto extends AdminCategoryQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  brandId?: string;
}
