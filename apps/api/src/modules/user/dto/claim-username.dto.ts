import { IsString, Matches, MaxLength, MinLength } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class ClaimUsernameDto {
  @ApiProperty({ example: "kaan.merakli" })
  @IsString()
  @MinLength(3)
  @MaxLength(30)
  @Matches(/^[a-z0-9](?:[a-z0-9._]*[a-z0-9])?$/)
  username: string;
}
