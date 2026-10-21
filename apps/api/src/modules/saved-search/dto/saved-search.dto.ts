import { ApiProperty, ApiPropertyOptional, PickType } from "@nestjs/swagger";
import { Transform, Type, type TransformFnParams } from "class-transformer";
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

/**
 * Storage caps on the free-text filters (GET /products has none; a URL does).
 * `@MaxLength` (validator.js `isLength`) counts a surrogate pair once and
 * does not count a variation selector (U+FE0E/U+FE0F) after a character.
 */
const SEARCH_TEXT_MAX = 200;
const FILTER_TEXT_MAX = 120;
const COLOR_LIST_MAX = 500;
const ATTR_GROUPS_MAX = 2000;

/**
 * The saved query: the allow-listed `GET /products` filters with that route's
 * own validation (`PickType`), so a value `GET /products` refuses is refused
 * here too. Keys outside the allow-list (`page`, `sellerId`, `status`, ...)
 * are dropped by the global whitelist before the service sees them.
 *
 * The fields below are redeclared to add a storage cap and `RawObject`.
 * class-validator then drops the inherited validators of the same kind, so
 * each one repeats the parent's `@IsString()`; `saved-search.dto.spec.ts`
 * fails if a parent validator goes missing here. `@IsOptional()` is not of
 * that kind and stays inherited.
 */
/**
 * A JSON body can carry an object where a string filter belongs, and
 * `enableImplicitConversion` turns it into "[object Object]" before
 * `@IsString()` runs, which accepts it: the text would be stored as the
 * search, or, for `attrGroups`, dropped silently as malformed JSON (a saved
 * search broader than the one the user saw). This hands the raw object or
 * array back, so `@IsString()` refuses it with 400. A number or boolean still
 * becomes text, as it would in a `GET /products` query string.
 */
const RawObject = (): PropertyDecorator =>
  Transform(({ obj, key, value }: TransformFnParams): unknown => {
    const raw: unknown = (obj as Record<string, unknown>)[key];
    return typeof raw === "object" && raw !== null ? raw : value;
  });

export class SavedSearchQueryDto extends PickType(
  ProductQueryDto,
  SAVED_SEARCH_QUERY_KEYS,
) {
  @RawObject()
  @IsString()
  @MaxLength(SEARCH_TEXT_MAX)
  search?: string;

  @RawObject()
  @IsString()
  @MaxLength(FILTER_TEXT_MAX)
  brandId?: string;

  @RawObject()
  @IsString()
  @MaxLength(FILTER_TEXT_MAX)
  brand?: string;

  @RawObject()
  @IsString()
  @MaxLength(FILTER_TEXT_MAX)
  manufacturer?: string;

  @RawObject()
  @IsString()
  @MaxLength(FILTER_TEXT_MAX)
  scale?: string;

  @RawObject()
  @IsString()
  @MaxLength(FILTER_TEXT_MAX)
  material?: string;

  @RawObject()
  @IsString()
  @MaxLength(COLOR_LIST_MAX)
  color?: string;

  /** JSON text, as `GET /products` takes it; an object or array is a 400. */
  @RawObject()
  @IsString({
    message:
      "$property must be JSON text (a string), as GET /products takes it",
  })
  @MaxLength(ATTR_GROUPS_MAX)
  attrGroups?: string;

  @RawObject()
  @IsString()
  @MaxLength(FILTER_TEXT_MAX)
  sortBy?: ProductQueryDto["sortBy"];
}

/**
 * A string of at most `max` code points (`Array.from`), the unit
 * `savedSearchDefaultName` and `canonicalizeSavedSearchLabels` cut at, so a
 * value that passes is never cut. `@MaxLength` is close but not the same: it
 * does not count a variation selector, which `Array.from` does.
 */
function MaxCodePoints(
  max: number,
  options?: ValidationOptions,
): PropertyDecorator {
  return (target: object, propertyName: string | symbol) =>
    registerDecorator({
      name: "maxCodePoints",
      target: target.constructor,
      propertyName: String(propertyName),
      constraints: [max],
      options: {
        message: `$property must be at most ${max} characters`,
        ...options,
      },
      validator: {
        validate: (value: unknown): boolean =>
          typeof value === "string" && Array.from(value).length <= max,
      },
    });
}

/**
 * `labels`: a plain object of at most `SAVED_SEARCH_LABELS_MAX` entries whose
 * values are strings of at most `SAVED_SEARCH_LABEL_MAX` code points after
 * trimming (as `MaxCodePoints` counts) or null. Null values and keys that are
 * not in the canonical query are dropped by the service.
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
                label === null ||
                (typeof label === "string" &&
                  Array.from(label.trim()).length <= SAVED_SEARCH_LABEL_MAX),
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
  @MaxCodePoints(SAVED_SEARCH_NAME_MAX)
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
  labels?: Record<string, string | null>;
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
