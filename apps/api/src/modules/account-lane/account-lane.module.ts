import { Global, Module } from "@nestjs/common";
import { AccountLaneService } from "./account-lane.service";

/**
 * Global yaprak modül: şerit çözümü her katmanda (ürün sorgusu, engel kapısı,
 * checkout, finans) gerektiği için tek kez kaydedilir.
 */
@Global()
@Module({
  providers: [AccountLaneService],
  exports: [AccountLaneService],
})
export class AccountLaneModule {}
