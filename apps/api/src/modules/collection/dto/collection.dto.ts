import {
  IsString,
  IsBoolean,
  IsOptional,
  IsUUID,
  IsNumber,
  IsArray,
  MaxLength,
  MinLength,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

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
  coverImageUrl?: string;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean = true;
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
  coverImageUrl?: string;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}

export class AddCollectionItemDto {
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
  customImageUrl?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;
}

export class ReorderCollectionItemsDto {
  @IsArray()
  items: Array<{
    itemId: string;
    sortOrder: number;
  }>;
}

export class CollectionItemResponseDto {
  id: string;
  productId?: string;
  productTitle: string;
  productImage?: string;
  productPrice?: number;
  sortOrder: number;
  isFeatured: boolean;
  addedAt: Date;
  isCustom: boolean;
  // Custom product fields
  customTitle?: string;
  customDescription?: string;
  customBrand?: string;
  customModel?: string;
  customYear?: number;
  customScale?: string;
  customImageUrl?: string;
}

export class CollectionResponseDto {
  id: string;
  userId: string;
  userName: string;
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
