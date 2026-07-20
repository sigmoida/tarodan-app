import { IsEnum, IsString, IsOptional, IsNumber, Min } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { AdminListQueryDto } from "../../../common/list";

export enum RatingStatus {
  pending = "pending",
  approved = "approved",
  rejected = "rejected",
}

export class UpdateRatingStatusDto {
  @ApiProperty({
    enum: RatingStatus,
    example: "approved",
    description: "New rating status",
  })
  @IsEnum(RatingStatus)
  status: RatingStatus;
}

export class RatingQueryDto {
  @ApiPropertyOptional({ enum: RatingStatus })
  @IsOptional()
  @IsEnum(RatingStatus)
  status?: RatingStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  productId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 20;

  @ApiPropertyOptional({
    enum: ["newest", "oldest", "highest_score", "lowest_score"],
  })
  @IsOptional()
  @IsString()
  sortBy?: "newest" | "oldest" | "highest_score" | "lowest_score" = "newest";
}

export class AdminUserRatingQueryDto extends AdminListQueryDto {
  @ApiPropertyOptional({ enum: RatingStatus })
  @IsOptional()
  @IsEnum(RatingStatus)
  status?: RatingStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;
}
