import { Module } from '@nestjs/common';
import { CollectionController } from './collection.controller';
import { CollectionService } from './collection.service';
import { PrismaModule } from '../../prisma';
import { MembershipModule } from '../membership/membership.module';

@Module({
  imports: [PrismaModule, MembershipModule],
  controllers: [CollectionController],
  providers: [CollectionService],
  exports: [CollectionService],
})
export class CollectionModule {}
