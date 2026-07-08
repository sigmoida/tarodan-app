import { Module } from '@nestjs/common';
import { CollectionController } from './collection.controller';
import { CollectionService } from './collection.service';
import { CollectionCommonService } from './collection-common.service';
import { CollectionCrudService } from './collection-crud.service';
import { CollectionCoverService } from './collection-cover.service';
import { CollectionItemsService } from './collection-items.service';
import { CollectionSocialService } from './collection-social.service';
import { PrismaModule } from '../../prisma';
import { MembershipModule } from '../membership/membership.module';
import { MediaModule } from '../media/media.module';
import { NotificationModule } from '../notification/notification.module';
import { StorageModule } from '../storage/storage.module';
import { SearchModule } from '../search/search.module';
import { ModerationModule } from '../moderation/moderation.module';

@Module({
  imports: [PrismaModule, MembershipModule, MediaModule, StorageModule, SearchModule, ModerationModule, NotificationModule],
  controllers: [CollectionController],
  providers: [
    CollectionService,
    CollectionCommonService,
    CollectionCrudService,
    CollectionCoverService,
    CollectionItemsService,
    CollectionSocialService,
  ],
  exports: [CollectionService],
})
export class CollectionModule {}
