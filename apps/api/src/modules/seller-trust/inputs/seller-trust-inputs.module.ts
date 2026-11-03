import { Module } from "@nestjs/common";
import { OrderModule } from "../../order/order.module";
import { RefundModule } from "../../refund/refund.module";
import { RatingModule } from "../../rating/rating.module";
import { TradeModule } from "../../trade/trade.module";
import { UserModule } from "../../user/user.module";
import { SellerTrustInputsReader } from "./seller-trust-inputs.reader";

/**
 * The seller trust input read, shared by the nightly batch and read-only
 * tools. It reads each domain through that domain's stats service, so it
 * imports those modules. Import it only from modules no domain module
 * imports (the batch's `SellerTrustJobsModule`, read-only tools), never from
 * `SellerTrustModule`, which the user module imports: that would be a cycle.
 * Deliberately not re-exported from the seller-trust barrel for the same
 * reason.
 */
@Module({
  imports: [OrderModule, RefundModule, RatingModule, TradeModule, UserModule],
  providers: [SellerTrustInputsReader],
  exports: [SellerTrustInputsReader],
})
export class SellerTrustInputsModule {}
