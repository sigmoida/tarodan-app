import { Module, NestModule, MiddlewareConsumer, forwardRef } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bull';
import { PaymentController } from './payment.controller';
import { PaytrCallbackAliasController } from './paytr-callback-alias.controller';
import { PaymentService } from './payment.service';
import { PaymentQueryService } from './payment-query.service';
import { PaymentCommonService } from './payment-common.service';
import { PaymentRefundService } from './payment-refund.service';
import { PaymentSchedulerService } from './payment-scheduler.service';
import { PaymentScheduledProcessor } from './payment-scheduled.processor';
import { QUEUE_NAMES } from '../../workers/constants';
import { PrismaModule } from '../../prisma';
import { CacheModule } from '../cache/cache.module';
import { PaymentProvidersModule } from '../payment-providers';
import { EventModule } from '../events';
import { RawBodyMiddleware } from './middleware/raw-body.middleware';
import { InvoiceModule } from '../invoice/invoice.module';
import { ProductModule } from '../product/product.module';
import { NotificationModule } from '../notification/notification.module';
import { PayoutModule } from '../payout/payout.module';
import { SuratCargoModule } from '../surat-cargo/surat-cargo.module';
import { CommissionModule } from '../commission/commission.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    CacheModule,
    PaymentProvidersModule,
    EventModule,
    ScheduleModule.forRoot(),
    InvoiceModule,
    NotificationModule,
    PayoutModule,
    SuratCargoModule,
    CommissionModule,
    StorageModule,
    forwardRef(() => ProductModule),
    BullModule.registerQueue({ name: QUEUE_NAMES.SCHEDULED }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '15m' },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [PaymentController, PaytrCallbackAliasController],
  providers: [PaymentService, PaymentQueryService, PaymentCommonService, PaymentRefundService, PaymentSchedulerService, PaymentScheduledProcessor, RawBodyMiddleware],
  exports: [PaymentService],
})
export class PaymentModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RawBodyMiddleware)
      .forRoutes('payments/callback/paytr');
  }
}
