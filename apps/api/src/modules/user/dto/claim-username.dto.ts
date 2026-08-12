import { IsString, Matches, MaxLength, MinLength } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import {
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  USERNAME_PATTERN,
} from "../../auth/username.util";

export class ClaimUsernameDto {
  @ApiProperty({ example: "kaan.merakli" })
  @IsString()
  @MinLength(USERNAME_MIN_LENGTH)
  @MaxLength(USERNAME_MAX_LENGTH)
  @Matches(USERNAME_PATTERN)
  username: string;
}
