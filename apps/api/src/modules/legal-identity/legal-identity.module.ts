import { Module } from "@nestjs/common";
import { LegalIdentityController } from "./legal-identity.controller";
import { LegalIdentityService } from "./legal-identity.service";

/**
 * Üyenin yasal kimliği (ad, soyad, TCKN). Yaprak modül: yalnız global Prisma
 * ve Cache'e bağlıdır; auth (kayıt), user (banka hesabı) ve admin (düzeltme)
 * onu döngüsüz import eder.
 */
@Module({
  controllers: [LegalIdentityController],
  providers: [LegalIdentityService],
  exports: [LegalIdentityService],
})
export class LegalIdentityModule {}
