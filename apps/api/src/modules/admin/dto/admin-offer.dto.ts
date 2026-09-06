import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString, MaxLength } from "class-validator";

export class AdminCancelOfferDto {
  @ApiProperty({ description: "İptal gerekçesi (alıcı ve satıcıya iletilir)" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}
