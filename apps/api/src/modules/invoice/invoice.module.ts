import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { InvoiceService } from './invoice.service';
import { InvoiceController } from './invoice.controller';
import { PrismaModule } from '../../prisma';
import { StorageModule } from '../storage/storage.module';
import { NotificationModule } from '../notification/notification.module';
import { TaxModule } from '../tax';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    StorageModule,
    NotificationModule,
    TaxModule,
  ],
  controllers: [InvoiceController],
  providers: [InvoiceService],
  exports: [InvoiceService],
})
export class InvoiceModule {}
