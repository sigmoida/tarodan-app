import { Module, forwardRef } from '@nestjs/common';
import { CollectionController } from './collection.controller';
import { CollectionService } from './collection.service';
import { PrismaModule } from '../../prisma';
import { MembershipModule } from '../membership/membership.module';
import { MediaModule } from '../media/media.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [PrismaModule, MembershipModule, MediaModule, forwardRef(() => NotificationModule)],
  controllers: [CollectionController],
  providers: [CollectionService],
  exports: [CollectionService],
})
export class CollectionModule {}
