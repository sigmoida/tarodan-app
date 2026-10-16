import { Module } from "@nestjs/common";
import { PrismaModule } from "../../../prisma";
import { PushTokenRevocationService } from "./push-token-revocation.service";

/** Yaprak modül (yalnız Prisma) — bkz. PushTokenRevocationService. */
@Module({
  imports: [PrismaModule],
  providers: [PushTokenRevocationService],
  exports: [PushTokenRevocationService],
})
export class PushTokenModule {}
