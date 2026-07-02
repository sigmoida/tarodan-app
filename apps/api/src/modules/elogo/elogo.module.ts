import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ElogoService, ELOGO_SOAP_CLIENT } from './elogo.service';
import { ElogoInvoicingService } from './elogo-invoicing.service';
import { ElogoSchedulerService } from './elogo-scheduler.service';
import { ElogoInvoiceController } from './elogo-invoice.controller';
import { StorageModule } from '../storage/storage.module';
import { TaxModule } from '../tax/tax.module';
import { SmtpProvider } from '../notification/providers/smtp.provider';
import {
  ElogoSoapClient,
  LiveElogoSoapClient,
  StubElogoSoapClient,
} from './elogo-soap.client';

/**
 * eLogo e-Belge entegrasyon modülü.
 * Sürat Kargo modülüyle aynı desen: SOAP client factory ile (ELOGO_SOAP_MODE)
 * stub/live arasında seçilir; ElogoService dışarı export edilir.
 */
@Module({
  imports: [ConfigModule, ScheduleModule.forRoot(), StorageModule, TaxModule],
  providers: [
    {
      provide: ELOGO_SOAP_CLIENT,
      useFactory: (config: ConfigService): ElogoSoapClient => {
        const mode = config.get<string>('ELOGO_SOAP_MODE', 'stub')?.trim().toLowerCase();
        return mode === 'live'
          ? new LiveElogoSoapClient(config)
          : new StubElogoSoapClient(config);
      },
      inject: [ConfigService],
    },
    SmtpProvider,
    ElogoService,
    ElogoInvoicingService,
    ElogoSchedulerService,
  ],
  controllers: [ElogoInvoiceController],
  exports: [ElogoService, ElogoInvoicingService],
})
export class ElogoModule {}
