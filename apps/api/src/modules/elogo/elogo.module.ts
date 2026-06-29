import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ElogoService, ELOGO_SOAP_CLIENT } from './elogo.service';
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
  imports: [ConfigModule],
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
    ElogoService,
  ],
  exports: [ElogoService],
})
export class ElogoModule {}
