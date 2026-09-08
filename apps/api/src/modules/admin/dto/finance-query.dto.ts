import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsDateString, IsOptional, IsString } from "class-validator";

import { AdminListQueryDto } from "../../../common/list";

export class ElogoInvoiceQueryDto extends AdminListQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  documentType?: string;

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

export class SellerUploadedInvoiceQueryDto extends AdminListQueryDto {
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

/**
 * Satıcı hakediş dökümü. Dönem TESLİMAT tarihine göredir — hak ediş ve fatura
 * teslimatla doğar, sipariş tarihiyle değil.
 */
export class SettlementReportQueryDto extends AdminListQueryDto {
  @ApiPropertyOptional({ description: "Teslimat tarihi başlangıcı" })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: "Teslimat tarihi bitişi" })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: "Tek satıcıya daralt" })
  @IsOptional()
  @IsString()
  sellerId?: string;

  @ApiPropertyOptional({
    description: "Koli/kayıt kodu, sipariş no, satıcı, ürün",
  })
  @IsOptional()
  @IsString()
  search?: string;
}
