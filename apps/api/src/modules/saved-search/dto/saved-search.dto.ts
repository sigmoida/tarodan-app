import { ApiProperty, ApiPropertyOptional, PickType } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  IsDefined,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
  registerDecorator,
  type ValidationOptions,
} from "class-validator";
import {
  SAVED_SEARCH_LABEL_MAX,
  SAVED_SEARCH_LABELS_MAX,
  SAVED_SEARCH_NAME_MAX,
  SAVED_SEARCH_QUERY_KEYS,
  type SavedSearch,
  type SavedSearchLabels,
  type SavedSearchQuery,
} from "@tarodan/types";
import { ProductQueryDto } from "../../product/dto/product-query.dto";

/** Storage caps on the free-text filters (GET /products has none; a URL does). */
const SEARCH_TEXT_MAX = 200;
const FILTER_TEXT_MAX = 120;
const COLOR_LIST_MAX = 500;
const ATTR_GROUPS_MAX = 2000;

/**
 * The saved query: the allow-listed `GET /products` filters with that route's
 * own validation (`PickType`), so a value `GET /products` refuses is refused
 * here too. Keys outside the allow-list (`page`, `sellerId`, `status`, ...)
 * are dropped by the global whitelist before the service sees them.
 */
export class SavedSearchQueryDto extends PickType(
  ProductQueryDto,
  SAVED_SEARCH_QUERY_KEYS,
) {
  @MaxLength(SEARCH_TEXT_MAX)
  search?: string;

  @MaxLength(FILTER_TEXT_MAX)
  brandId?: string;

  @MaxLength(FILTER_TEXT_MAX)
  brand?: string;

  @MaxLength(FILTER_TEXT_MAX)
  manufacturer?: string;

  @MaxLength(FILTER_TEXT_MAX)
  scale?: string;

  @MaxLength(FILTER_TEXT_MAX)
  material?: string;

  @MaxLength(COLOR_LIST_MAX)
  color?: string;

  @MaxLength(ATTR_GROUPS_MAX)
  attrGroups?: string;

  @MaxLength(FILTER_TEXT_MAX)
  sortBy?: ProductQueryDto["sortBy"];
}

/**
 * `labels`: a plain object of at most `SAVED_SEARCH_LABELS_MAX` string values
 * of at most `SAVED_SEARCH_LABEL_MAX` characters. Keys that are not in the
 * canonical query are dropped by the service.
 */
function IsSavedSearchLabels(options?: ValidationOptions): PropertyDecorator {
  return (target: object, propertyName: string | symbol) =>
    registerDecorator({
      name: "isSavedSearchLabels",
      target: target.constructor,
      propertyName: String(propertyName),
      options: {
        message: `labels must be an object of at most ${SAVED_SEARCH_LABELS_MAX} strings of at most ${SAVED_SEARCH_LABEL_MAX} characters`,
        ...options,
      },
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== "object" || value === null) return false;
          if (Array.isArray(value)) return false;
          const entries = Object.values(value);
          return (
            entries.length <= SAVED_SEARCH_LABELS_MAX &&
            entries.every(
              (label) =>
                typeof label === "string" &&
                label.length <= SAVED_SEARCH_LABEL_MAX,
            )
          );
        },
      },
    });
}

export class CreateSavedSearchDto {
  @ApiPropertyOptional({
    example: "Ferrari 1:18",
    maxLength: SAVED_SEARCH_NAME_MAX,
    description:
      "Trimmed. Blank or missing: the API derives the default name (or stores null).",
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @MaxLength(SAVED_SEARCH_NAME_MAX)
  name?: string;

  @ApiProperty({
    type: SavedSearchQueryDto,
    description:
      "GET /products params; only the allow-listed ones are kept (SAVED_SEARCH_QUERY_KEYS).",
  })
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => SavedSearchQueryDto)
  query: SavedSearchQueryDto;

  @ApiPropertyOptional({
    example: { categoryId: "Diecast", brandId: "Ferrari" },
    description: "Display names of the query values, keyed by the query key.",
  })
  @IsOptional()
  @IsSavedSearchLabels()
  labels?: Record<string, string>;
}

/** `GET /saved-searches` paging (clients send `limit=100`). */
export class SavedSearchListQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class SavedSearchResponseDto implements SavedSearch {
  id: string;
  name: string | null;
  query: SavedSearchQuery;
  labels: SavedSearchLabels;
  createdAt: string;
}

export class SavedSearchListResponseDto {
  data: SavedSearchResponseDto[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}
