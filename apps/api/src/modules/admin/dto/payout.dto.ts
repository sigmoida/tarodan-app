import { IsOptional, IsString, IsIn, IsDateString } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { AdminListQueryDto } from "../../../common/list";

export class PayoutTransactionsQueryDto extends AdminListQueryDto {
  @ApiPropertyOptional({
    description: "Search by seller name, email or order number",
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: "Filter by seller ID" })
  @IsOptional()
  @IsString()
  sellerId?: string;

  @ApiPropertyOptional({ enum: ["held", "released", "cancelled"] })
  @IsOptional()
  @IsIn(["held", "released", "cancelled"])
  status?: string;

  @ApiPropertyOptional({ example: "2024-01-01" })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ example: "2024-12-31" })
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}

export class PayoutScheduleQueryDto extends AdminListQueryDto {
  @ApiPropertyOptional({
    description: "Search by seller name, email or order number",
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: "Filter by seller ID" })
  @IsOptional()
  @IsString()
  sellerId?: string;
}

export class PayoutExportQueryDto {
  @ApiPropertyOptional({ description: "Filter by seller ID" })
  @IsOptional()
  @IsString()
  sellerId?: string;

  @ApiPropertyOptional({ enum: ["held", "released", "cancelled"] })
  @IsOptional()
  @IsIn(["held", "released", "cancelled"])
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
