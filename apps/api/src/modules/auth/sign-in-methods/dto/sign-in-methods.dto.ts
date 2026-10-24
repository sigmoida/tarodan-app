import { ApiProperty } from "@nestjs/swagger";
import {
  SIGN_IN_PROVIDERS,
  type LinkedSignInProvider,
  type SignInMethods,
  type SignInProvider,
} from "@tarodan/types";

export class LinkedSignInProviderDto implements LinkedSignInProvider {
  @ApiProperty({ enum: SIGN_IN_PROVIDERS })
  provider: SignInProvider;

  @ApiProperty({
    type: String,
    nullable: true,
    description: "E-mail the provider reported at link time",
  })
  email: string | null;

  @ApiProperty({ description: "ISO 8601" })
  linkedAt: string;
}

export class SignInMethodsDto implements SignInMethods {
  @ApiProperty()
  hasPassword: boolean;

  @ApiProperty({ type: [LinkedSignInProviderDto] })
  providers: LinkedSignInProviderDto[];
}
