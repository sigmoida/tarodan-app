import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString, MaxLength } from "class-validator";
import type { SetPasswordRequest } from "@tarodan/types";
import { IsPassword } from "../../../../common/validators/password";
import { REAUTH_TOKEN_MAX_LENGTH } from "../../reauth/reauth.service";

/** `POST /auth/password/set` (`SetPasswordRequest` in `@tarodan/types`). */
export class SetPasswordDto implements SetPasswordRequest {
  @ApiProperty({ description: "The new password (shared password policy)" })
  @IsPassword()
  newPassword: string;

  @ApiProperty({ description: "Step-up token from POST /auth/reauth" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(REAUTH_TOKEN_MAX_LENGTH)
  reauthToken: string;
}
