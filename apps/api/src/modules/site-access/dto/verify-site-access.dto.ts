import { IsString, Length } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class VerifySiteAccessDto {
  @ApiProperty({
    example: "ABCD-2345",
    description: "Early-access invite code",
  })
  @IsString()
  @Length(4, 32)
  code: string;
}
