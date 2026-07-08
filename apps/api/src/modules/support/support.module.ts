import { Module } from '@nestjs/common';
import { SupportController } from './support.controller';
import { SupportService } from './support.service';
import { PrismaModule } from '../../prisma';
import { CacheModule } from '../cache/cache.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [PrismaModule, CacheModule, NotificationModule],
  controllers: [SupportController],
  providers: [SupportService],
  exports: [SupportService],
})
export class SupportModule {}
