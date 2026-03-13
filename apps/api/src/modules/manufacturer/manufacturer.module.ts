import { Module } from '@nestjs/common';
import { ManufacturerController } from './manufacturer.controller';
import { ManufacturerService } from './manufacturer.service';
import { PrismaModule } from '../../prisma';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [PrismaModule, StorageModule],
  controllers: [ManufacturerController],
  providers: [ManufacturerService],
  exports: [ManufacturerService],
})
export class ManufacturerModule {}
