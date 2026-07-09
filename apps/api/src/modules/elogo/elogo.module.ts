import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bull';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ElogoService, ELOGO_SOAP_CLIENT } from './elogo.service';
import { ElogoInvoicingService } from './elogo-invoicing.service';
import { ElogoSchedulerService } from './elogo-scheduler.service';
import { ElogoScheduledProcessor } from './elogo-scheduled.processor';
import { ElogoInvoiceController } from './elogo-invoice.controller';
import { StorageModule } from '../storage/storage.module';
import { TaxModule } from '../tax/tax.module';
import { SmtpProvider } from '../notification/providers/smtp.provider';
import { QUEUE_NAMES } from '../../workers/constants';
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
  imports: [
    ConfigModule,
    ScheduleModule.forRoot(),
    StorageModule,
    TaxModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.SCHEDULED }),
  ],
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
    ElogoScheduledProcessor,
  ],
  controllers: [ElogoInvoiceController],
  exports: [ElogoService, ElogoInvoicingService],
})
export class ElogoModule {}
