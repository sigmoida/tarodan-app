import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PayTRService } from './paytr.service';
import { ArasKargoService } from './aras-kargo.service';
import { YurticiKargoService } from './yurtici-kargo.service';

@Module({
  imports: [ConfigModule],
  providers: [PayTRService, ArasKargoService, YurticiKargoService],
  exports: [PayTRService, ArasKargoService, YurticiKargoService],
})
export class PaymentProvidersModule {}
