import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsDateString, IsIn, IsOptional, IsString } from "class-validator";

import { AdminListQueryDto } from "../../../common/list";
import {
  ELOGO_INVOICE_SCOPES,
  type ElogoInvoiceScope,
} from "../finance/invoice-scope";

export class ElogoInvoiceQueryDto extends AdminListQueryDto {
  /**
   * Fatura ekranının sekmesi. Sekmeler ÇAKIŞIR (ceza faturası hem kendi
   * sekmesinde hem tarafın sekmesinde görünür) — bunlar birer görünüm, ayrık
   * kümeler değil.
   */
  @ApiPropertyOptional({ enum: ELOGO_INVOICE_SCOPES })
  @IsOptional()
  @IsIn(ELOGO_INVOICE_SCOPES)
  scope?: ElogoInvoiceScope;

  /** İşlemin gerçekleşme şekli (doğrudan satış / teklif / takas / platform hizmeti). */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  context?: string;

  /** Yalnız fatura numarasında arar — genel `search` kutusundan ayrı alan. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  invoiceNumber?: string;

  /** Fatura açıklamasında arar (ör. "komisyon", "kargo", "platform bedeli"). */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  /** Kullanıcı kodu (B010001/K010001) ya da id'si — satıcı VEYA alıcı tarafında arar. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  userCode?: string;
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
