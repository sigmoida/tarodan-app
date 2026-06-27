import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../../prisma';
import { PaymentModule } from '../payment/payment.module';
import { SuratCargoModule } from '../surat-cargo/surat-cargo.module';
import { NotificationModule } from '../notification/notification.module';
import { StorageModule } from '../storage/storage.module';
import { RefundController } from './refund.controller';
import { RefundService } from './refund.service';
import { RefundSchedulerService } from './refund-scheduler.service';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    SuratCargoModule,
    StorageModule,
    forwardRef(() => PaymentModule),
    NotificationModule,
    ScheduleModule.forRoot(),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '15m' },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [RefundController],
  providers: [RefundService, RefundSchedulerService],
  exports: [RefundService, RefundSchedulerService],
})
export class RefundModule {}
