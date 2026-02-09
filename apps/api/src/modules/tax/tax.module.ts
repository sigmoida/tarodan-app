import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma';
import { TaxService } from './tax.service';
import { TaxController } from './tax.controller';

@Module({
  imports: [PrismaModule],
  controllers: [TaxController],
  providers: [TaxService],
  exports: [TaxService],
})
export class TaxModule {}
