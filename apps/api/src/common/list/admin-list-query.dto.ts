import { Type } from "class-transformer";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

import {
  ADMIN_LIST_DEFAULT_LIMIT,
  ADMIN_LIST_DEFAULT_PAGE,
  ADMIN_LIST_MAX_LIMIT,
} from "./list.constants";
import type { SortDirection } from "./list.types";

export class AdminListQueryDto {
  @ApiPropertyOptional({ default: ADMIN_LIST_DEFAULT_PAGE, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = ADMIN_LIST_DEFAULT_PAGE;

  @ApiPropertyOptional({
    default: ADMIN_LIST_DEFAULT_LIMIT,
    minimum: 1,
    maximum: ADMIN_LIST_MAX_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(ADMIN_LIST_MAX_LIMIT)
  limit?: number = ADMIN_LIST_DEFAULT_LIMIT;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ enum: ["asc", "desc"] })
  @IsOptional()
  @IsIn(["asc", "desc"])
  sortOrder?: SortDirection;
}
