import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheModule } from '../cache/cache.module';
import { SuratCargoService, SURAT_SOAP_CLIENT } from './surat-cargo.service';
import {
  StubSuratSoapClient,
  LiveSuratSoapClient,
  SuratSoapClient,
} from './surat-soap.client';

@Module({
  imports: [ConfigModule, CacheModule],
  providers: [
    {
      provide: SURAT_SOAP_CLIENT,
      useFactory: (config: ConfigService): SuratSoapClient => {
        const mode = config.get<string>('SURAT_SOAP_MODE', 'stub')?.trim().toLowerCase();
        return mode === 'live' ? new LiveSuratSoapClient() : new StubSuratSoapClient(config);
      },
      inject: [ConfigService],
    },
    SuratCargoService,
  ],
  exports: [SuratCargoService],
})
export class SuratCargoModule {}
