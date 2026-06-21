import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PayTRService } from './paytr.service';

@Module({
  imports: [ConfigModule],
  providers: [PayTRService],
  exports: [PayTRService],
})
export class PaymentProvidersModule {}
