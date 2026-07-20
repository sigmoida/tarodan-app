import { IsEnum, IsString, IsOptional } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
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

// Standard list contract (page/limit/sortBy/sortOrder/sortType); `sortBy` accepts
// both the legacy presets (newest/oldest/highest_score/lowest_score, mapped in the
// service) and any displayed column key.
export class RatingQueryDto extends AdminListQueryDto {
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
