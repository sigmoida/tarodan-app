import { IsOptional, IsString, IsNumber, Min, Max, IsBoolean, IsArray, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';

// =============================================================================
// Query DTOs
// =============================================================================

export class AdminCollectionQueryDto {
    @ApiPropertyOptional({ example: 'vintage' })
    @IsOptional()
    @IsString()
    search?: string;

    @ApiPropertyOptional({ example: 'uuid-user-id' })
    @IsOptional()
    @IsString()
    userId?: string;

    @ApiPropertyOptional({ example: true })
    @IsOptional()
    @Transform(({ value }) => value === 'true' || value === true)
    @IsBoolean()
    isPublic?: boolean;

    @ApiPropertyOptional({ example: true })
    @IsOptional()
    @Transform(({ value }) => value === 'true' || value === true)
    @IsBoolean()
    isFeatured?: boolean;

    @ApiPropertyOptional({ example: 1 })
    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    @Min(1)
    page?: number;

    @ApiPropertyOptional({ example: 20 })
    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    @Min(1)
    @Max(100)
    limit?: number;

    @ApiPropertyOptional({ example: 'createdAt', enum: ['createdAt', 'name', 'likeCount', 'viewCount'] })
    @IsOptional()
    @IsString()
    sortBy?: 'createdAt' | 'name' | 'likeCount' | 'viewCount';

    @ApiPropertyOptional({ example: 'desc', enum: ['asc', 'desc'] })
    @IsOptional()
    @IsString()
    sortOrder?: 'asc' | 'desc';
}

// =============================================================================
// Create/Update DTOs
// =============================================================================

export class CreateAdminCollectionDto {
    @ApiProperty({ example: 'Vintage Collection' })
    @IsString()
    name: string;

    @ApiPropertyOptional({ example: 'A collection of vintage diecast models' })
    @IsOptional()
    @IsString()
    description?: string;

    @ApiPropertyOptional({ example: true })
    @IsOptional()
    @IsBoolean()
    isPublic?: boolean;

    @ApiPropertyOptional({ example: false })
    @IsOptional()
    @IsBoolean()
    isFeatured?: boolean;

    @ApiPropertyOptional({ example: 'https://example.com/cover.jpg' })
    @IsOptional()
    @IsString()
    coverImageUrl?: string;

    @ApiPropertyOptional({ example: 'uuid-user-id' })
    @IsOptional()
    @IsString()
    @IsUUID()
    userId?: string; // Admin can create for any user or as platform collection
}

export class UpdateAdminCollectionDto {
    @ApiPropertyOptional({ example: 'Updated Collection Name' })
    @IsOptional()
    @IsString()
    name?: string;

    @ApiPropertyOptional({ example: 'Updated description' })
    @IsOptional()
    @IsString()
    description?: string;

    @ApiPropertyOptional({ example: true })
    @IsOptional()
    @IsBoolean()
    isPublic?: boolean;

    @ApiPropertyOptional({ example: true })
    @IsOptional()
    @IsBoolean()
    isFeatured?: boolean;

    @ApiPropertyOptional({ example: 'https://example.com/new-cover.jpg' })
    @IsOptional()
    @IsString()
    coverImageUrl?: string;
}

export class AddCollectionItemsDto {
    @ApiProperty({ example: ['uuid-product-1', 'uuid-product-2'] })
    @IsArray()
    @IsUUID('4', { each: true })
    productIds: string[];
}

export class SetCollectionVisibilityDto {
    @ApiProperty({ example: true })
    @IsBoolean()
    isPublic: boolean;
}

export class SetCollectionFeaturedDto {
    @ApiProperty({ example: true })
    @IsBoolean()
    isFeatured: boolean;
}

// =============================================================================
// Response DTOs
// =============================================================================

export class CollectionOwnerDto {
    id: string;
    displayName: string;
    avatarUrl?: string;
}

export class CollectionItemDto {
    id: string;
    productId?: string;
    sortOrder: number;
    product?: {
        id: string;
        title: string;
        price: number;
        images: { url: string }[];
    };
    customTitle?: string;
    customImageUrl?: string;
}

export class AdminCollectionResponseDto {
    id: string;
    name: string;
    slug: string;
    description?: string;
    coverImageUrl?: string;
    isPublic: boolean;
    isFeatured: boolean;
    viewCount: number;
    likeCount: number;
    itemCount: number;
    owner: CollectionOwnerDto;
    items?: CollectionItemDto[];
    createdAt: Date;
    updatedAt: Date;
}

export class AdminCollectionListResponseDto {
    data: AdminCollectionResponseDto[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}
