import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsString, Length, Matches } from "class-validator";

export class RequestEmailChangeDto {
  @ApiProperty({
    example: "yeni@ornek.com",
    description: "Yeni e-posta adresi",
  })
  @IsEmail({}, { message: "Geçerli bir e-posta adresi girin" })
  newEmail!: string;
}

export class VerifyEmailChangeDto {
  @ApiProperty({ example: "123456", description: "6 haneli doğrulama kodu" })
  @IsString()
  @Length(6, 6, { message: "Kod 6 haneli olmalıdır" })
  @Matches(/^\d{6}$/, { message: "Kod yalnızca rakamlardan oluşmalıdır" })
  code!: string;
}
