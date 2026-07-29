import { Type } from "class-transformer";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

import {
  ADMIN_LIST_DEFAULT_LIMIT,
  ADMIN_LIST_DEFAULT_PAGE,
  ADMIN_LIST_MAX_LIMIT,
} from "./list.constants";
import type { SortDirection, SortType } from "./list.types";

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

  @ApiPropertyOptional({ enum: ["text", "number", "date"] })
  @IsOptional()
  @IsIn(["text", "number", "date"])
  sortType?: SortType;

  /** Inclusive date-range filter (YYYY-MM-DD); applied to a resource's date
   * field (createdAt by default) via `dateRangeWhere`. */
  @ApiPropertyOptional({ description: "Date range start (YYYY-MM-DD)" })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ description: "Date range end (YYYY-MM-DD)" })
  @IsOptional()
  @IsString()
  endDate?: string;
}
