import { IsUUID, IsNotEmpty } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { ProductStatus, ProductCondition } from "@prisma/client";

export class AddToWishlistDto {
  @ApiProperty({
    example: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    description: "Product ID (UUID format) to add to wishlist",
  })
  @IsNotEmpty({ message: "Ürün ID gereklidir" })
  @IsUUID("4", {
    message: "Geçerli bir ürün ID giriniz (UUID formatında olmalıdır)",
  })
  productId: string;
}

export class WishlistItemResponseDto {
  id: string;
  productId: string;
  productTitle: string;
  productImage?: string | null;
  productPrice: number;
  productOriginalPrice?: number;
  productCondition: ProductCondition;
  productStatus: ProductStatus;
  sellerId: string;
  sellerName: string;
  addedAt: Date;
}

export class WishlistResponseDto {
  id: string;
  userId: string;
  items: WishlistItemResponseDto[];
  totalItems: number;
  createdAt: Date;
}
