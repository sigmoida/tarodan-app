import { Module } from "@nestjs/common";
import { UserBlockService } from "./user-block.service";

/**
 * Yaprak modül: yalnız global Prisma/Cache/EventEmitter'a bağlıdır; messaging,
 * offer, trade, product, search, collection ve websocket döngüsüz import eder.
 */
@Module({
  providers: [UserBlockService],
  exports: [UserBlockService],
})
export class UserBlockModule {}
