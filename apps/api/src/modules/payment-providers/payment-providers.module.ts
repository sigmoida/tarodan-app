import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PayTRService } from "./paytr/paytr.service";
import { PayTRCredentials } from "./paytr/paytr-credentials.service";
import { PayTRReportService } from "./paytr/paytr-report.service";
import { PayTRTransferService } from "./paytr/paytr-transfer.service";
import { PaymentProviderRegistry } from "./payment-provider.registry";

@Module({
  imports: [ConfigModule],
  providers: [
    PayTRCredentials,
    PayTRReportService,
    PayTRTransferService,
    PayTRService,
    PaymentProviderRegistry,
  ],
  // PayTRService stays exported for the few PayTR-specific call paths not yet on
  // the IPaymentProvider seam; new money-path code should inject the registry.
  exports: [PayTRService, PaymentProviderRegistry],
})
export class PaymentProvidersModule {}
