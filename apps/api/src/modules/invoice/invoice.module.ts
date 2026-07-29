import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { InvoiceService } from "./invoice.service";
import { InvoicePdfService } from "./invoice-pdf.service";
import { InvoiceController } from "./invoice.controller";
import { PrismaModule } from "../../prisma";
import { StorageModule } from "../storage/storage.module";
import { NotificationModule } from "../notification/notification.module";
import { TaxModule } from "../tax";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    StorageModule,
    NotificationModule,
    TaxModule,
    AuthModule,
  ],
  controllers: [InvoiceController],
  providers: [InvoiceService, InvoicePdfService],
  exports: [InvoiceService],
})
export class InvoiceModule {}
