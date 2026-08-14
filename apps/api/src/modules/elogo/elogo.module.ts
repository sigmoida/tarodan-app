import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { BullModule } from "@nestjs/bull";
import { QUEUE_NAMES } from "../../workers/constants";
import { ElogoService, ELOGO_SOAP_CLIENT } from "./elogo.service";
import { ElogoInvoicingService } from "./elogo-invoicing.service";
import { ElogoQueryService } from "./elogo-query.service";
import { ElogoDocumentService } from "./elogo-document.service";
import { ElogoDeliveryService } from "./elogo-delivery.service";
import { ElogoSchedulerService } from "./jobs/elogo-scheduler.service";
import { ElogoScheduledProcessor } from "./jobs/elogo-scheduled.processor";
import { ElogoInvoiceController } from "./elogo-invoice.controller";
import { StorageModule } from "../storage/storage.module";
import { TaxModule } from "../tax/tax.module";
import { OrderTaxPolicyService } from "../order/pricing/order-tax-policy.service";
import { MailModule } from "../mail/mail.module";
import {
  ElogoSoapClient,
  LiveElogoSoapClient,
  StubElogoSoapClient,
} from "./elogo-soap.client";
import { scheduledProcessors } from "../../workers/scheduled-processors";

/**
 * eLogo e-Belge entegrasyon modülü.
 * Sürat Kargo modülüyle aynı desen: SOAP client factory ile (ELOGO_SOAP_MODE)
 * stub/live arasında seçilir; ElogoService dışarı export edilir.
 */
@Module({
  imports: [
    MailModule,
    ConfigModule,
    StorageModule,
    TaxModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.SCHEDULED }),
  ],
  providers: [
    {
      provide: ELOGO_SOAP_CLIENT,
      useFactory: (config: ConfigService): ElogoSoapClient => {
        const mode = config
          .get<string>("ELOGO_SOAP_MODE", "stub")
          ?.trim()
          .toLowerCase();
        return mode === "live"
          ? new LiveElogoSoapClient(config)
          : new StubElogoSoapClient(config);
      },
      inject: [ConfigService],
    },
    ElogoService,
    ElogoInvoicingService,
    ElogoQueryService,
    ElogoDocumentService,
    ElogoDeliveryService,
    ElogoSchedulerService,
    // Hizmet KDV'sinin TEK kaynağı `PlatformSetting` satırlarıdır; checkout da
    // aynı servisi okur. OrderModule'ü import etmek döngü yaratacağı için
    // (order → elogo) yalnızca Prisma'ya bağlı olan bu servis burada sağlanır.
    OrderTaxPolicyService,
    ...scheduledProcessors(ElogoScheduledProcessor),
  ],
  controllers: [ElogoInvoiceController],
  exports: [ElogoService, ElogoInvoicingService],
})
export class ElogoModule {}
