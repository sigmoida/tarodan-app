import { ApiProperty } from "@nestjs/swagger";
import { IsString, Matches, Length } from "class-validator";
import { IsTrPhone } from "../../../common/validators/tr-phone";

export class SendPhoneCodeDto {
  @ApiProperty({ example: "+905551234567", description: "Telefon numarası" })
  @IsString()
  @IsTrPhone()
  phone!: string;
}

export class VerifyPhoneDto {
  @ApiProperty({ example: "123456", description: "6 haneli doğrulama kodu" })
  @IsString()
  @Length(6, 6, { message: "Kod 6 haneli olmalıdır" })
  @Matches(/^\d{6}$/, { message: "Kod yalnızca rakamlardan oluşmalıdır" })
  code!: string;
}
