import {
  IsString,
  IsArray,
  IsOptional,
  IsNumber,
  IsEnum,
  ValidateNested,
  MaxLength,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TradeItemDto } from './create-trade.dto';

export enum TradeAction {
  ACCEPT = 'accept',
  REJECT = 'reject',
  COUNTER = 'counter',
  CANCEL = 'cancel',
}

export class AcceptTradeDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
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
  @ArrayMinSize(1, { message: 'En az 1 ürün teklif etmelisiniz' })
  @ValidateNested({ each: true })
  @Type(() => TradeItemDto)
  initiatorItems: TradeItemDto[];

  /**
   * Products the counter-offerer wants from original initiator
   */
  @IsArray()
  @ArrayMinSize(1, { message: 'En az 1 ürün talep etmelisiniz' })
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
  @IsString()
  carrier: string; // "aras", "yurtici", "mng"

  @IsString()
  fromAddressId: string;
}

export class ConfirmTradeReceiptDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class RaiseTradeDisputeDto {
  @IsEnum(['not_as_described', 'damaged', 'wrong_item', 'not_received'])
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
  @IsEnum(['complete_trade', 'cancel_trade', 'partial_refund'])
  resolution: string;

  @IsString()
  @MaxLength(1000)
  notes: string;
}
