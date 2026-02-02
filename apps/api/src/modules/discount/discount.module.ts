import { Module } from '@nestjs/common';
import { DiscountController } from './discount.controller';
import { DiscountService } from './discount.service';
import { DiscountCalculator } from './discount-calculator';
import { PrismaModule } from '../../prisma';

@Module({
  imports: [PrismaModule],
  controllers: [DiscountController],
  providers: [DiscountService, DiscountCalculator],
  exports: [DiscountService, DiscountCalculator],
})
export class DiscountModule {}
