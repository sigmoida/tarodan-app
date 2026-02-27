import { Module } from '@nestjs/common';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';
import { PrismaModule } from '../../prisma';
import { DiscountModule } from '../discount';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [PrismaModule, DiscountModule, StorageModule],
  controllers: [CartController],
  providers: [CartService],
  exports: [CartService],
})
export class CartModule {}
