import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsArray, IsEnum, IsOptional, IsString } from "class-validator";
import { RefundRequestStatus } from "@prisma/client";
import { AdminListQueryDto } from "../../../common/list";

export class RefundRequestQueryDto extends AdminListQueryDto {
  @ApiPropertyOptional({
    isArray: true,
    enum: RefundRequestStatus,
    example: ["approved", "return_in_transit"],
  })
  @IsOptional()
  @IsArray()
  @IsEnum(RefundRequestStatus, { each: true })
  status?: RefundRequestStatus[];

  @ApiPropertyOptional({ example: "ahmet@example.com" })
  @IsOptional()
  @IsString()
  userSearch?: string;

  @ApiPropertyOptional({ example: "2026-01-01" })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ example: "2026-12-31" })
  @IsOptional()
  @IsString()
  to?: string;
}
