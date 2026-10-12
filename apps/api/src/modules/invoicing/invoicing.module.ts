import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { BullModule } from "@nestjs/bull";
import { QUEUE_NAMES } from "../../workers/constants";
import { ElogoService, ELOGO_SOAP_CLIENT } from "./elogo.service";
import { InvoicingService } from "./invoicing.service";
import { InvoiceQueryService } from "./invoice-query.service";
import { InvoiceDocumentService } from "./invoice-document.service";
import { InvoiceDeliveryService } from "./invoice-delivery.service";
import { FiscalInvoicePdfService } from "./pdf/fiscal-invoice-pdf.service";
import { InvoiceIssuingService } from "./invoice-issuing.service";
import { InvoiceReversalService } from "./invoice-reversal.service";
import { InvoiceSchedulerService } from "./jobs/invoice-scheduler.service";
import { InvoiceScheduledProcessor } from "./jobs/invoice-scheduled.processor";
import { InvoicingController } from "./invoicing.controller";
import {
  E_INVOICE_PROVIDER,
  type EInvoiceProvider,
} from "./provider/e-invoice-provider";
import { ElogoInvoiceProvider } from "./provider/elogo.provider";
import { NetsisInvoiceProvider } from "./provider/netsis.provider";
import { InvoiceProviderRegistry } from "./provider/provider-registry";
import { NetsisInvoiceSettingsService } from "./provider/netsis-invoice-settings.service";
import { invoiceProviderName } from "../../config/invoice-provider";
import { NetsisModule } from "../netsis/netsis.module";
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
 * üzerinden görür; bağlama `INVOICE_PROVIDER` ile eLogo ya da Netsis'tir
 * (docs/INVOICING_PROVIDERS.md).
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
    // Netsis (ERP) sağlayıcısı `NetsisClientFacade`'i kullanır.
    NetsisModule,
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
    // İki sağlayıcı da kayıtlı: yeni kesimler `INVOICE_PROVIDER`'ın seçtiğinden
    // geçer, kesilmiş kayıtların durum/iptal/PDF işlemleri kaydın kendi
    // sağlayıcısından (`InvoiceProviderRegistry`).
    ElogoInvoiceProvider,
    NetsisInvoiceProvider,
    InvoiceProviderRegistry,
    // Netsis ayarlarının admin okuma/yazma kapısı (Faturalama Ayarları ekranı).
    NetsisInvoiceSettingsService,
    {
      provide: E_INVOICE_PROVIDER,
      useFactory: (registry: InvoiceProviderRegistry): EInvoiceProvider =>
        registry.get(invoiceProviderName()),
      inject: [InvoiceProviderRegistry],
    },
    InvoicingService,
    InvoiceQueryService,
    InvoiceDocumentService,
    InvoiceDeliveryService,
    // Sağlayıcının PDF vermediği (Netsis) kayıtların görsel kopyası.
    FiscalInvoicePdfService,
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
  exports: [ElogoService, InvoicingService, NetsisInvoiceSettingsService],
})
export class InvoicingModule {}
