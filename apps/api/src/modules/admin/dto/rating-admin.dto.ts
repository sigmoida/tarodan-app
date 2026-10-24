import { IsEnum, IsIn, IsOptional, IsString, IsUUID } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { RatingStatus } from "@prisma/client";
import {
  REVIEW_MODERATION_REASON_MAX_LENGTH,
  REVIEW_MODERATION_REASON_MIN_LENGTH,
  REVIEW_MODERATION_STATUSES,
  type ReviewModerationStatus,
} from "@tarodan/types";
import { AdminListQueryDto } from "../../../common/list";

/**
 * `PATCH /admin/reviews/:id/status` and `PATCH /admin/user-ratings/:id/status`:
 * hide a review (`hidden`, with a reason) or show it again (`approved`).
 * There is no way back to `pending` (post-moderation). The reason's length
 * is checked after trimming in the rating domain
 * (`normalizeModerationReason`), so the error names the rule.
 */
export class UpdateRatingStatusDto {
  @ApiProperty({
    enum: REVIEW_MODERATION_STATUSES,
    example: "hidden",
    description: "hidden = take off every public surface; approved = show",
  })
  @IsIn(REVIEW_MODERATION_STATUSES)
  status: ReviewModerationStatus;

  @ApiPropertyOptional({
    minLength: REVIEW_MODERATION_REASON_MIN_LENGTH,
    maxLength: REVIEW_MODERATION_REASON_MAX_LENGTH,
    description:
      "Required when hiding (5-500 characters after trim); an optional audit note when showing again",
  })
  @IsOptional()
  @IsString()
  reason?: string;
}

// Standard list contract (page/limit/sortBy/sortOrder/sortType); `sortBy` accepts
// both the legacy presets (newest/oldest/highest_score/lowest_score, mapped in the
// service) and any displayed column key.
export class RatingQueryDto extends AdminListQueryDto {
  @ApiPropertyOptional({
    enum: RatingStatus,
    description: "Any stored status, legacy ones (pending, rejected) too",
  })
  @IsOptional()
  @IsEnum(RatingStatus)
  status?: RatingStatus;

  @ApiPropertyOptional({ description: "Exact review id (report deep link)" })
  @IsOptional()
  @IsUUID()
  id?: string;

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
  @ApiPropertyOptional({
    enum: RatingStatus,
    description: "Any stored status, legacy ones (pending, rejected) too",
  })
  @IsOptional()
  @IsEnum(RatingStatus)
  status?: RatingStatus;

  @ApiPropertyOptional({ description: "Exact rating id (report deep link)" })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;
}
