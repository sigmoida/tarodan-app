import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString } from "class-validator";

import { AdminListQueryDto } from "../../../common/list";

export class AdminCategoryQueryDto extends AdminListQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;
}

export class AdminBrandQueryDto extends AdminCategoryQueryDto {
  @ApiPropertyOptional({ enum: ["active", "inactive"] })
  @IsOptional()
  @IsIn(["active", "inactive"])
  status?: "active" | "inactive";
}

export class AdminManufacturerQueryDto extends AdminCategoryQueryDto {}

export class AdminCarModelQueryDto extends AdminCategoryQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  brandId?: string;
}
