import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheModule } from '../cache/cache.module';
import { PrismaModule } from '../../prisma';
import { SuratCargoService, SURAT_SOAP_CLIENT } from './surat-cargo.service';
import { SuratTrackingService } from './surat-tracking.service';
import {
  StubSuratSoapClient,
  LiveSuratSoapClient,
  SuratSoapClient,
} from './surat-soap.client';

@Module({
  imports: [ConfigModule, CacheModule, PrismaModule],
  providers: [
    {
      provide: SURAT_SOAP_CLIENT,
      useFactory: (config: ConfigService): SuratSoapClient => {
        const mode = config.get<string>('SURAT_SOAP_MODE', 'stub')?.trim().toLowerCase();
        return mode === 'live'
          ? new LiveSuratSoapClient(config)
          : new StubSuratSoapClient(config);
      },
      inject: [ConfigService],
    },
    SuratCargoService,
    SuratTrackingService,
  ],
  exports: [SuratCargoService, SuratTrackingService],
})
export class SuratCargoModule {}
