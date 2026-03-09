import { Module, forwardRef } from '@nestjs/common';
import { CollectionController } from './collection.controller';
import { CollectionService } from './collection.service';
import { PrismaModule } from '../../prisma';
import { MembershipModule } from '../membership/membership.module';
import { MediaModule } from '../media/media.module';
import { NotificationModule } from '../notification/notification.module';
import { StorageModule } from '../storage/storage.module';
import { SearchModule } from '../search/search.module';

@Module({
  imports: [PrismaModule, MembershipModule, MediaModule, StorageModule, SearchModule, forwardRef(() => NotificationModule)],
  controllers: [CollectionController],
  providers: [CollectionService],
  exports: [CollectionService],
})
export class CollectionModule {}
