import {
  IsString,
  IsArray,
  IsOptional,
  IsNumber,
  IsEnum,
  IsUUID,
  ValidateNested,
  MaxLength,
  ArrayMinSize,
} from "class-validator";
import { Type } from "class-transformer";
import { TradeItemDto } from "./create-trade.dto";

export enum TradeAction {
  ACCEPT = "accept",
  REJECT = "reject",
  COUNTER = "counter",
  CANCEL = "cancel",
}

export class AcceptTradeDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;

  /**
   * Kabul edenin (receiver) bu takas için teslimat adresi.
   * Verilmezse varsayılan adresine düşülür.
   */
  @IsOptional()
  @IsUUID()
  shippingAddressId?: string;
}

export class RejectTradeDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class CounterTradeDto {
  /**
   * Products the counter-offerer (original receiver) is offering
   */
  @IsArray()
  @ArrayMinSize(1, { message: "En az 1 ürün teklif etmelisiniz" })
  @ValidateNested({ each: true })
  @Type(() => TradeItemDto)
  initiatorItems: TradeItemDto[];

  /**
   * Products the counter-offerer wants from original initiator
   */
  @IsArray()
  @ArrayMinSize(1, { message: "En az 1 ürün talep etmelisiniz" })
  @ValidateNested({ each: true })
  @Type(() => TradeItemDto)
  receiverItems: TradeItemDto[];

  /**
   * Optional cash adjustment
   */
  @IsOptional()
  @IsNumber()
  cashAmount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}

export class CancelTradeDto {
  @IsString()
  @MaxLength(500)
  reason: string;
}

export class ShipTradeDto {
  @IsOptional()
  @IsString()
  carrier?: string; // Sürat Kargo (tek kargo); değer yok sayılır, backend 'surat' kullanır

  @IsString()
  fromAddressId: string;

  @IsOptional()
  @IsString()
  trackingNumber?: string;
}

export class ConfirmTradeReceiptDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class RaiseTradeDisputeDto {
  @IsEnum(["not_as_described", "damaged", "wrong_item", "not_received"])
  reason: string;

  @IsString()
  @MaxLength(1000)
  description: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  evidenceUrls?: string[];
}

export class ResolveTradeDisputeDto {
  /**
   * İtiraz yalnız 2. kargo (depo → alıcılar) SONRASI açılabildiği için hiçbir
   * çözüm takası geri saramaz: ürünler sahiplerinde kalır, takas tamamlanır.
   * compensate_initiator/receiver mağdur tarafın kendi ödemesini iade eder ve
   * ek tazminatı ops'a işaretler; compensate_both iki taraf da mağdursa (ör.
   * her iki depo-çıkış kolisi de kayıp) İKİ tarafın ödemesini iade eder.
   * (cancel_trade/partial_refund kaldırıldı: ilki dönüş kargosu kurmadan
   * parayı iade edip envanteri yanlışlıyordu, ikincisinin kodda karşılığı
   * yoktu ve sessizce complete davranıyordu.)
   */
  @IsEnum([
    "complete_trade",
    "compensate_initiator",
    "compensate_receiver",
    "compensate_both",
  ])
  resolution: string;

  @IsString()
  @MaxLength(1000)
  notes: string;
}
