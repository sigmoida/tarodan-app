import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class OfferProductDto {
  @ApiProperty({ example: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Vintage Star Wars Figure' })
  title: string;

  @ApiProperty({ example: 299.99 })
  price: number;

  @ApiPropertyOptional({ example: 'https://storage.example.com/image.jpg' })
  imageUrl?: string;

  @ApiProperty({ example: 'active' })
  status: string;
}

export class OfferUserDto {
  @ApiProperty({ example: 'uuid' })
  id: string;

  @ApiProperty({ example: 'John Doe' })
  displayName: string;

  @ApiProperty({ example: true })
  isVerified: boolean;
}

export class OfferResponseDto {
  @ApiProperty({ example: 'uuid' })
  id: string;

  @ApiProperty({ example: 250.0 })
  amount: number;

  @ApiProperty({ example: 'pending' })
  status: string;

  @ApiProperty({ example: '2024-01-16T10:30:00.000Z' })
  expiresAt: Date;

  @ApiProperty({ type: OfferProductDto })
  product: OfferProductDto;

  @ApiProperty({ type: OfferUserDto })
  buyer: OfferUserDto;

  @ApiProperty({ type: OfferUserDto })
  seller: OfferUserDto;

  @ApiProperty({ example: '2024-01-15T10:30:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2024-01-15T10:30:00.000Z' })
  updatedAt: Date;

  @ApiPropertyOptional({
    example: 'uuid',
    description: 'Order ID created when offer is accepted (null if not accepted yet)',
  })
  orderId?: string | null;

  @ApiPropertyOptional({
    example: 'pending_payment',
    description: 'Status of the associated order (e.g. pending_payment, paid, preparing)',
  })
  orderStatus?: string | null;

  @ApiPropertyOptional({
    example: true,
    description: 'Whether the offer has expired',
  })
  isExpired?: boolean;

  @ApiPropertyOptional({
    example: '23:45:30',
    description: 'Time remaining until expiration',
  })
  timeRemaining?: string;
}

export class PaginatedOffersDto {
  @ApiProperty({ type: [OfferResponseDto] })
  data: OfferResponseDto[];

  @ApiProperty({
    example: {
      total: 10,
      page: 1,
      limit: 20,
      totalPages: 1,
    },
  })
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
