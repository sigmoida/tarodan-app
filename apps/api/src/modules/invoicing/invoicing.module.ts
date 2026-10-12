import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { BullModule } from "@nestjs/bull";
import { QUEUE_NAMES } from "../../workers/constants";
import { ElogoService, ELOGO_SOAP_CLIENT } from "./elogo.service";
import { InvoicingService } from "./invoicing.service";
import { InvoiceQueryService } from "./invoice-query.service";
import { InvoiceDocumentService } from "./invoice-document.service";
import { InvoiceDeliveryService } from "./invoice-delivery.service";
import { InvoiceIssuingService } from "./invoice-issuing.service";
import { InvoiceReversalService } from "./invoice-reversal.service";
import { InvoiceSchedulerService } from "./jobs/invoice-scheduler.service";
import { InvoiceScheduledProcessor } from "./jobs/invoice-scheduled.processor";
import { InvoicingController } from "./invoicing.controller";
import { E_INVOICE_PROVIDER } from "./provider/e-invoice-provider";
import { ElogoInvoiceProvider } from "./provider/elogo.provider";
import { StorageModule } from "../storage/storage.module";
import { TaxModule } from "../tax/tax.module";
import { OrderTaxPolicyService } from "../order/pricing/order-tax-policy.service";
import { MailModule } from "../mail/mail.module";
import { NotificationModule } from "../notification/notification.module";
import {
  ElogoSoapClient,
  LiveElogoSoapClient,
  StubElogoSoapClient,
} from "./elogo-soap.client";
import { scheduledProcessors } from "../../workers/scheduled-processors";

/**
 * Gelir e-belgeleri (e-Arşiv / e-Fatura) modülü — kesim, gönderim, ters kayıt,
 * sorgu ve PDF teslimi. Alan servisleri entegratörü `E_INVOICE_PROVIDER` portu
 * üzerinden görür; bugün tek bağlama eLogo'dur (docs/INVOICING_PROVIDERS.md).
 *
 * eLogo adaptörü Sürat Kargo modülüyle aynı deseni izler: SOAP client factory
 * ile (ELOGO_SOAP_MODE) stub/live arasında seçilir; ElogoService dışarı export
 * edilir.
 */
@Module({
  imports: [
    MailModule,
    // Deneme bütçesi tükenen belgeler admin'e in-app alarm olarak düşer.
    NotificationModule,
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
    ElogoInvoiceProvider,
    { provide: E_INVOICE_PROVIDER, useExisting: ElogoInvoiceProvider },
    InvoicingService,
    InvoiceQueryService,
    InvoiceDocumentService,
    InvoiceDeliveryService,
    InvoiceIssuingService,
    InvoiceReversalService,
    InvoiceSchedulerService,
    // Hizmet KDV'sinin TEK kaynağı `PlatformSetting` satırlarıdır; checkout da
    // aynı servisi okur. OrderModule'ü import etmek döngü yaratacağı için
    // (order → invoicing) yalnızca Prisma'ya bağlı olan bu servis burada sağlanır.
    OrderTaxPolicyService,
    ...scheduledProcessors(InvoiceScheduledProcessor),
  ],
  controllers: [InvoicingController],
  exports: [ElogoService, InvoicingService],
})
export class InvoicingModule {}
