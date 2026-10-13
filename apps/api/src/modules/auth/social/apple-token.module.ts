import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AppleTokenService } from "./apple-token.service";
import { AppleTokenCipher } from "./apple-token-cipher";

/**
 * Sign in with Apple token yaşam döngüsü — yaprak modül. Girişte token'ı
 * saklayan AuthModule ve hesap silmede iptali kuyruğa yazan UserModule ikisi
 * de bunu içe aktarır (UserModule'ün koca AuthModule'e bağlanmasına gerek
 * kalmaz). Prisma ve Outbox global; döngü yok.
 */
@Module({
  imports: [ConfigModule],
  providers: [AppleTokenService, AppleTokenCipher],
  exports: [AppleTokenService],
})
export class AppleTokenModule {}
