import {
  IsString,
  IsArray,
  IsOptional,
  IsNumber,
  IsUUID,
  ValidateNested,
  ArrayMinSize,
  Min,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class TradeItemDto {
  @IsUUID()
  productId: string;

  @IsNumber()
  @Min(1)
  quantity: number = 1;
}

export class CreateTradeDto {
  /**
   * User ID who will receive this trade offer
   */
  @IsUUID()
  receiverId: string;

  /**
   * Products the initiator is offering
   */
  @IsArray()
  @ArrayMinSize(1, { message: 'En az 1 ürün teklif etmelisiniz' })
  @ValidateNested({ each: true })
  @Type(() => TradeItemDto)
  initiatorItems: TradeItemDto[];

  /**
   * Products the initiator wants from receiver
   */
  @IsArray()
  @ArrayMinSize(1, { message: 'En az 1 ürün talep etmelisiniz' })
  @ValidateNested({ each: true })
  @Type(() => TradeItemDto)
  receiverItems: TradeItemDto[];

  /**
   * Optional cash component to balance the trade (in TRY)
   * If positive, initiator pays to receiver
   * If negative, receiver pays to initiator
   */
  @IsOptional()
  @IsNumber()
  cashAmount?: number;

  /**
   * Optional message to receiver
   */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;

  /**
   * Teklifi başlatanın (initiator) bu takas için teslimat adresi.
   * Verilmezse varsayılan adresine düşülür.
   */
  @IsOptional()
  @IsUUID()
  shippingAddressId?: string;
}
