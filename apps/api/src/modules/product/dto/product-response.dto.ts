import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ProductImageDto {
  @ApiProperty({ example: 'uuid' })
  id: string;

  @ApiProperty({ example: 'https://storage.example.com/image.jpg' })
  url: string;

  @ApiProperty({ example: 0 })
  sortOrder: number;
}

export class ProductSellerDto {
  @ApiProperty({ example: 'uuid' })
  id: string;

  @ApiProperty({ example: 'John Doe' })
  displayName: string;

  @ApiProperty({ example: true })
  isVerified: boolean;

  @ApiPropertyOptional({ example: 'verified' })
  sellerType?: string;
}

export class ProductCategoryDto {
  @ApiProperty({ example: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Action Figures' })
  name: string;

  @ApiProperty({ example: 'action-figures' })
  slug: string;
}

export class ProductResponseDto {
  @ApiProperty({ example: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Vintage Star Wars Action Figure' })
  title: string;

  @ApiPropertyOptional({ example: 'Original 1977 figure...' })
  description?: string;

  @ApiProperty({ example: 299.99 })
  price: number;

  @ApiProperty({ example: 'very_good' })
  condition: string;

  @ApiProperty({ example: 'active' })
  status: string;

  @ApiPropertyOptional({ 
    example: 5, 
    description: 'Stock quantity (null for unlimited stock)',
    nullable: true,
  })
  quantity?: number | null;

  @ApiProperty({ type: [ProductImageDto] })
  images: ProductImageDto[];

  @ApiProperty({ type: ProductSellerDto })
  seller: ProductSellerDto;

  @ApiProperty({ type: ProductCategoryDto })
  category: ProductCategoryDto;

  @ApiProperty({ example: '2024-01-15T10:30:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2024-01-15T10:30:00.000Z' })
  updatedAt: Date;
}

export class PaginatedProductsDto {
  @ApiProperty({ type: [ProductResponseDto] })
  data: ProductResponseDto[];

  @ApiProperty({
    example: {
      total: 100,
      page: 1,
      limit: 20,
      totalPages: 5,
    },
  })
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
