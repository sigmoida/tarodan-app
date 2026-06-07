import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma';
import { CommissionLedgerService } from './commission-ledger.service';

@Module({
  imports: [PrismaModule],
  providers: [CommissionLedgerService],
  exports: [CommissionLedgerService],
})
export class CommissionModule {}
