import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bull";
import { ConfigModule } from "@nestjs/config";
import { SearchController } from "./search.controller";
import { SearchService } from "./search.service";
import { SearchCommonService } from "./search-common.service";
import { SearchProductService } from "./query/search-product.service";
import { SearchAutocompleteService } from "./query/search-autocomplete.service";
import { SearchCollectionService } from "./query/search-collection.service";
import { SearchSyncService } from "./indexing/search-sync.service";
import { SearchIndexingService } from "./indexing/search-indexing.service";
import { SearchSyncListener } from "./indexing/search-sync.listener";
import { SearchScheduledProcessor } from "./jobs/search-scheduled.processor";
import { PrismaModule } from "../../prisma";
import { StorageModule } from "../storage/storage.module";
import { QUEUE_NAMES } from "../../workers/constants";
import { scheduledProcessors } from "../../workers/scheduled-processors";

import { UserBlockModule } from "../user-block/user-block.module";

@Module({
  imports: [
    PrismaModule,
    StorageModule,
    ConfigModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.SEARCH }),
    BullModule.registerQueue({ name: QUEUE_NAMES.SCHEDULED }),
    UserBlockModule,
  ],
  controllers: [SearchController],
  providers: [
    SearchService,
    SearchCommonService,
    SearchProductService,
    SearchAutocompleteService,
    SearchCollectionService,
    SearchSyncService,
    SearchIndexingService,
    SearchSyncListener,
    ...scheduledProcessors(SearchScheduledProcessor),
  ],
  exports: [SearchService, SearchIndexingService],
})
export class SearchModule {}
