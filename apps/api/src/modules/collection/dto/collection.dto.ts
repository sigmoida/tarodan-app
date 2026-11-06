import {
  IsString,
  IsBoolean,
  IsOptional,
  IsUUID,
  IsNumber,
  IsArray,
  IsInt,
  ArrayMaxSize,
  ValidateNested,
  MaxLength,
  MinLength,
  Min,
  Max,
} from "class-validator";
import { Type } from "class-transformer";
import type { CollectionItemSummary } from "@tarodan/types";
import { FormBoolean, ListingIdField } from "../../../common/transforms";

export class CreateCollectionDto {
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  coverImageKey?: string;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean = true;

  @IsOptional()
  @IsUUID()
  categoryId?: string;
}

export class UpdateCollectionDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  coverImageKey?: string;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @IsOptional()
  @IsUUID()
  categoryId?: string | null;
}

export class AddCollectionItemDto {
  /** Product id; a listing URL segment `<slug>-<uuid>` is also accepted. */
  @ListingIdField()
  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  customTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  customDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  customBrand?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  customModel?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1900)
  @Max(2100)
  customYear?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  customScale?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  customManufacturer?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  customMaterial?: string;

  /**
   * The URL `POST /media/upload?folder=collections` returned to this user.
   * The service accepts only our own public storage URL in the caller's
   * collections folder (400 `server.collection.invalidImageUrl` otherwise);
   * that check needs the storage base and the user id, so it is not a
   * decorator. Ignored when a multipart `image` is sent.
   */
  @IsOptional()
  @IsString()
  customImageUrl?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  sortOrder?: number;

  // Multipart gövdede metin gelir ("false"); örtük dönüşüm bunu true yapardı.
  @IsOptional()
  @FormBoolean()
  @IsBoolean()
  isFeatured?: boolean;
}

export class ReorderCollectionItemDto {
  @IsUUID()
  itemId: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder: number;
}

/** Upper bound on one reorder request; it runs as one transaction. */
export const MAX_REORDER_ITEMS = 1000;

export class ReorderCollectionItemsDto {
  @IsArray()
  @ArrayMaxSize(MAX_REORDER_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => ReorderCollectionItemDto)
  items: ReorderCollectionItemDto[];
}

/** The wire shape is `CollectionItemSummary` (`@tarodan/types`); `addedAt` is serialised to ISO. */
export class CollectionItemResponseDto implements Omit<
  CollectionItemSummary,
  "addedAt"
> {
  id: string;
  productId?: string;
  productTitle: string;
  productImage?: string;
  /** Absent on a custom item: it is not for sale. */
  productPrice?: number;
  productStatus?: string;
  /** The listing's seller (null on a custom item): clients hide the heart on one's own listing. */
  sellerId?: string | null;
  sortOrder: number;
  isFeatured: boolean;
  /** Whether the listing's OWN boost is active (not an in-collection feature flag). */
  isBoosted?: boolean;
  addedAt: Date;
  isCustom: boolean;
  // Custom item fields (null when not filled in)
  customTitle?: string | null;
  customDescription?: string | null;
  customBrand?: string | null;
  customModel?: string | null;
  customYear?: number | null;
  customScale?: string | null;
  customManufacturer?: string | null;
  customMaterial?: string | null;
  customImageUrl?: string | null;
}

export class CollectionResponseDto {
  id: string;
  userId: string;
  userName: string;
  categoryId?: string | null;
  category?: { id: string; name: string; slug: string } | null;
  name: string;
  slug: string;
  description?: string;
  coverImageUrl?: string;
  isPublic: boolean;
  viewCount: number;
  likeCount: number;
  itemCount: number;
  items?: CollectionItemResponseDto[];
  isLiked?: boolean; // Whether the current user has liked this collection
  createdAt: Date;
  updatedAt: Date;
}

export class CollectionListResponseDto {
  collections: CollectionResponseDto[];
  total: number;
  page: number;
  pageSize: number;
}
