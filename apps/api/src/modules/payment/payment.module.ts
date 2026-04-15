import { Module, NestModule, MiddlewareConsumer, forwardRef } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { PaymentSchedulerService } from './payment-scheduler.service';
import { PrismaModule } from '../../prisma';
import { CacheModule } from '../cache/cache.module';
import { PaymentProvidersModule } from '../payment-providers';
import { EventModule } from '../events';
import { RawBodyMiddleware } from './middleware/raw-body.middleware';
import { InvoiceModule } from '../invoice/invoice.module';
import { ProductModule } from '../product/product.module';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    CacheModule,
    PaymentProvidersModule,
    EventModule,
    ScheduleModule.forRoot(),
    InvoiceModule,
    forwardRef(() => ProductModule),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '15m' },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [PaymentController],
  providers: [PaymentService, PaymentSchedulerService, RawBodyMiddleware],
  exports: [PaymentService],
})
export class PaymentModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RawBodyMiddleware)
      .forRoutes('payments/callback/paytr');
  }
}
