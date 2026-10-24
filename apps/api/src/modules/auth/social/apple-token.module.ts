import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AppleTokenService } from "./apple-token.service";
import { AppleTokenCipher } from "./apple-token-cipher";

/**
 * Sign in with Apple token lifecycle, a leaf module. AuthModule (stores the
 * token at sign-in) and UserModule (enqueues the revocation in the account
 * deletion transaction) both import it directly. Prisma and the outbox are
 * global; no cycle.
 */
@Module({
  imports: [ConfigModule],
  providers: [AppleTokenService, AppleTokenCipher],
  exports: [AppleTokenService],
})
export class AppleTokenModule {}
