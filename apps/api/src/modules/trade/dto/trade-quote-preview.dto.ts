import {
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  Min,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { TradeItemDto } from "./create-trade.dto";

/**
 * Kaydedilmemiş bir teklifin fiyat önizlemesi. Karşı teklif düzenleyicisi
 * kullanıcı ürün ekleyip çıkardıkça maliyeti göstermek için çağırır; gövde
 * `counter` çağrısının ürün listeleriyle AYNI şekildedir, böylece ekran
 * gösterdiği fiyatı sonradan başka bir yapıya çevirmez.
 */
export class TradeQuotePreviewDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TradeItemDto)
  initiatorItems: TradeItemDto[] = [];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TradeItemDto)
  receiverItems: TradeItemDto[] = [];

  @IsOptional()
  @IsNumber()
  @Min(0)
  cashAmount?: number;

  /** Farkı hangi taraf ödüyor — verilmezse teklifi veren (initiator). */
  @IsOptional()
  @IsIn(["initiator", "receiver"])
  cashPayer?: "initiator" | "receiver";
}
