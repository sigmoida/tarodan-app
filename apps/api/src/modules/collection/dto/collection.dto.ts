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
  @IsUUID()
  productId: string;

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
  productId: string;
  productTitle: string;
  productImage?: string;
  productPrice: number;
  sortOrder: number;
  isFeatured: boolean;
  addedAt: Date;
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
