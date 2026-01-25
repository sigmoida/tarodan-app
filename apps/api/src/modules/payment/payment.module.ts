import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { PaymentSchedulerService } from './payment-scheduler.service';
import { PrismaModule } from '../../prisma';
import { PaymentProvidersModule } from '../payment-providers';
import { EventModule } from '../events';
import { RawBodyMiddleware } from './middleware/raw-body.middleware';
import { InvoiceModule } from '../invoice/invoice.module';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    PaymentProvidersModule,
    EventModule,
    ScheduleModule.forRoot(),
    InvoiceModule,
  ],
  controllers: [PaymentController],
  providers: [PaymentService, PaymentSchedulerService, RawBodyMiddleware],
  exports: [PaymentService],
})
export class PaymentModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RawBodyMiddleware)
      .forRoutes('payments/callback/iyzico', 'payments/callback/paytr');
  }
}
