import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ShippingController } from './shipping.controller';
import { ShippingService } from './shipping.service';
import { PrismaModule } from '../../prisma';
import { PaymentModule } from '../payment/payment.module';

@Module({
  imports: [PrismaModule, ConfigModule, PaymentModule],
  controllers: [ShippingController],
  providers: [ShippingService],
  exports: [ShippingService],
})
export class ShippingModule {}
