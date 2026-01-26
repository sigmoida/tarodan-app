import {
  IsString,
  IsNumber,
  IsOptional,
  IsUUID,
  IsArray,
  Min,
  Max,
  MaxLength,
} from 'class-validator';

export class CreateUserRatingDto {
  @IsUUID()
  receiverId: string;

  @IsOptional()
  @IsUUID()
  orderId?: string;

  @IsOptional()
  @IsUUID()
  tradeId?: string;

  @IsNumber()
  @Min(1)
  @Max(5)
  score: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}

export class CreateProductRatingDto {
  @IsUUID()
  productId: string;

  @IsUUID()
  orderId: string;

  @IsNumber()
  @Min(1)
  @Max(5)
  score: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  review?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];
}

export class UserRatingResponseDto {
  id: string;
  giverId: string;
  giverName: string;
  receiverId: string;
  receiverName: string;
  orderId?: string;
  tradeId?: string;
  score: number;
  comment?: string;
  createdAt: Date;
  giver?: {
    id: string;
    displayName: string;
    avatarUrl?: string;
  };
}

export class ProductRatingResponseDto {
  id: string;
  productId: string;
  productTitle: string;
  userId: string;
  userName: string;
  orderId: string;
  score: number;
  title?: string;
  review?: string;
  images: string[];
  isVerifiedPurchase: boolean;
  helpfulCount: number;
  createdAt: Date;
}

export class UserRatingStatsDto {
  userId: string;
  totalRatings: number;
  averageScore: number;
  scoreDistribution: {
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
  };
}

export class ProductRatingStatsDto {
  productId: string;
  totalRatings: number;
  averageScore: number;
  scoreDistribution: {
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
  };
}
