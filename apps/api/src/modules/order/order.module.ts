import { Module, forwardRef } from '@nestjs/common';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';
import { PrismaModule } from '../../prisma';
import { EventModule } from '../events';
import { NotificationModule } from '../notification/notification.module';
import { DiscountModule } from '../discount';
import { StorageModule } from '../storage/storage.module';
import { SuratCargoModule } from '../surat-cargo/surat-cargo.module';
import { ProductModule } from '../product/product.module';

@Module({
  imports: [
    PrismaModule,
    EventModule,
    forwardRef(() => NotificationModule),
    DiscountModule,
    StorageModule,
    SuratCargoModule,
    ProductModule,
  ],
  controllers: [OrderController],
  providers: [OrderService],
  exports: [OrderService],
})
export class OrderModule {}
