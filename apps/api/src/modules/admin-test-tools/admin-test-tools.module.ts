import { Module } from '@nestjs/common';
import { AdminTestToolsController } from './admin-test-tools.controller';
import { AdminTestToolsService } from './admin-test-tools.service';
import { PaymentModule } from '../payment';
import { ProductModule } from '../product/product.module';
import { TradeModule } from '../trade/trade.module';
import { MembershipModule } from '../membership/membership.module';
import { OfferModule } from '../offer/offer.module';
import { RefundModule } from '../refund/refund.module';
import { AuthModule } from '../auth/auth.module';

/**
 * Admin Test Araçları modülü. Cron servisleri ilgili feature modüllerinden gelir
 * (yeni mantık yok). AuthModule guard'lar (AdminJwtAuthGuard/RolesGuard) için.
 */
@Module({
  imports: [
    PaymentModule,
    ProductModule,
    TradeModule,
    MembershipModule,
    OfferModule,
    RefundModule,
    AuthModule,
  ],
  controllers: [AdminTestToolsController],
  providers: [AdminTestToolsService],
})
export class AdminTestToolsModule {}
