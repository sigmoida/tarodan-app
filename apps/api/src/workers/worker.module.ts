/**
 * BullMQ Worker Module
 * Centralized queue management for background job processing
 */
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule, ConfigService } from '@nestjs/config';

// Workers
import { EmailWorker } from './email.worker';
import { PushWorker } from './push.worker';
import { ImageWorker } from './image.worker';
import { PaymentWorker } from './payment.worker';
import { ShippingWorker } from './shipping.worker';
import { SearchWorker } from './search.worker';
import { AnalyticsWorker } from './analytics.worker';

// Prisma for database access
import { PrismaModule } from '../prisma/prisma.module';
import { PaymentModule } from '../modules/payment/payment.module';
import { QUEUE_NAMES } from './constants';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    PaymentModule,
    // Configure BullMQ with Redis connection
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        redis: {
          host: configService.get('REDIS_HOST', 'localhost'),
          port: configService.get('REDIS_PORT', 6379),
          password: configService.get('REDIS_PASSWORD'),
        },
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 50,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        },
      }),
      inject: [ConfigService],
    }),
    // Register all queues
    BullModule.registerQueue(
      { name: QUEUE_NAMES.EMAIL },
      { name: QUEUE_NAMES.PUSH },
      { name: QUEUE_NAMES.IMAGE },
      { name: QUEUE_NAMES.PAYMENT },
      { name: QUEUE_NAMES.SHIPPING },
      { name: QUEUE_NAMES.SEARCH },
      { name: QUEUE_NAMES.ANALYTICS },
    ),
  ],
  providers: [
    EmailWorker,
    PushWorker,
    ImageWorker,
    PaymentWorker,
    ShippingWorker,
    SearchWorker,
    AnalyticsWorker,
  ],
  exports: [BullModule],
})
export class WorkerModule { }
