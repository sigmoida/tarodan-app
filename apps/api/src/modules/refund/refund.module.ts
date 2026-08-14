import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { BullModule } from "@nestjs/bull";
import { PrismaModule } from "../../prisma";
import { QUEUE_NAMES } from "../../workers/constants";
import { PaymentModule } from "../payment/payment.module";
import { DiscountModule } from "../discount";
import { SuratCargoModule } from "../surat-cargo/surat-cargo.module";
import { NotificationModule } from "../notification/notification.module";
import { StorageModule } from "../storage/storage.module";
import { ShippingTariffModule } from "../shipping/shipping-tariff.module";
import { RefundController } from "./refund.controller";
import { RefundService } from "./refund.service";
import { RefundNotificationService } from "./refund-notification.service";
import { RefundSchedulerService } from "./refund-scheduler.service";
import { RefundScheduledProcessor } from "./refund-scheduled.processor";
import { scheduledProcessors } from "../../workers/scheduled-processors";

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    SuratCargoModule,
    StorageModule,
    ShippingTariffModule,
    PaymentModule,
    // Kusursuz alıcıya kupon iadesi için (indirim-teknik §6).
    DiscountModule,
    NotificationModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.SCHEDULED }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>("JWT_SECRET"),
        signOptions: { expiresIn: "15m" },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [RefundController],
  providers: [
    RefundService,
    RefundNotificationService,
    RefundSchedulerService,
    ...scheduledProcessors(RefundScheduledProcessor),
  ],
  exports: [RefundService, RefundSchedulerService],
})
export class RefundModule {}
