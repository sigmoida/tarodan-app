import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { SearchIndexingService } from './search-indexing.service';
import { PrismaModule } from '../../prisma';
import { StorageModule } from '../storage/storage.module';
import { QUEUE_NAMES } from '../../workers/constants';

@Module({
  imports: [
    PrismaModule,
    StorageModule,
    ConfigModule,
    ScheduleModule.forRoot(),
    BullModule.registerQueue({ name: QUEUE_NAMES.SEARCH }),
  ],
  controllers: [SearchController],
  providers: [SearchService, SearchIndexingService],
  exports: [SearchService, SearchIndexingService],
})
export class SearchModule {}
