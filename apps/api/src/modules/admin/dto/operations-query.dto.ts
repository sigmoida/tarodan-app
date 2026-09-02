import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  CarrierCancellationTaskStatus,
  MessageStatus,
  OfferStatus,
  ShipmentStatus,
  TradeStatus,
} from "@prisma/client";
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsIn,
  MaxLength,
  Max,
  Min,
} from "class-validator";
import { Type } from "class-transformer";

import { ADMIN_LIST_MAX_LIMIT, AdminListQueryDto } from "../../../common/list";

export class AdminTradeQueryDto extends AdminListQueryDto {
  @ApiPropertyOptional({ enum: TradeStatus })
  @IsOptional()
  @IsEnum(TradeStatus)
  status?: TradeStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  initiatorId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  receiverId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  toDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;
}

export class AdminOfferQueryDto extends AdminListQueryDto {
  @ApiPropertyOptional({
    enum: OfferStatus,
    description:
      "Teklif durumu. `pending` yalnız süresi dolmamışları, `expired` süresi dolmuş pending'leri de kapsar.",
  })
  @IsOptional()
  @IsEnum(OfferStatus)
  status?: OfferStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  productId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ enum: ["buyer", "seller"] })
  @IsOptional()
  @IsIn(["buyer", "seller"])
  userRole?: "buyer" | "seller";

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  toDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;
}

export class AdminMessageQueryDto extends AdminListQueryDto {
  @ApiPropertyOptional({ enum: MessageStatus })
  @IsOptional()
  @IsEnum(MessageStatus)
  status?: MessageStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  toDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;
}

export class AdminShipmentQueryDto extends AdminListQueryDto {
  @ApiPropertyOptional({
    default: 20,
    minimum: 1,
    maximum: ADMIN_LIST_MAX_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(ADMIN_LIST_MAX_LIMIT)
  declare limit?: number;

  @ApiPropertyOptional({ enum: ShipmentStatus })
  @IsOptional()
  @IsEnum(ShipmentStatus)
  status?: ShipmentStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  carrierId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;
}

export class CarrierCancellationTaskQueryDto extends AdminListQueryDto {
  @ApiPropertyOptional({ enum: CarrierCancellationTaskStatus })
  @IsOptional()
  @IsEnum(CarrierCancellationTaskStatus)
  status?: CarrierCancellationTaskStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;
}

export class ResolveCarrierCancellationTaskDto {
  @ApiProperty({ enum: ["resolved", "dismissed"] })
  @IsIn(["resolved", "dismissed"])
  status!: "resolved" | "dismissed";

  @ApiProperty()
  @IsString()
  @MaxLength(1000)
  resolution!: string;
}

export class AdminRefundHistoryQueryDto extends AdminListQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
