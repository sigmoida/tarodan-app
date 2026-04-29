import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../../prisma';
import { PaymentModule } from '../payment/payment.module';
import { SuratCargoModule } from '../surat-cargo/surat-cargo.module';
import { RefundController } from './refund.controller';
import { RefundService } from './refund.service';
import { RefundSchedulerService } from './refund-scheduler.service';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    SuratCargoModule,
    forwardRef(() => PaymentModule),
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
  exports: [RefundService],
})
export class RefundModule {}
